"""
Gated output generator — enforces output schema via Claude tool_use.
Grounds outputs in retrieved KB documents; post-validates source citations
to strip hallucinated doc IDs before returning to the caller.

No hardcoded fallback data. If the Anthropic client is unavailable or a call
fails, an exception is raised so the caller can surface a proper error to the user.
"""

import time
from typing import Optional

import anthropic

from backend.ir.schemas import ClinicalNoteIR, ClaimIR, InsuranceProfileIR
from backend.rag.retriever import RetrievedDoc
from backend.prompts import jargon as jargon_prompts
from backend.prompts import insurance as insurance_prompts
from backend.prompts import claims as claims_prompts

_HAIKU  = "claude-haiku-4-5-20251001"
_SONNET = "claude-sonnet-4-6"


# ── Context injection ───────────────────────────────────────────────────────────────────

def _docs_to_context(docs: list[RetrievedDoc]) -> str:
    if not docs:
        return "No additional reference documents retrieved."
    return "\n\n".join(f"CONTEXT DOCUMENT {i+1}:\n{d.content}" for i, d in enumerate(docs))


def _valid_doc_ids(docs: list[RetrievedDoc]) -> set[str]:
    return {d.id for d in docs}


def _strip_hallucinated_citations(
    raw_sources: list[str],
    valid_ids: set[str],
) -> tuple[list[str], int]:
    valid_special = {"general_knowledge"}
    clean = [s for s in raw_sources if s in valid_ids or s in valid_special]
    return clean, len(raw_sources) - len(clean)


# ── Jargon generator ───────────────────────────────────────────────────────────────────

def generate_jargon(
    ir: ClinicalNoteIR,
    client: anthropic.Anthropic,
) -> tuple[dict, str, int, list[str], int]:
    """
    Generate plain-language jargon explanation from a clinical note.
    Returns (data_dict, model_used, duration_ms, sources_cited, hallucinations_stripped).
    Raises on failure — no silent fallback.
    """
    if client is None:
        raise ValueError("Anthropic client is required. Set ANTHROPIC_API_KEY.")

    valid_ids = _valid_doc_ids(ir.retrieved_docs)
    context   = _docs_to_context(ir.retrieved_docs)

    user_msg = (
        f"RETRIEVED CONTEXT:\n{context}\n\n"
        f"CLINICAL NOTE TO EXPLAIN:\n{ir.raw_text}"
    )
    t0 = time.monotonic()
    response = client.messages.create(
        model=_HAIKU,
        max_tokens=2048,
        system=jargon_prompts.GENERATION_SYSTEM,
        tools=[jargon_prompts.GENERATION_TOOL],
        tool_choice={"type": "tool", "name": "explain_clinical_note"},
        messages=[{"role": "user", "content": user_msg}],
    )
    duration = int((time.monotonic() - t0) * 1000)

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("Claude returned no tool_use block for jargon generation")

    data = dict(tool_use.input)
    raw_sources = data.pop("sources_cited", [])
    for cond in data.get("conditions", []):
        if cond.get("source_doc_id") not in valid_ids and cond.get("source_doc_id") != "general_knowledge":
            cond["source_doc_id"] = "general_knowledge"

    clean, stripped = _strip_hallucinated_citations(raw_sources, valid_ids)
    return data, _HAIKU, duration, clean, stripped


# ── Insurance overlay generator ──────────────────────────────────────────────────────────

def generate_insurance_overlay(
    ir: InsuranceProfileIR,
    client: anthropic.Anthropic,
) -> tuple[dict, str, int, list[str], int]:
    """Returns (ai_insight_dict, model_used, duration_ms, sources_cited, hallucinations_stripped)."""
    if client is None:
        raise ValueError("Anthropic client is required. Set ANTHROPIC_API_KEY.")

    valid_ids = _valid_doc_ids(ir.retrieved_docs)
    context   = _docs_to_context(ir.retrieved_docs)

    user_msg = (
        f"RETRIEVED POLICY CONTEXT:\n{context}\n\n"
        f"PATIENT PROFILE:\n"
        f"Age: {ir.age}, Annual income: ${ir.annual_income:,}, State: {ir.state}\n"
        f"Employment: {'Employed (W-2)' if ir.employed else 'Unemployed/Self-employed'}, "
        f"Dependents: {ir.has_dependents}, Chronic condition: {ir.chronic_condition}\n\n"
        f"TOP RAG-MATCHED PLANS:\n" +
        "\n".join(
            f"  {i+1}. {r['plan']} — {r['match_score']}% match — {r['reason']}"
            for i, r in enumerate(ir.rule_engine_recs[:3])
        )
    )
    t0 = time.monotonic()
    response = client.messages.create(
        model=_HAIKU,
        max_tokens=1024,
        system=insurance_prompts.GENERATION_SYSTEM,
        tools=[insurance_prompts.GENERATION_TOOL],
        tool_choice={"type": "tool", "name": "generate_insurance_guidance"},
        messages=[{"role": "user", "content": user_msg}],
    )
    duration = int((time.monotonic() - t0) * 1000)

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("Claude returned no tool_use block for insurance overlay")

    data = dict(tool_use.input)
    raw_sources = data.pop("sources_cited", [])
    clean, stripped = _strip_hallucinated_citations(raw_sources, valid_ids)
    return data, _HAIKU, duration, clean, stripped


# ── Claim adjudication generator ──────────────────────────────────────────────────────────

def generate_claim_decision(
    ir: ClaimIR,
    client: anthropic.Anthropic,
) -> tuple[dict, str, int, list[str], int]:
    """
    Generate claim adjudication decision.
    Routes to Sonnet for frontier (complexity >= 60), Haiku for standard.
    Raises on failure — no silent fallback.
    """
    if client is None:
        raise ValueError("Anthropic client is required. Set ANTHROPIC_API_KEY.")

    model     = _SONNET if ir.route == "frontier" else _HAIKU
    valid_ids = _valid_doc_ids(ir.retrieved_docs)
    context   = _docs_to_context(ir.retrieved_docs)

    flags_str = []
    if ir.flags.get("prior_denial"):      flags_str.append("prior denial on record")
    if ir.flags.get("out_of_network"):    flags_str.append("out-of-network provider")
    if ir.flags.get("experimental_treatment"): flags_str.append("experimental/investigational treatment")

    user_msg = (
        f"RETRIEVED DENIAL PATTERNS AND CODE PROFILES:\n{context}\n\n"
        f"CLAIM DETAILS:\n"
        f"Patient ID: {ir.patient_id} | Provider NPI: {ir.provider_npi}\n"
        f"Procedure (CPT): {ir.procedure_code}\n"
        f"Diagnoses (ICD-10): {', '.join(ir.diagnosis_codes)}\n"
        f"Amount: ${ir.amount:,.2f}\n"
        f"Flags: {', '.join(flags_str) if flags_str else 'none'}\n"
        f"Complexity score: {ir.complexity_score}/100\n"
        f"Route: {ir.route}\n\n"
        f"Validated codes (entity extraction confidence):\n" +
        "\n".join(f"  {e.code} ({e.entity_type}) — confidence {e.confidence:.2f}" for e in ir.validated_codes)
    )
    t0 = time.monotonic()
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=claims_prompts.ADJUDICATION_SYSTEM,
        tools=[claims_prompts.ADJUDICATION_TOOL],
        tool_choice={"type": "tool", "name": "submit_claim_decision"},
        messages=[{"role": "user", "content": user_msg}],
    )
    duration = int((time.monotonic() - t0) * 1000)

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("Claude returned no tool_use block for claim adjudication")

    data = dict(tool_use.input)
    raw_sources = data.pop("sources_cited", [])
    clean, stripped = _strip_hallucinated_citations(raw_sources, valid_ids)
    return data, model, duration, clean, stripped
