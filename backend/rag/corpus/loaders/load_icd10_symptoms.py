"""
Load ICD-10 symptom → code chain-of-thought data into pgvector.

Dataset: Inje/SYMPTOMS-COT-ICD10-2024 (verified: 12,132 rows)
Real schema (verified):
  - 'answer'          → ICD-10 code (e.g. 'Z47.9')
  - 'question'        → brief clinical question
  - 'chain_of_thought'→ reasoning explanation (214-1490 chars)
  - 'symptoms'        → symptom description string

Useful for coding suggestions RAG — symptom query retrieves matching ICD-10 codes.
"""
import sys
from backend.core.database import get_db
from backend.rag.embedder import embed


def load_from_dataset(limit: int = 1000):
    try:
        from datasets import load_dataset
        ds = load_dataset("Inje/SYMPTOMS-COT-ICD10-2024", split=f"train[:{limit}]")
    except Exception as e:
        print(f"Dataset load failed: {e}")
        return

    db = get_db()
    if db is None:
        print("Database not available")
        return

    loaded = 0
    for i, row in enumerate(ds):
        code      = (row.get("answer") or "").strip()
        symptoms  = (row.get("symptoms") or "").strip()
        cot       = (row.get("chain_of_thought") or "").strip()
        question  = (row.get("question") or "").strip()
        if not code or not symptoms:
            continue

        # Index on symptoms so queries like "chest pain + dyspnea" retrieve matching codes
        content = f"{symptoms}\nChain of thought: {cot[:300]}"
        embedding = embed(symptoms[:512])
        if embedding is None:
            continue
        doc_id = f"icd10_cot_{i}"
        try:
            db.table("embeddings").upsert({
                "doc_id": doc_id,
                "doc_type": "medical_code",
                "content": content,
                "embedding": embedding,
                "metadata": {
                    "code": code,
                    "question": question,
                    "source": "Inje/SYMPTOMS-COT-ICD10-2024",
                },
            }, on_conflict="doc_id").execute()
            loaded += 1
        except Exception as e:
            print(f"Insert failed for {doc_id}: {e}")

    print(f"Loaded {loaded} symptom→ICD-10 CoT rows into pgvector")


if __name__ == "__main__":
    from backend.core.database import init_db
    import asyncio
    asyncio.run(init_db())
    load_from_dataset(limit=int(sys.argv[1]) if len(sys.argv) > 1 else 1000)
