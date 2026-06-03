"""
Load AGBonnet augmented clinical notes into pgvector RAG corpus.

Dataset: AGBonnet/augmented-clinical-notes (verified: 30,000 rows)
Real schema (verified):
  - 'full_note'    → complete clinical note from PMC-Patients
  - 'note'         → possibly truncated version used in NoteChat
  - 'conversation' → patient-doctor dialogue (GPT-3.5 generated)
  - 'summary'      → structured patient info in JSON (GPT-4 generated)
  - 'idx'          → unique identifier
"""
import sys
from backend.core.database import get_db
from backend.rag.embedder import embed
from backend.rag.chunker import chunk_text


def load_from_dataset(limit: int = 500):
    try:
        from datasets import load_dataset
        ds = load_dataset("AGBonnet/augmented-clinical-notes", split=f"train[:{limit}]")
    except Exception as e:
        print(f"Dataset load failed: {e}")
        return

    db = get_db()
    if db is None:
        print("Database not available")
        return

    loaded = 0
    for row in ds:
        # Prefer full_note; fall back to note
        text = (row.get("full_note") or row.get("note") or "").strip()
        if not text:
            continue
        idx = row.get("idx", "")
        chunks = chunk_text(text)
        for j, chunk in enumerate(chunks):
            embedding = embed(chunk)
            if embedding is None:
                continue
            doc_id = f"clinical_note_{idx}_{j}"
            try:
                db.table("embeddings").upsert({
                    "doc_id": doc_id,
                    "doc_type": "clinical_note",
                    "content": chunk,
                    "embedding": embedding,
                    "metadata": {"source": "AGBonnet/augmented-clinical-notes", "idx": str(idx), "chunk": j},
                }, on_conflict="doc_id").execute()
                loaded += 1
            except Exception as e:
                print(f"Insert failed for {doc_id}: {e}")

    print(f"Loaded {loaded} clinical note chunks into pgvector")


if __name__ == "__main__":
    from backend.core.database import init_db
    import asyncio
    asyncio.run(init_db())
    load_from_dataset(limit=int(sys.argv[1]) if len(sys.argv) > 1 else 500)
