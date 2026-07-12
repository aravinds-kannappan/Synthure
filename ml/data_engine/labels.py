"""Independent labelers.

The whole point of the rebuild is that a note's text and its label must not come
from the same hand-written rule. So labels here come from a source independent of
the note generator:

  * note_type  -> for REAL notes, the corpus metadata (MTSamples report type);
                  for GENERATED notes, the conditioning control token (gold by
                  construction, text learned from real notes, not a template).
  * sections   -> MedSecId human section annotations on real notes.
  * entities   -> OpenMed NER at build time (a pretrained model independent of our
                  generator), verified against RxNorm / the ICD index.
  * missing /  -> a seed rule set that reads ONLY the final note text (never the
    readiness    generator's internals), then refined by semi-supervised
                 self-training in train.py. Because the notes are model-generated
                 realistic text rather than fixed templates, a model must actually
                 learn text -> label; it cannot memorize a generator grammar.

The honest headline metric is always the frozen, human-audited real-note test set
(labels.build_real_test_holdout), never the synthetic split.
"""

from __future__ import annotations

import re

from schema import NOTE_TYPES

MISSING_FIELDS = ["laterality", "acuity", "supporting_diagnosis", "tobacco_status", "medication_dose"]

# ── note_type from MTSamples report-type / specialty metadata ─────────────────
# MTSamples tags every sample with a "sample_name" / "medical_specialty". This maps
# those real labels onto our seven classes. A mapping table is not hand-written
# note content; the note text stays whatever the real corpus provided.
_MTSAMPLES_TYPE_PATTERNS: list[tuple[str, str]] = [
    (r"\bsoap\b", "soap"),
    (r"discharge summary", "discharge_summary"),
    (r"\breferral\b|consult", "referral"),
    (r"emergency|\ber\b|\bed\b note", "er_note"),
    (r"radiolog|\bct\b|\bmri\b|x-?ray|ultrasound|imaging", "radiology"),
    (r"intake|new patient|history and physical|\bh&p\b", "intake_form"),
    (r"progress note|follow-?up|office visit", "progress_note"),
]


def note_type_from_metadata(sample_name: str, specialty: str = "") -> str | None:
    """Return one of NOTE_TYPES, or None when the sample does not map cleanly (it
    is then dropped rather than guessed, keeping the note_type label gold)."""
    blob = f"{sample_name} {specialty}".lower()
    for pat, nt in _MTSAMPLES_TYPE_PATTERNS:
        if re.search(pat, blob):
            return nt
    return None


# ── sections from MedSecId ────────────────────────────────────────────────────
# MedSecId gives (section_name, char_start, char_end) annotations on MIMIC notes.
# We normalize its section vocabulary to our labels and keep the real offsets.
_SECTION_NORMALIZE = {
    "chief complaint": "chief_complaint",
    "history of present illness": "hpi",
    "assessment": "assessment",
    "assessment and plan": "assessment",
    "impression": "impression",
    "plan": "plan",
    "medications": "medications",
    "discharge diagnosis": "diagnosis",
    "findings": "findings",
    "hospital course": "hospital_course",
}


def sections_from_medsecid(annotations: list[dict]) -> list[dict]:
    out = []
    for a in annotations:
        name = _SECTION_NORMALIZE.get(a.get("name", "").strip().lower())
        if name and a.get("start") is not None and a.get("end") is not None:
            out.append({"name": name, "label": a.get("label", name), "start": int(a["start"]), "end": int(a["end"])})
    return out


# ── seed rules for missing-info and readiness (read only the final text) ───────
_LATERALIZABLE = re.compile(r"\b(knee|hip|arm|leg|ear|eye|hand|foot|shoulder|ankle|wrist|elbow)\b", re.I)
_SIDE = re.compile(r"\b(right|left|bilateral)\b", re.I)
_ACUITY = re.compile(r"\b(acute|chronic)\b", re.I)
_RESP = re.compile(r"\b(copd|asthma|pneumonia|bronchitis|dyspnea|respiratory|lung|wheez)\b", re.I)
_TOBACCO = re.compile(r"\b(tobacco|smok|nicotine|cigarette|vaping)\b", re.I)
_DOSE = re.compile(r"\d+\s?(mg|mcg|units|ml|g)\b", re.I)
_STARTED_MED = re.compile(r"\b(start|started|prescrib|began|initiat)\w*\b", re.I)
_DX_SECTION = re.compile(r"\b(assessment|diagnosis|impression|problem|decision)\b", re.I)
_PROC = re.compile(r"\b(ordered|performed|procedure|biopsy|scan|x-?ray|injection|arthroscopy)\b", re.I)


def missing_labels(note: str) -> list[str]:
    """Independent structural labels derived from the final note text only."""
    low = note.lower()
    miss: set[str] = set()
    if _LATERALIZABLE.search(low) and not _SIDE.search(low):
        miss.add("laterality")
    if not _ACUITY.search(low):
        miss.add("acuity")
    if _RESP.search(low) and not _TOBACCO.search(low):
        miss.add("tobacco_status")
    if _STARTED_MED.search(low) and not _DOSE.search(low):
        miss.add("medication_dose")
    if _PROC.search(low) and not _DX_SECTION.search(low):
        miss.add("supporting_diagnosis")
    return sorted(miss)


def readiness_label(missing: list[str], has_dx: bool) -> int:
    """Weak seed label: ready when at least one diagnosis is present and no
    blocking field is missing. Refined by semi-supervised self-training; the real
    metric is the frozen real-note holdout, not this."""
    blocking = set(missing) & {"laterality", "supporting_diagnosis"}
    return 1 if (has_dx and not blocking) else 0
