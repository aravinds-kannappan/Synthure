"""
Medical dataset ingestion pipeline — loads HuggingFace datasets into Supabase pgvector.

Usage:
    python -m backend.rag.ingest                        # ingest all sources
    python -m backend.rag.ingest --source icd10         # single source
    python -m backend.rag.ingest --source icd10 --limit 500   # dev run

Env vars required:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
Optional:
    HF_TOKEN    — HuggingFace token for gated datasets

Sources and their HuggingFace paths:
    icd10                wangyichen25/ICD-10-CM_Code-Description_Pairs   (1.43M rows)
    mtsamples            harishnair04/mtsamples                           (4,999 rows)
    augmented_notes      AGBonnet/augmented-clinical-notes                (30,000 rows)
    transcription_instruct  DataFog/medical-transcription-instruct        (38,924 rows)
    symptoms_icd10       Inje/SYMPTOMS-COT-ICD10-2024                    (12,132 rows)
    icd10_clinical_notes birgermoell/icd10-clinical-notes                 (1,802 rows)
    cms_medicare         CMS open data API (no HuggingFace)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Iterator

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
HF_TOKEN = os.environ.get("HF_TOKEN") or None

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
BATCH_SIZE = 256


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_embedder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(EMBED_MODEL)


def _get_db():
    from supabase import create_client
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment"
        )
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def _embed_batch(model, texts: list[str]) -> list[list[float]]:
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return vecs.tolist()


def _upsert(db, rows: list[dict]) -> int:
    if not rows:
        return 0
    db.table("rag_documents").upsert(
        rows, on_conflict="source,external_id"
    ).execute()
    return len(rows)


def _batched(iterable, size: int) -> Iterator[list]:
    batch: list = []
    for item in iterable:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def _truncate(text: str | None, max_len: int = 2000) -> str:
    if not text:
        return ""
    return text[:max_len]


# ── ICD-10 codes (1.43M rows) ─────────────────────────────────────────────────

def ingest_icd10(db, model, limit: int | None = None) -> None:
    """wangyichen25/ICD-10-CM_Code-Description_Pairs — columns: output (code), input (description)"""
    from datasets import load_dataset
    from tqdm import tqdm

    ds = load_dataset(
        "wangyichen25/ICD-10-CM_Code-Description_Pairs", split="train", token=HF_TOKEN
    )
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    total = 0
    for batch in tqdm(list(_batched(ds, BATCH_SIZE)), desc="icd10", unit="batch"):
        texts = [f"{r['output']}: {r['input']}" for r in batch]
        embeddings = _embed_batch(model, texts)
        rows = [
            {
                "source": "icd10",
                "doc_type": "medical_code",
                "external_id": r["output"],
                "code": r["output"],
                "title": r["output"],
                "content": r["input"],
                "metadata": {},
                "embedding": emb,
            }
            for r, emb in zip(batch, embeddings)
        ]
        total += _upsert(db, rows)
    print(f"  icd10: {total:,} rows")


# ── MT Samples clinical notes (4,999 rows) ───────────────────────────────────

def ingest_mtsamples(db, model, limit: int | None = None) -> None:
    """harishnair04/mtsamples — columns: transcription, medical_specialty, description"""
    from datasets import load_dataset
    from tqdm import tqdm

    ds = load_dataset("harishnair04/mtsamples", split="train", token=HF_TOKEN)
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    total = 0
    for i, batch in enumerate(tqdm(list(_batched(ds, BATCH_SIZE)), desc="mtsamples", unit="batch")):
        texts = [
            f"{r.get('medical_specialty', '')}: {r.get('description', '')} "
            f"{(r.get('transcription') or '')[:400]}"
            for r in batch
        ]
        embeddings = _embed_batch(model, texts)
        rows = [
            {
                "source": "mtsamples",
                "doc_type": "clinical_note",
                "external_id": f"mt_{i * BATCH_SIZE + j}",
                "code": None,
                "title": r.get("medical_specialty") or "",
                "content": _truncate(r.get("transcription")),
                "metadata": {
                    "specialty": r.get("medical_specialty", ""),
                    "description": r.get("description", ""),
                },
                "embedding": emb,
            }
            for j, (r, emb) in enumerate(zip(batch, embeddings))
        ]
        total += _upsert(db, rows)
    print(f"  mtsamples: {total:,} rows")


# ── Augmented clinical notes (30,000 rows) ────────────────────────────────────

def ingest_augmented_notes(db, model, limit: int | None = None) -> None:
    """AGBonnet/augmented-clinical-notes — columns: full_note, idx"""
    from datasets import load_dataset
    from tqdm import tqdm

    ds = load_dataset("AGBonnet/augmented-clinical-notes", split="train", token=HF_TOKEN)
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    total = 0
    for batch in tqdm(list(_batched(ds, BATCH_SIZE)), desc="augmented_notes", unit="batch"):
        texts = [(r.get("full_note") or "")[:512] for r in batch]
        embeddings = _embed_batch(model, texts)
        rows = [
            {
                "source": "augmented_notes",
                "doc_type": "clinical_note",
                "external_id": str(r.get("idx", "")),
                "code": None,
                "title": None,
                "content": _truncate(r.get("full_note")),
                "metadata": {},
                "embedding": emb,
            }
            for r, emb in zip(batch, embeddings)
        ]
        total += _upsert(db, rows)
    print(f"  augmented_notes: {total:,} rows")


# ── Medical transcription instruct (38,924 rows) ──────────────────────────────

def ingest_transcription_instruct(db, model, limit: int | None = None) -> None:
    """DataFog/medical-transcription-instruct — columns: complexity_score (float), transcription"""
    from datasets import load_dataset
    from tqdm import tqdm

    ds = load_dataset("DataFog/medical-transcription-instruct", split="train", token=HF_TOKEN)
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    total = 0
    for i, batch in enumerate(
        tqdm(list(_batched(ds, BATCH_SIZE)), desc="transcription_instruct", unit="batch")
    ):
        texts = [(r.get("transcription") or "")[:512] for r in batch]
        embeddings = _embed_batch(model, texts)
        rows = [
            {
                "source": "transcription_instruct",
                "doc_type": "clinical_note",
                "external_id": f"datafog_{i * BATCH_SIZE + j}",
                "code": None,
                "title": None,
                "content": _truncate(r.get("transcription")),
                "metadata": {"complexity_score": float(r.get("complexity_score") or 0.0)},
                "embedding": emb,
            }
            for j, (r, emb) in enumerate(zip(batch, embeddings))
        ]
        total += _upsert(db, rows)
    print(f"  transcription_instruct: {total:,} rows")


# ── Symptom → ICD-10 COT mappings (12,132 rows) ───────────────────────────────

def ingest_symptoms_icd10(db, model, limit: int | None = None) -> None:
    """Inje/SYMPTOMS-COT-ICD10-2024 — columns: answer (code), symptoms, chain_of_thought"""
    from datasets import load_dataset
    from tqdm import tqdm

    ds = load_dataset("Inje/SYMPTOMS-COT-ICD10-2024", split="train", token=HF_TOKEN)
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    total = 0
    for i, batch in enumerate(
        tqdm(list(_batched(ds, BATCH_SIZE)), desc="symptoms_icd10", unit="batch")
    ):
        texts = [
            f"symptoms: {r.get('symptoms', '')} icd10: {r.get('answer', '')}"
            for r in batch
        ]
        embeddings = _embed_batch(model, texts)
        rows = [
            {
                "source": "symptoms_icd10",
                "doc_type": "symptom_mapping",
                "external_id": f"inje_{i * BATCH_SIZE + j}",
                "code": r.get("answer"),
                "title": r.get("answer"),
                "content": (
                    f"Symptoms: {r.get('symptoms', '')}\n\n"
                    f"Reasoning: {_truncate(r.get('chain_of_thought'), 1500)}"
                ),
                "metadata": {"icd10_code": r.get("answer", "")},
                "embedding": emb,
            }
            for j, (r, emb) in enumerate(zip(batch, embeddings))
        ]
        total += _upsert(db, rows)
    print(f"  symptoms_icd10: {total:,} rows")


# ── ICD-10 clinical notes / readmission (1,802 rows) ─────────────────────────

def ingest_icd10_clinical_notes(db, model, limit: int | None = None) -> None:
    """birgermoell/icd10-clinical-notes — columns: code, language, journal_note"""
    from datasets import load_dataset
    from tqdm import tqdm

    ds = load_dataset("birgermoell/icd10-clinical-notes", split="train", token=HF_TOKEN)
    if limit:
        ds = ds.select(range(min(limit, len(ds))))

    total = 0
    for i, batch in enumerate(
        tqdm(list(_batched(ds, BATCH_SIZE)), desc="icd10_clinical_notes", unit="batch")
    ):
        texts = [
            f"{r.get('code', '')}: {(r.get('journal_note') or '')[:512]}"
            for r in batch
        ]
        embeddings = _embed_batch(model, texts)
        rows = [
            {
                "source": "icd10_clinical_notes",
                "doc_type": "clinical_note",
                "external_id": f"birger_{i * BATCH_SIZE + j}",
                "code": r.get("code"),
                "title": r.get("code"),
                "content": _truncate(r.get("journal_note")),
                "metadata": {"language": r.get("language", "en")},
                "embedding": emb,
            }
            for j, (r, emb) in enumerate(zip(batch, embeddings))
        ]
        total += _upsert(db, rows)
    print(f"  icd10_clinical_notes: {total:,} rows")


# ── CMS Medicare payment benchmarks (live API — no embedding) ─────────────────

def ingest_cms_medicare(db, limit: int | None = None) -> None:
    """
    CMS Medicare Physician & Other Practitioners data.
    Stores avg payment per HCPCS/CPT code for revenue forecasting.
    No embedding needed — lookups are by exact code.
    """
    import httpx

    # Medicare Physician & Other Practitioners: by provider and service
    url = (
        "https://data.cms.gov/data-api/v1/dataset/"
        "9767cb68-8ea9-4f0b-8179-9431abc89f11/data"
    )
    page_size = min(limit or 5000, 5000)
    print("  Fetching CMS Medicare payment data...")
    try:
        with httpx.Client(timeout=60) as client:
            resp = client.get(url, params={"size": page_size, "offset": 0})
            resp.raise_for_status()
            data = resp.json()

        rows = []
        for rec in data:
            hcpcs = rec.get("hcpcs_cd") or rec.get("HCPCS_CD", "")
            desc = rec.get("hcpcs_desc") or rec.get("HCPCS_DESC", "")
            avg_pay = rec.get("avg_mdcr_pymt_amt") or rec.get("AVG_MDCR_PYMT_AMT", "")
            if not hcpcs:
                continue
            rows.append({
                "source": "cms_medicare",
                "doc_type": "payment_benchmark",
                "external_id": hcpcs,
                "code": hcpcs,
                "title": hcpcs,
                "content": f"CPT {hcpcs}: {desc}. Average Medicare payment: ${avg_pay}",
                "metadata": {
                    "avg_mdcr_pymt_amt": str(avg_pay),
                    "hcpcs_desc": desc,
                },
                "embedding": None,
            })

        total = 0
        for batch in _batched(rows, 500):
            total += _upsert(db, batch)
        print(f"  cms_medicare: {total:,} rows")

    except Exception as exc:
        print(f"  cms_medicare: SKIPPED — {exc}", file=sys.stderr)


# ── Entry point ───────────────────────────────────────────────────────────────

_HF_SOURCES: dict[str, object] = {
    "icd10": ingest_icd10,
    "mtsamples": ingest_mtsamples,
    "augmented_notes": ingest_augmented_notes,
    "transcription_instruct": ingest_transcription_instruct,
    "symptoms_icd10": ingest_symptoms_icd10,
    "icd10_clinical_notes": ingest_icd10_clinical_notes,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest medical datasets into Supabase pgvector"
    )
    parser.add_argument(
        "--source",
        choices=[*_HF_SOURCES.keys(), "cms_medicare", "all"],
        default="all",
        help="Which dataset to ingest (default: all)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max rows per dataset — use for dev/smoke-test runs",
    )
    args = parser.parse_args()

    db = _get_db()

    if args.source == "cms_medicare":
        ingest_cms_medicare(db, limit=args.limit)
        return

    print(f"Loading embedding model: {EMBED_MODEL}")
    model = _get_embedder()
    print("  Ready.\n")

    sources = _HF_SOURCES if args.source == "all" else {args.source: _HF_SOURCES[args.source]}

    t0 = time.monotonic()
    for name, fn in sources.items():
        print(f"Ingesting {name}...")
        fn(db, model, limit=args.limit)  # type: ignore[call-arg]

    if args.source == "all":
        print("\nIngesting cms_medicare...")
        ingest_cms_medicare(db, limit=args.limit)

    elapsed = time.monotonic() - t0
    print(f"\nFinished in {elapsed:.0f}s")


if __name__ == "__main__":
    main()
