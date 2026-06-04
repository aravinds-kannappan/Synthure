"""
Load ICD-10-CM code/description pairs into pgvector.

Dataset: wangyichen25/ICD-10-CM_Code-Description_Pairs (verified: 1.43M rows)
Real schema (verified):
  - 'output'  → ICD-10 code  (e.g. 'A000')
  - 'input'   → clinical description  (e.g. 'Cholera due to Vibrio cholerae...')
  - 'type'    → 'desc_to_code'
  - 'format'  → task format string

Previous code used row.get('code') / row.get('description') which would have
returned empty strings on every row.
"""
import sys
from backend.core.database import get_db
from backend.rag.embedder import embed


def load_from_dataset(limit: int = 500):
    try:
        from datasets import load_dataset
        ds = load_dataset(
            "wangyichen25/ICD-10-CM_Code-Description_Pairs",
            split=f"train[:{limit}]",
        )
    except Exception as e:
        print(f"Dataset load failed: {e}")
        return

    db = get_db()
    if db is None:
        print("Database not available")
        return

    loaded = 0
    for row in ds:
        # Verified column names from schema: output=code, input=description
        code = (row.get("output") or "").strip()
        desc = (row.get("input") or "").strip()
        if not code or not desc:
            continue
        # Skip rows where 'type' is not desc_to_code (some rows are code_to_desc)
        if row.get("type") not in ("desc_to_code", None):
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
