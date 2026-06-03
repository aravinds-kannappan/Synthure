"""
Load MTSamples medical transcription notes into pgvector RAG corpus.

Dataset: harishnair04/mtsamples (verified: 4,999 rows)
Real schema (verified):
  - 'transcription'      → full clinical note text (11-18.4k chars)
  - 'description'        → brief summary of the case
  - 'medical_specialty'  → 40 specialty classes
  - 'sample_name'        → case title
  - 'keywords'           → associated medical terms
"""
import sys
from backend.core.database import get_db
from backend.rag.embedder import embed
from backend.rag.chunker import chunk_text


def load_from_dataset(limit: int = 200):
    try:
        from datasets import load_dataset
        ds = load_dataset("harishnair04/mtsamples", split=f"train[:{limit}]")
    except Exception as e:
        print(f"Dataset load failed: {e}")
        return

    db = get_db()
    if db is None:
        print("Database not available")
        return

    loaded = 0
    for i, row in enumerate(ds):
        transcription = (row.get("transcription") or "").strip()
        description   = (row.get("description") or "").strip()
        specialty     = (row.get("medical_specialty") or "").strip()
        sample_name   = (row.get("sample_name") or "").strip()
        if not transcription:
            continue

        # Chunk long transcriptions
        chunks = chunk_text(transcription)
        for j, chunk in enumerate(chunks):
            embedding = embed(chunk)
            if embedding is None:
                continue
            doc_id = f"mtsamples_{i}_{j}"
            try:
                db.table("embeddings").upsert({
                    "doc_id": doc_id,
                    "doc_type": "clinical_note",
                    "content": chunk,
                    "embedding": embedding,
                    "metadata": {
                        "specialty": specialty,
                        "sample_name": sample_name,
                        "description": description[:200],
                        "chunk_index": j,
                    },
                }, on_conflict="doc_id").execute()
                loaded += 1
            except Exception as e:
                print(f"Insert failed for {doc_id}: {e}")

    print(f"Loaded {loaded} MTSamples chunks into pgvector")


if __name__ == "__main__":
    from backend.core.database import init_db
    import asyncio
    asyncio.run(init_db())
    load_from_dataset(limit=int(sys.argv[1]) if len(sys.argv) > 1 else 200)
