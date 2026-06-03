"""Nightly corpus refresh pipeline — run via Supabase pg_cron."""
import asyncio
from backend.core.database import init_db
from backend.rag.corpus.loaders.load_icd10 import load_from_dataset as load_icd10


async def run():
    await init_db()
    print("=== Nightly corpus refresh ===")
    load_icd10(limit=1000)
    print("=== Done ===")


if __name__ == "__main__":
    asyncio.run(run())
