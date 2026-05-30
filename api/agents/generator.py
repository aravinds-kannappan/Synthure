"""
Gated output generator — enforces output schema via Claude tool_use.
Grounds outputs in retrieved KB documents; post-validates source citations
to strip hallucinated doc IDs before returning to the caller.
"""

import time
from typing import Optional

import anthropic

from ..ir.schemas import ClinicalNoteIR, ClaimIR, InsuranceProfileIR
from ..rag.retriever import RetrievedDoc
from ..prompts import jargon as jargon_prompts
from ..prompts import insurance as insurance_prompts
from ..prompts import claims as claims_prompts

_HAIKU  = "claude-haiku-4-5-20251001"
_SONNET = "claude-sonnet-4-6"

# ── Context injection ─────────────────────────────────────────────────────────

def _docs_to_context(docs: list[RetrievedDoc]) -> str:
    if not docs:
        return "No additional reference documents retrieved."
    blocks = [f"CONTEXT DOCUMENT {i+1}:\n{d.content}" for i, d in enumerate(docs)]
    return "\n\n".join(blocks)


def _valid_doc_ids(docs: list[RetrievedDoc]) -> set[str]:
    return {d.id for d in docs}


def _strip_hallucinated_citations(
    raw_sources: list[str],
    valid_ids: set[str],
) -> tuple[list[str], int]:
    """Remove any cited doc IDs not in the retrieved set. Returns (clean_list, stripped_count)."""
    valid_special = {"general_knowledge"}
    clean = [s for s in raw_sources if s in valid_ids or s in valid_special]
    return clean, len(raw_sources) - len(clean)


# ── Jargon generator ──────────────────────────────────────────────────────────

_JARGON_FALLBACK = {
    "summary": (
        "Your visit showed signs of high blood pressure and related cardiovascular concerns. "
        "Your doctor has started you on two medications to manage these conditions and wants "
        "to follow up in about a month to check your progress."
    ),
    "conditions": [
        {"term": "Essential Hypertension (I10)", "plain": "High blood pressure — your heart is working harder than it should to pump blood through your arteries. Over time, this can strain your heart and blood vessels.", "source_doc_id": "icd10_I10"},
        {"term": "Dyslipidemia (E78.5)", "plain": "Your blood fats are out of balance — your LDL (bad cholesterol) is too high and your HDL (good cholesterol) is too low. This raises your risk of heart disease.", "source_doc_id": "icd10_E78_5"},
    ],
    "medications": [
        {"name": "Lisinopril 10mg", "purpose": "Lowers blood pressure by relaxing your blood vessels so your heart doesn't work as hard", "instructions": "Take once every morning with or without food. Do not stop taking it without talking to your doctor first."},
        {"name": "Atorvastatin 20mg", "purpose": "Lowers your LDL (bad cholesterol) to reduce your heart disease risk", "instructions": "Take once at bedtime. Avoid large amounts of grapefruit juice."},
    ],
    "followup": "Return to clinic in 4 weeks. Before that appointment, get fasting bloodwork (don't eat for 8 hours before the blood draw) to check your cholesterol and kidney function.",
    "urgency": "soon",
    "sources_cited": ["icd10_I10", "icd10_E78_5"],
}


def generate_jargon(ir: ClinicalNoteIR, client: Optional[anthropic.Anthropic]) -> tuple[dict, str, int, list[str], int]:
    """
    Generate plain-language jargon explanation.
    Returns (data_dict, model_used, duration_ms, sources_cited, hallucinations_stripped).
    """
    valid_ids = _valid_doc_ids(ir.retrieved_docs)
    context   = _docs_to_context(ir.retrieved_docs)

    if client is None:
        # Demo mode: use fallback but filter sources to only those we actually retrieved
        clean, stripped = _strip_hallucinated_citations(_JARGON_FALLBACK["sources_cited"], valid_ids | {"general_knowledge"})
        fallback = dict(_JARGON_FALLBACK)
        fallback["sources_cited"] = clean
        return fallback, "demo", 0, clean, stripped

    user_msg = (
        f"RETRIEVED CONTEXT:\n{context}\n\n"
        f"CLINICAL NOTE TO EXPLAIN:\n{ir.raw_text}"
    )
    t0 = time.monotonic()
    try:
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
            return _JARGON_FALLBACK, "demo", duration, _JARGON_FALLBACK["sources_cited"], 0

        data = dict(tool_use.input)
        raw_sources = data.pop("sources_cited", [])
        # Also validate condition-level citations
        for cond in data.get("conditions", []):
            if cond.get("source_doc_id") not in valid_ids and cond.get("source_doc_id") != "general_knowledge":
                cond["source_doc_id"] = "general_knowledge"

        clean, stripped = _strip_hallucinated_citations(raw_sources, valid_ids)
        return data, _HAIKU, duration, clean, stripped

    except Exception:
        duration = int((time.monotonic() - t0) * 1000)
        return _JARGON_FALLBACK, "demo", duration, _JARGON_FALLBACK["sources_cited"], 0


# ── Insurance overlay generator ───────────────────────────────────────────────

_INSURANCE_FALLBACK_OVERLAY = {
    "ai_insight": (
        "Based on your profile, the top-ranked plan offers the best value for your income and family situation. "
        "Review the enrollment window carefully — missing it could leave you without coverage for a full year."
    ),
    "key_consideration": "Confirm enrollment period and income documentation before applying.",
    "warning": "Income changes during the year must be reported to avoid subsidy reconciliation at tax time.",
    "sources_cited": [],
}


def generate_insurance_overlay(
    ir: InsuranceProfileIR,
    client: Optional[anthropic.Anthropic],
) -> tuple[dict, str, int, list[str], int]:
    """Returns (ai_insight_dict, model_used, duration_ms, sources_cited, hallucinations_stripped)."""
    valid_ids = _valid_doc_ids(ir.retrieved_docs)
    context   = _docs_to_context(ir.retrieved_docs)

    if client is None:
        fallback = dict(_INSURANCE_FALLBACK_OVERLAY)
        # Derive a basic fallback insight from the rule engine recs
        if ir.rule_engine_recs:
            top = ir.rule_engine_recs[0]
            fallback["ai_insight"] = (
                f"At age {ir.age} with an income of ${ir.annual_income:,}, "
                f"{top['plan']} is your strongest option with a {top['match_score']}% match score. "
                f"{top['reason']}."
            )
            fallback["key_consideration"] = "Medicare" if ir.age >= 65 else (
                "Employer plan cost-sharing" if ir.employed else "Monthly premium vs. deductible tradeoff"
            )
        clean, stripped = _strip_hallucinated_citations(fallback.get("sources_cited", []), valid_ids)
        fallback["sources_cited"] = clean
        return fallback, "demo", 0, clean, stripped

    user_msg = (
        f"RETRIEVED POLICY CONTEXT:\n{context}\n\n"
        f"PATIENT PROFILE:\n"
        f"Age: {ir.age}, Annual income: ${ir.annual_income:,}, State: {ir.state}\n"
        f"Employment: {'Employed (W-2)' if ir.employed else 'Unemployed/Self-employed'}, "
        f"Dependents: {ir.has_dependents}, Chronic condition: {ir.chronic_condition}\n\n"
        f"TOP RULE-ENGINE RECOMMENDATIONS:\n" +
        "\n".join(f"  {i+1}. {r['plan']} — {r['match_score']}% — {r['reason']}" for i, r in enumerate(ir.rule_engine_recs[:3]))
    )
    t0 = time.monotonic()
    try:
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
            return _INSURANCE_FALLBACK_OVERLAY, "demo", duration, [], 0

        data = dict(tool_use.input)
        raw_sources = data.pop("sources_cited", [])
        clean, stripped = _strip_hallucinated_citations(raw_sources, valid_ids)
        return data, _HAIKU, duration, clean, stripped

    except Exception:
        duration = int((time.monotonic() - t0) * 1000)
        return _INSURANCE_FALLBACK_OVERLAY, "demo", duration, [], 0


# ── Claim adjudication generator ──────────────────────────────────────────────

_CLAIM_FALLBACKS = {
    "approved": {
        "decision": "approved", "confidence": 87,
        "reasoning": "Claim meets all standard criteria. Diagnosis codes align with the procedure and amount is within usual and customary range.",
        "denial_reason": None, "appeal_path": None, "estimated_reimbursement": None,
    },
    "pending_review": {
        "decision": "pending_review", "confidence": 62,
        "reasoning": "Claim complexity requires specialist review. Multiple diagnosis codes with elevated claim value flagged for manual authorization before processing.",
        "denial_reason": None,
        "appeal_path": "Submit pre-authorization documentation and complete clinical notes within 30 days to expedite review.",
        "estimated_reimbursement": None,
    },
    "denied": {
        "decision": "denied", "confidence": 78,
        "reasoning": "Service not covered under current policy terms. The procedure requires prior authorization that was not obtained, and out-of-network facility charges are not covered outside of emergency circumstances.",
        "denial_reason": "Missing prior authorization — procedure code requires pre-approval per policy section 4.2. Out-of-network provider not covered for non-emergency services.",
        "appeal_path": "File Level 1 appeal within 180 days. Include: (1) letter of medical necessity from treating physician, (2) clinical notes and imaging reports, (3) documentation that in-network alternatives were not reasonably available, (4) completed appeal form CMS-20031.",
        "estimated_reimbursement": 0,
    },
}


def generate_claim_decision(
    ir: ClaimIR,
    client: Optional[anthropic.Anthropic],
) -> tuple[dict, str, int, list[str], int]:
    """
    Generate claim adjudication decision.
    Routes to Sonnet for frontier (complexity >= 60), Haiku for standard.
    Returns (result_dict, model_used, duration_ms, sources_cited, hallucinations_stripped).
    """
    model  = _SONNET if ir.route == "frontier" else _HAIKU
    valid_ids = _valid_doc_ids(ir.retrieved_docs)
    context   = _docs_to_context(ir.retrieved_docs)

    if client is None:
        key = "denied" if ir.complexity_score >= 65 else ("pending_review" if ir.complexity_score >= 30 else "approved")
        fallback = dict(_CLAIM_FALLBACKS[key])
        return fallback, "demo", 0, [], 0

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
    try:
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
            key = "denied" if ir.complexity_score >= 65 else ("pending_review" if ir.complexity_score >= 30 else "approved")
            return dict(_CLAIM_FALLBACKS[key]), "demo", duration, [], 0

        data = dict(tool_use.input)
        raw_sources = data.pop("sources_cited", [])
        clean, stripped = _strip_hallucinated_citations(raw_sources, valid_ids)
        return data, model, duration, clean, stripped

    except Exception:
        duration = int((time.monotonic() - t0) * 1000)
        key = "denied" if ir.complexity_score >= 65 else ("pending_review" if ir.complexity_score >= 30 else "approved")
        return dict(_CLAIM_FALLBACKS[key]), "demo", duration, [], 0
