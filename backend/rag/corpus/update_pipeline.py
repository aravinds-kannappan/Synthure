"""Nightly corpus refresh pipeline — run via Supabase pg_cron or manually."""
import asyncio
from backend.core.database import init_db
from backend.rag.corpus.loaders.load_icd10 import load_from_dataset as load_icd10
from backend.rag.corpus.loaders.load_icd10_symptoms import load_from_dataset as load_icd10_symptoms
from backend.rag.corpus.loaders.load_mtsamples import load_from_dataset as load_mtsamples
from backend.rag.corpus.loaders.load_clinical_notes import load_from_dataset as load_clinical_notes


async def run(icd10_limit=1000, symptoms_limit=2000, mtsamples_limit=200, notes_limit=300):
    await init_db()
    print("=== Nightly corpus refresh ===")
    print("Loading ICD-10-CM code/description pairs...")
    load_icd10(limit=icd10_limit)
    print("Loading ICD-10 symptom→code chain-of-thought...")
    load_icd10_symptoms(limit=symptoms_limit)
    print("Loading MTSamples clinical transcriptions...")
    load_mtsamples(limit=mtsamples_limit)
    print("Loading augmented clinical notes...")
    load_clinical_notes(limit=notes_limit)
    print("=== Done ===")


if __name__ == "__main__":
    asyncio.run(run())
