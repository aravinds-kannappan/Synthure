"""Open-license corpus loaders (stdlib only, mirroring scripts/build_knowledge).

Sources (all open license, no access gates):
  * MTSamples       real dictated notes, each tagged with a report type / specialty
                    -> the anchor for note-type conditioning and gold labels.
  * MedSecId        human section annotations on real notes -> section spans and
                    more real discharge-summary text.
  * PMC Open Access case reports (CC-BY) -> optional extra text to broaden the
                    generator's clinical vocabulary (unlabeled, LM pretraining only).

Downloads use urllib and cache under ml/data_engine/.cache, the same pattern as
scripts/build_knowledge/build.py. Each loader also accepts a local path, so a
one-time manual download works offline. Network fetching runs in Colab or a local
prep step; nothing here requires a credential.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import urllib.request
from pathlib import Path

from schema import NoteRecord, NOTE_TYPES
from labels import note_type_from_metadata, sections_from_medsecid

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "ml" / "data_engine" / ".cache"
UA = "Synthure-data-engine/1.0 (research prototype; contact repository owner)"


def http_get(url: str, ttl_note: str = "") -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".bin")
    if key.exists():
        return key.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 (documented public sources)
        data = resp.read()
    key.write_bytes(data)
    return data


# ── MTSamples ─────────────────────────────────────────────────────────────────
def load_mtsamples(csv_path: str | Path | None = None, url: str | None = None) -> list[NoteRecord]:
    """Load MTSamples from a local CSV (columns: sample_name, medical_specialty,
    transcription) or from a configured URL. Rows whose type does not map cleanly
    are dropped so the note_type label stays gold."""
    if csv_path and Path(csv_path).exists():
        raw = Path(csv_path).read_text(encoding="utf-8", errors="ignore")
    elif url:
        raw = http_get(url).decode("utf-8", errors="ignore")
    else:
        raise FileNotFoundError(
            "MTSamples not found. Pass csv_path=<mtsamples.csv> (one-time download) or url=<mirror>."
        )
    out: list[NoteRecord] = []
    for row in csv.DictReader(io.StringIO(raw)):
        text = (row.get("transcription") or "").strip()
        if len(text) < 80:
            continue
        nt = note_type_from_metadata(row.get("sample_name", ""), row.get("medical_specialty", ""))
        if nt is None:
            continue
        out.append(
            NoteRecord(
                note=text,
                note_type=nt,
                source="mtsamples",
                meta={"specialty": row.get("medical_specialty", ""), "sample_name": row.get("sample_name", "")},
            )
        )
    return out


# ── MedSecId ──────────────────────────────────────────────────────────────────
def load_medsecid(json_path: str | Path | None = None) -> list[NoteRecord]:
    """Load MedSecId annotated notes from a local JSON export produced by its
    release tooling: a list of {text, note_type, sections:[{name,label,start,end}]}."""
    if not (json_path and Path(json_path).exists()):
        raise FileNotFoundError("MedSecId not found. Pass json_path=<medsecid.json> (one-time export).")
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    out: list[NoteRecord] = []
    for row in data:
        text = (row.get("text") or "").strip()
        nt = row.get("note_type")
        if len(text) < 80 or nt not in NOTE_TYPES:
            continue
        out.append(
            NoteRecord(
                note=text,
                note_type=nt,
                source="medsecid",
                sections=sections_from_medsecid(row.get("sections", [])),
                meta={"doc_id": row.get("id", "")},
            )
        )
    return out


# ── PMC Open Access case reports (optional, LM pretraining text) ──────────────
def fetch_pmc_oa_case_reports(limit: int = 500) -> list[str]:
    """Fetch open-access (CC-BY) case-report abstracts via NCBI E-utilities as
    extra clinical text for the generator's language model. Returns raw strings
    (no note_type: used for unconditioned LM pretraining only, not typed labels)."""
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    search = f"{base}/esearch.fcgi?db=pmc&term=case+report+AND+open+access[filter]&retmax={limit}&retmode=json"
    ids = json.loads(http_get(search).decode())["esearchresult"]["idlist"]
    texts: list[str] = []
    for i in range(0, len(ids), 100):
        chunk = ",".join(ids[i : i + 100])
        fetch = f"{base}/efetch.fcgi?db=pmc&id={chunk}&rettype=abstract&retmode=text"
        try:
            body = http_get(fetch).decode("utf-8", errors="ignore")
        except Exception:
            continue
        for part in body.split("\n\n\n"):
            part = part.strip()
            if len(part) > 200:
                texts.append(part)
    return texts
