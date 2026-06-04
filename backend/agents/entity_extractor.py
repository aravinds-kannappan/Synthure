"""
Entity extraction pipeline.

Priority order for each clinical note:
  1. HuggingFace Inference API — d4data/biomedical-ner-all (primary, 107 entities)
                                  blaze999/Medical-NER (secondary, 41 entities)
  2. Claude Haiku tool_use     — when HF_TOKEN set but HF API is cold/unavailable
  3. Regex                     — always-available last resort

The HF models return real trained NER probabilities from biomedical text.
Claude is used for its clinical reasoning ability when HF is unavailable.
Regex catches the structural patterns (ICD-10 codes, CPT codes) that are missed by all.
"""

from __future__ import annotations

import re
import time
from typing import Optional

import anthropic

from backend.ir.schemas import EntityTag
from backend.ml import ner as hf_ner
from backend.prompts import jargon as jargon_prompts
from backend.prompts import claims as claims_prompts

_HAIKU = "claude-haiku-4-5-20251001"

# ── Regex fallback ────────────────────────────────────────────────────────────

_ICD10_RE = re.compile(r"\b([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)\b")
_CPT_RE   = re.compile(r"\b([0-9]{5})\b")
_DRUG_RE  = re.compile(
    r"\b(lisinopril|atorvastatin|metformin|aspirin|warfarin|apixaban|metoprolol|"
    r"amlodipine|losartan|furosemide|omeprazole|pantoprazole|albuterol|fluticasone|"
    r"sertraline|escitalopram|bupropion|insulin|prednisone|amoxicillin|azithromycin|"
    r"clopidogrel|atorvastatin|rosuvastatin|levothyroxine|gabapentin|hydrocodone|"
    r"oxycodone|tramadol|morphine|fentanyl|ondansetron|metoprolol|carvedilol)\b",
    re.IGNORECASE,
)


def _regex_extract(text: str) -> list[EntityTag]:
    entities: list[EntityTag] = []
    seen: set[str] = set()
    for m in _ICD10_RE.finditer(text):
        code = m.group(1)
        if code not in seen:
            seen.add(code)
            entities.append(EntityTag(text=code, code=code, entity_type="diagnosis", confidence=0.92))
    for m in _CPT_RE.finditer(text):
        code = m.group(1)
        if code not in seen:
            seen.add(code)
            entities.append(EntityTag(text=code, code=code, entity_type="procedure", confidence=0.88))
    for m in _DRUG_RE.finditer(text):
        name = m.group(1).lower().capitalize()
        if name not in seen:
            seen.add(name)
            entities.append(EntityTag(text=m.group(1), code=name, entity_type="medication", confidence=0.80))
    return entities


# ── HuggingFace NER (primary) ─────────────────────────────────────────────────

def _hf_extract(text: str) -> list[EntityTag]:
    """
    Call d4data/biomedical-ner-all → blaze999/Medical-NER via HF Inference API.
    Returns [] if HF_TOKEN not set or both APIs unavailable.
    """
    results = hf_ner.extract_entities(text)
    entities = [
        EntityTag(
            text=r.text,
            code=r.text,   # raw text as code; ICD/CPT regex will fill exact codes
            entity_type=r.entity_type,
            confidence=r.confidence,
        )
        for r in results
    ]
    # Augment with regex to capture explicit ICD-10/CPT codes the NER may miss
    regex_entities = _regex_extract(text)
    seen = {e.code.lower() for e in entities}
    for e in regex_entities:
        if e.code.lower() not in seen:
            entities.append(e)
            seen.add(e.code.lower())
    return entities


# ── Claude Haiku NER (secondary) ──────────────────────────────────────────────

def _claude_extract(
    text: str,
    client: anthropic.Anthropic,
) -> tuple[list[EntityTag], int]:
    t0 = time.monotonic()
    try:
        response = client.messages.create(
            model=_HAIKU,
            max_tokens=1024,
            system=jargon_prompts.ENTITY_EXTRACTION_SYSTEM,
            tools=[jargon_prompts.ENTITY_TAGGING_TOOL],
            tool_choice={"type": "tool", "name": "tag_entities"},
            messages=[{"role": "user", "content": f"Extract all medical entities:\n\n{text}"}],
        )
        duration = int((time.monotonic() - t0) * 1000)
        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if tool_use is None:
            return _regex_extract(text), duration
        raw = tool_use.input.get("entities", [])
        entities = [
            EntityTag(
                text=e.get("text", ""),
                code=e.get("code", ""),
                entity_type=e.get("entity_type", "diagnosis"),
                confidence=float(e.get("confidence", 0.5)),
            )
            for e in raw
            if e.get("text") and e.get("code")
        ]
        return entities, duration
    except Exception:
        duration = int((time.monotonic() - t0) * 1000)
        return _regex_extract(text), duration


# ── Public API ────────────────────────────────────────────────────────────────

def extract_from_clinical_note(
    text: str,
    client: Optional[anthropic.Anthropic],
) -> tuple[list[EntityTag], str, int]:
    """
    Extract typed medical entities from a clinical note.
    Returns (entities, model_used, duration_ms).
    """
    t0 = time.monotonic()

    # 1. Try HuggingFace NER models (real trained weights)
    if hf_ner.is_available():
        entities = _hf_extract(text)
        if entities:
            duration = int((time.monotonic() - t0) * 1000)
            return entities, "biomedical-ner-all", duration

    # 2. Try Claude Haiku (structured reasoning, still requires API key)
    if client is not None:
        entities, duration = _claude_extract(text, client)
        return entities, _HAIKU, duration

    # 3. Regex fallback (always available, no keys needed)
    entities = _regex_extract(text)
    return entities, "regex-fallback", int((time.monotonic() - t0) * 1000)


def extract_claim_codes(
    procedure_code: str,
    diagnosis_codes: list[str],
    client: Optional[anthropic.Anthropic],
) -> tuple[list[EntityTag], str, int]:
    """
    Validate and confidence-score claim codes.
    Returns (validated_entities, model_used, duration_ms).
    """
    if client is None:
        t0 = time.monotonic()
        entities = [
            EntityTag(text=procedure_code, code=procedure_code, entity_type="procedure", confidence=0.90)
        ] + [
            EntityTag(text=c, code=c, entity_type="diagnosis", confidence=0.90) for c in diagnosis_codes
        ]
        return entities, "passthrough-fallback", int((time.monotonic() - t0) * 1000)

    user_msg = (
        f"Validate these insurance claim codes:\n"
        f"Procedure (CPT): {procedure_code}\n"
        f"Diagnosis (ICD-10): {', '.join(diagnosis_codes)}"
    )
    t0 = time.monotonic()
    try:
        response = client.messages.create(
            model=_HAIKU,
            max_tokens=512,
            system=claims_prompts.CODE_VALIDATION_SYSTEM,
            tools=[claims_prompts.CODE_VALIDATION_TOOL],
            tool_choice={"type": "tool", "name": "validate_claim_codes"},
            messages=[{"role": "user", "content": user_msg}],
        )
        duration = int((time.monotonic() - t0) * 1000)
        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if tool_use is None:
            return _passthrough(procedure_code, diagnosis_codes), "passthrough-fallback", duration
        raw = tool_use.input.get("entities", [])
        entities = [
            EntityTag(
                text=e.get("text", ""),
                code=e.get("code", ""),
                entity_type=e.get("entity_type", "diagnosis"),
                confidence=float(e.get("confidence", 0.5)),
            )
            for e in raw
            if e.get("text") and e.get("code")
        ]
        return entities, _HAIKU, duration
    except Exception:
        duration = int((time.monotonic() - t0) * 1000)
        return _passthrough(procedure_code, diagnosis_codes), "passthrough-fallback", duration


def _passthrough(procedure_code: str, diagnosis_codes: list[str]) -> list[EntityTag]:
    return [
        EntityTag(text=procedure_code, code=procedure_code, entity_type="procedure", confidence=0.90)
    ] + [
        EntityTag(text=c, code=c, entity_type="diagnosis", confidence=0.90) for c in diagnosis_codes
    ]
