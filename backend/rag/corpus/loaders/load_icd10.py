"""Load ICD-10-CM code descriptions into pgvector embeddings table."""
import sys
from backend.core.database import get_db
from backend.rag.embedder import embed
from backend.rag.chunker import chunk_text


def load_from_dataset(limit: int = 500):
    """
    Load ICD-10 code/description pairs from HuggingFace dataset.
    Uses wangyichen25/ICD-10-CM_Code-Description_Pairs.
    """
    try:
        from datasets import load_dataset
        ds = load_dataset("wangyichen25/ICD-10-CM_Code-Description_Pairs", split=f"train[:{limit}]")
    except Exception as e:
        print(f"Dataset load failed: {e}")
        return

    db = get_db()
    if db is None:
        print("Database not available")
        return

    loaded = 0
    for row in ds:
        code = row.get("code") or row.get("Code", "")
        desc = row.get("description") or row.get("Description", "")
        if not code or not desc:
            continue
        text = f"{code}: {desc}"
        embedding = embed(text)
        if embedding is None:
            continue
        try:
            db.table("embeddings").upsert({
                "doc_id": f"icd10_{code.replace('.', '_')}",
                "doc_type": "medical_code",
                "content": text,
                "embedding": embedding,
                "metadata": {"code": code, "description": desc},
            }, on_conflict="doc_id").execute()
            loaded += 1
        except Exception as e:
            print(f"Insert failed for {code}: {e}")

    print(f"Loaded {loaded} ICD-10 codes into pgvector")


if __name__ == "__main__":
    from backend.core.database import init_db
    import asyncio
    asyncio.run(init_db())
    load_from_dataset(limit=int(sys.argv[1]) if len(sys.argv) > 1 else 500)
