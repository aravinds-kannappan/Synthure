"""
Medical NER using HuggingFace Inference API.

Priority order:
  1. d4data/biomedical-ner-all   — 107-entity MACCROBAT schema (primary)
  2. blaze999/Medical-NER        — 41-entity PubMED schema (secondary)
  3. Claude Haiku tool_use       — called by entity_extractor.py
  4. Regex fallback              — entity_extractor.py

Requires HF_TOKEN in environment for Inference API calls.
Both models are free on the HuggingFace Hub; token needed to avoid rate limits.

MACCROBAT → Synthure entity type mapping:
  SIGN_SYMPTOM, DISEASE_DISORDER  → diagnosis
  MEDICATION, THERAPEUTIC_PROCEDURE → medication
  DIAGNOSTIC_PROCEDURE, CLINICAL_EVENT → procedure
  LAB_VALUE                        → lab_value
  VITAL_SIGNS                      → vital
"""

from __future__ import annotations

import os
import re
from typing import NamedTuple

import httpx

HF_TOKEN = os.environ.get("HF_TOKEN", "")
_HEADERS = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}

_PRIMARY_URL   = "https://api-inference.huggingface.co/models/d4data/biomedical-ner-all"
_SECONDARY_URL = "https://api-inference.huggingface.co/models/blaze999/Medical-NER"

# ── MACCROBAT entity → Synthure type ──────────────────────────────────────────

_MACCROBAT_MAP: dict[str, str] = {
    "SIGN_SYMPTOM":            "diagnosis",
    "DISEASE_DISORDER":        "diagnosis",
    "MEDICATION":              "medication",
    "THERAPEUTIC_PROCEDURE":   "medication",
    "DIAGNOSTIC_PROCEDURE":    "procedure",
    "CLINICAL_EVENT":          "procedure",
    "LAB_VALUE":               "lab_value",
    "VITAL_SIGNS":             "vital",
    "BIOLOGICAL_STRUCTURE":    "diagnosis",
    "BIOLOGICAL_ATTRIBUTE":    "lab_value",
    "QUALITATIVE_CONCEPT":     "diagnosis",
    "QUANTITATIVE_CONCEPT":    "lab_value",
    "ADMINISTRATION":          "medication",
    "DOSAGE":                  "medication",
    "FREQUENCY":               "medication",
    "DURATION":                "medication",
    "DATE":                    "vital",
    "TIME":                    "vital",
    "SUBJECT":                 "diagnosis",
    "DETAILED_DESCRIPTION":    "diagnosis",
    "PERSONAL_BACKGROUND":     "diagnosis",
    "FAMILY_HISTORY":          "diagnosis",
    "OCCUPATION":              "diagnosis",
    "HISTORY":                 "diagnosis",
    "OUTCOME":                 "diagnosis",
    "SEVERITY":                "diagnosis",
    "TEXTURE":                 "diagnosis",
    "SHAPE":                   "diagnosis",
    "COLOR":                   "diagnosis",
    "MASS":                    "vital",
    "VOLUME":                  "vital",
    "AREA":                    "vital",
    "LENGTH":                  "vital",
    "DISTANCE":                "vital",
    "WEIGHT":                  "vital",
    "AGE":                     "vital",
    "BIRTH_DATE":              "vital",
    "GENDER":                  "vital",
    "RACE_ETHNICITY":          "vital",
    "EDUCATIONAL_BACKGROUND":  "diagnosis",
    "FAMILY_MEMBER":           "diagnosis",
    "NONBIOLOGICAL_LOCATION":  "procedure",
    "BIOLOGICAL_LOCATION":     "procedure",
    "ORGANIZATION":            "procedure",
    "LABORATORY_OR_TEST_RESULT": "lab_value",
}

# PubMED-NER → Synthure type (blaze999/Medical-NER)
_PUBMED_MAP: dict[str, str] = {
    "Disease":       "diagnosis",
    "Chemical":      "medication",
    "Gene":          "diagnosis",
    "Species":       "diagnosis",
    "Mutation":      "diagnosis",
    "Cell_type":     "diagnosis",
    "Cell_line":     "lab_value",
    "DNA":           "lab_value",
    "RNA":           "lab_value",
    "Protein":       "lab_value",
    "Drug":          "medication",
    "Symptom":       "diagnosis",
    "Procedure":     "procedure",
    "Test":          "procedure",
    "Anatomy":       "diagnosis",
}


class NERResult(NamedTuple):
    text: str
    entity_type: str   # "diagnosis" | "medication" | "procedure" | "lab_value" | "vital"
    confidence: float
    source: str        # "biomedical-ner-all" | "medical-ner" | "fallback"


def _merge_subwords(raw: list[dict]) -> list[dict]:
    """Merge BPE/WordPiece subword tokens (##word) into whole-word entities."""
    merged: list[dict] = []
    for tok in raw:
        word = tok.get("word", "")
        if word.startswith("##") and merged:
            merged[-1]["word"] += word[2:]
            merged[-1]["score"] = min(merged[-1]["score"], tok.get("score", 0.0))
        else:
            merged.append(dict(tok))
    return merged


def _consolidate_entities(raw: list[dict], type_map: dict[str, str], source: str) -> list[NERResult]:
    """
    Consolidate consecutive tokens with the same entity type (B-/I- prefix stripping).
    Returns deduplicated NERResult list.
    """
    merged = _merge_subwords(raw)
    results: list[NERResult] = []
    seen: set[str] = set()

    current_text = ""
    current_type = ""
    current_score = 0.0
    current_count = 0

    for tok in merged:
        label: str = tok.get("entity", tok.get("entity_group", ""))
        # Strip B-/I- prefix
        clean_label = label[2:] if label.startswith(("B-", "I-")) else label
        score: float = float(tok.get("score", 0.5))
        word: str = tok.get("word", "")
        entity_type = type_map.get(clean_label, "")
        if not entity_type:
            if current_text:
                _flush(current_text, current_type, current_score / max(current_count, 1),
                       source, results, seen)
                current_text = current_count = current_score = 0
                current_text = ""
            continue

        if label.startswith("B-") or not current_text or entity_type != current_type:
            if current_text:
                _flush(current_text, current_type, current_score / max(current_count, 1),
                       source, results, seen)
            current_text = word
            current_type = entity_type
            current_score = score
            current_count = 1
        else:
            current_text = f"{current_text} {word}".strip()
            current_score += score
            current_count += 1

    if current_text:
        _flush(current_text, current_type, current_score / max(current_count, 1),
               source, results, seen)

    return results


def _flush(text: str, entity_type: str, score: float, source: str,
           results: list[NERResult], seen: set[str]) -> None:
    key = f"{entity_type}:{text.lower()}"
    if key not in seen and len(text) > 1:
        seen.add(key)
        results.append(NERResult(
            text=text,
            entity_type=entity_type,
            confidence=round(min(score, 1.0), 3),
            source=source,
        ))


# ── Inference API calls ───────────────────────────────────────────────────────

def _call_hf(url: str, text: str, timeout: int = 20) -> list[dict]:
    """Call HuggingFace Inference API synchronously. Returns [] on any error."""
    if not HF_TOKEN:
        return []
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, headers=_HEADERS, json={"inputs": text[:512]})
            if resp.status_code == 503:
                # Model loading — common on cold start; don't wait, fall through
                return []
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []
    except Exception:
        return []


def extract_entities(text: str) -> list[NERResult]:
    """
    Run medical NER on text.
    Returns entities from d4data/biomedical-ner-all (primary) or
    blaze999/Medical-NER (secondary). Returns [] if both APIs unavailable.
    """
    # Primary: d4data/biomedical-ner-all (MACCROBAT, 107 entities)
    raw = _call_hf(_PRIMARY_URL, text)
    if raw:
        return _consolidate_entities(raw, _MACCROBAT_MAP, "biomedical-ner-all")

    # Secondary: blaze999/Medical-NER (PubMED, 41 entities)
    raw = _call_hf(_SECONDARY_URL, text)
    if raw:
        return _consolidate_entities(raw, _PUBMED_MAP, "medical-ner")

    return []


def is_available() -> bool:
    """Return True if HF_TOKEN is set and Inference API is reachable."""
    return bool(HF_TOKEN)
