"""
Entity extraction agent — uses claude-haiku for cost-efficient NER.
Forces structured output via tool_choice, never generates prose.
Falls back to regex-based extraction when no API key is available.
"""

import re
import time
from typing import Optional

import anthropic

from backend.ir.schemas import EntityTag
from backend.prompts import jargon as jargon_prompts
from backend.prompts import claims as claims_prompts

_HAIKU = "claude-haiku-4-5-20251001"

# ── Regex fallback (demo mode) ────────────────────────────────────────────────

_ICD10_RE = re.compile(r"\b([A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?)\b")
_CPT_RE   = re.compile(r"\b([0-9]{5})\b")
# Common drug name fragments for crude demo-mode detection
_DRUG_RE  = re.compile(
    r"\b(lisinopril|atorvastatin|metformin|aspirin|warfarin|apixaban|metoprolol|"
    r"amlodipine|losartan|furosemide|omeprazole|pantoprazole|albuterol|fluticasone|"
    r"sertraline|escitalopram|bupropion|insulin)\b",
    re.IGNORECASE,
)


def _regex_extract(text: str) -> list[EntityTag]:
    """Lightweight regex entity extraction for demo/fallback mode."""
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


# ── LLM-based extraction ──────────────────────────────────────────────────────

def extract_from_clinical_note(
    text: str,
    client: Optional[anthropic.Anthropic],
) -> tuple[list[EntityTag], str, int]:
    """
    Extract typed entities from a clinical note.
    Returns (entities, model_used, duration_ms).
    Falls back to regex if no client.
    """
    if client is None:
        t0 = time.monotonic()
        entities = _regex_extract(text)
        return entities, "regex-fallback", int((time.monotonic() - t0) * 1000)

    t0 = time.monotonic()
    try:
        response = client.messages.create(
            model=_HAIKU,
            max_tokens=1024,
            system=jargon_prompts.ENTITY_EXTRACTION_SYSTEM,
            tools=[jargon_prompts.ENTITY_TAGGING_TOOL],
            tool_choice={"type": "tool", "name": "tag_entities"},
            messages=[{"role": "user", "content": f"Extract all medical entities from this clinical note:\n\n{text}"}],
        )
        duration = int((time.monotonic() - t0) * 1000)

        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if tool_use is None:
            return _regex_extract(text), "regex-fallback", duration

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
        return _regex_extract(text), "regex-fallback", duration


def extract_claim_codes(
    procedure_code: str,
    diagnosis_codes: list[str],
    client: Optional[anthropic.Anthropic],
) -> tuple[list[EntityTag], str, int]:
    """
    Validate and confidence-score claim codes via LLM.
    Returns (validated_entities, model_used, duration_ms).
    """
    if client is None:
        t0 = time.monotonic()
        entities = [
            EntityTag(text=procedure_code, code=procedure_code, entity_type="procedure", confidence=0.90)
        ] + [
            EntityTag(text=c, code=c, entity_type="diagnosis", confidence=0.90)
            for c in diagnosis_codes
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
            return _passthrough_entities(procedure_code, diagnosis_codes), "passthrough-fallback", duration

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
        return _passthrough_entities(procedure_code, diagnosis_codes), "passthrough-fallback", duration


def _passthrough_entities(procedure_code: str, diagnosis_codes: list[str]) -> list[EntityTag]:
    return [
        EntityTag(text=procedure_code, code=procedure_code, entity_type="procedure", confidence=0.90)
    ] + [
        EntityTag(text=c, code=c, entity_type="diagnosis", confidence=0.90) for c in diagnosis_codes
    ]
