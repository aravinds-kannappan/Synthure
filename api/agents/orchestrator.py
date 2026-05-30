"""
Multi-agent pipeline orchestrator.
Coordinates quality gate → entity extraction → RAG retrieval → generation
for each of Synthure's three features.
"""

import time
from typing import Optional

import anthropic

from api.ir import schemas
from api.ir import quality_gate
from api.rag import retriever as rag
from api.agents import entity_extractor, generator

# ── Helpers ───────────────────────────────────────────────────────────────────

def _mean_confidence(entities: list[schemas.EntityTag]) -> float:
    if not entities:
        return 0.0
    return round(sum(e.confidence for e in entities) / len(entities), 3)


def _rule_based_match(patient: dict) -> list[dict]:
    """Deterministic insurance plan scoring. Returns sorted recommendation list."""
    age          = int(patient.get("age", 0))
    income       = int(patient.get("annual_income", 0))
    employed     = patient.get("employed", False)
    has_deps     = patient.get("has_dependents", False)
    condition    = patient.get("chronic_condition", False)
    fpl          = 20120 + (4720 * (2 if has_deps else 0))

    score_map: dict[str, int] = {}
    if age >= 65:               score_map["Medicare"] = 95
    elif age >= 60:             score_map["Medicare"] = 40
    if income <= fpl:           score_map["Medicaid"] = 90
    elif income <= fpl * 1.5:   score_map["Medicaid"] = 50
    if employed:                score_map["Employer-Sponsored (ESI)"] = 85
    if fpl < income <= fpl * 4: score_map["ACA Marketplace (Subsidized)"] = 80
    elif income > fpl * 4:      score_map["ACA Marketplace (Full Price)"] = 65
    if has_deps and income <= fpl * 2: score_map["CHIP (for dependents)"] = 70
    if income > 60000 and not condition and age < 50: score_map["HDHP + HSA"] = 60

    reasons = {
        "Medicare":                      f"Age {age} qualifies for federal Medicare coverage",
        "Medicaid":                      f"Income ${income:,}/yr falls within Medicaid eligibility threshold",
        "Employer-Sponsored (ESI)":      "Employer-sponsored insurance typically offers best value when available",
        "ACA Marketplace (Subsidized)":  "Income qualifies for premium tax credits — significant monthly savings available",
        "ACA Marketplace (Full Price)":  "Marketplace plan with comprehensive coverage; no subsidy at this income level",
        "CHIP (for dependents)":         "Dependents qualify for Children's Health Insurance Program",
        "HDHP + HSA":                    "High-deductible plan with HSA maximizes tax savings for healthy high earners",
    }
    return [
        {"plan": name, "match_score": score, "reason": reasons.get(name, "")}
        for name, score in sorted(score_map.items(), key=lambda x: -x[1])
    ][:4]


def _compute_complexity(claim: dict) -> int:
    score = 0
    codes = claim.get("diagnosis_codes", [])
    score += min(len(codes) * 10, 30)
    if len(codes) > 3:                      score += 20
    if claim.get("prior_denial"):           score += 25
    amount = float(claim.get("amount", 0))
    if amount > 10000:                      score += 20
    elif amount > 5000:                     score += 10
    if claim.get("experimental_treatment"): score += 25
    if claim.get("out_of_network"):         score += 20
    return min(score, 100)


# ── Pipeline 1: Jargon Decoder ────────────────────────────────────────────────

def run_jargon_pipeline(notes: str, client: Optional[anthropic.Anthropic]) -> schemas.JargonOutput:
    trace: list[schemas.TraceStep] = []

    # Stage 1 — Build IR + Quality Gate
    t0 = time.monotonic()
    ir = schemas.ClinicalNoteIR.build(notes)
    gate = quality_gate.validate_clinical_note(ir)
    trace.append(schemas.TraceStep(
        stage="quality_gate",
        duration_ms=int((time.monotonic() - t0) * 1000),
        confidence=gate.confidence,
        issues=gate.issues,
    ))

    # Stage 2 — Entity Extraction (Haiku)
    entities, model_used, duration = entity_extractor.extract_from_clinical_note(notes, client)
    ir.entities = entities
    ir.entity_confidence = _mean_confidence(entities)
    trace.append(schemas.TraceStep(
        stage="entity_extraction",
        model=model_used,
        duration_ms=duration,
        entities_found=len(entities),
        confidence=ir.entity_confidence,
    ))

    # Stage 3 — RAG Retrieval
    t0 = time.monotonic()
    # Build query from extracted codes + raw text (first 200 chars)
    code_tokens = " ".join(e.code for e in entities)
    query = f"{code_tokens} {notes[:200]}"
    retrieved = rag.retrieve(query, top_k=4, doc_type="medical_code")
    ir.retrieved_docs = retrieved
    trace.append(schemas.TraceStep(
        stage="rag_retrieval",
        duration_ms=int((time.monotonic() - t0) * 1000),
        docs_retrieved=len(retrieved),
        confidence=retrieved[0].relevance if retrieved else 0.0,
    ))

    # Stage 4 — Gated Generation
    data, gen_model, gen_duration, sources_cited, hallucinations_stripped = generator.generate_jargon(ir, client)
    trace.append(schemas.TraceStep(
        stage="generation",
        model=gen_model,
        duration_ms=gen_duration,
        sources_cited=sources_cited,
        hallucinations_stripped=hallucinations_stripped,
    ))

    # Stage 5 — Post-validation
    t0 = time.monotonic()
    valid_ids = {d.id for d in retrieved}
    for cond in data.get("conditions", []):
        sid = cond.get("source_doc_id", "")
        if sid not in valid_ids and sid != "general_knowledge":
            cond["source_doc_id"] = "general_knowledge"
    trace.append(schemas.TraceStep(
        stage="citation_validation",
        duration_ms=int((time.monotonic() - t0) * 1000),
        hallucinations_stripped=hallucinations_stripped,
    ))

    return schemas.JargonOutput(
        data=data,
        source=gen_model if gen_model != "demo" else "demo",
        pipeline_trace=trace,
        entity_confidence=ir.entity_confidence,
        sources_cited=sources_cited,
        quality_issues=gate.issues,
    )


# ── Pipeline 2: Insurance Matcher ─────────────────────────────────────────────

def run_insurance_pipeline(
    profile: dict,
    client: Optional[anthropic.Anthropic],
) -> schemas.InsuranceOutput:
    trace: list[schemas.TraceStep] = []

    # Stage 1 — Build IR + Rule Engine + Quality Gate
    t0 = time.monotonic()
    ir = schemas.InsuranceProfileIR(
        age=int(profile["age"]),
        annual_income=int(profile["annual_income"]),
        state=profile.get("state", ""),
        employed=bool(profile.get("employed", False)),
        has_dependents=bool(profile.get("has_dependents", False)),
        chronic_condition=bool(profile.get("chronic_condition", False)),
    )
    ir.rule_engine_recs = _rule_based_match(profile)
    gate = quality_gate.validate_insurance_profile(ir)
    trace.append(schemas.TraceStep(
        stage="quality_gate",
        duration_ms=int((time.monotonic() - t0) * 1000),
        confidence=gate.confidence,
        issues=gate.issues,
    ))

    if not gate.passed:
        return schemas.InsuranceOutput(
            recommendations=[],
            ai_insight={"ai_insight": "Profile failed quality validation.", "key_consideration": "", "warning": None},
            source="error",
            pipeline_trace=trace,
            quality_issues=gate.issues,
        )

    # Stage 2 — RAG Retrieval (policy docs for top-matched plans)
    t0 = time.monotonic()
    query = " ".join(r["plan"] for r in ir.rule_engine_recs[:2])
    query += f" {profile.get('state', '')} income {ir.annual_income}"
    retrieved = rag.retrieve(query, top_k=3, doc_type="insurance_policy")
    ir.retrieved_docs = retrieved
    trace.append(schemas.TraceStep(
        stage="rag_retrieval",
        duration_ms=int((time.monotonic() - t0) * 1000),
        docs_retrieved=len(retrieved),
        confidence=retrieved[0].relevance if retrieved else 0.0,
    ))

    # Stage 3 — Gated AI Overlay (Haiku)
    overlay, gen_model, gen_duration, sources_cited, stripped = generator.generate_insurance_overlay(ir, client)
    trace.append(schemas.TraceStep(
        stage="generation",
        model=gen_model,
        duration_ms=gen_duration,
        sources_cited=sources_cited,
        hallucinations_stripped=stripped,
    ))

    return schemas.InsuranceOutput(
        recommendations=ir.rule_engine_recs,
        ai_insight=overlay,
        source=f"rule-engine + {gen_model}" if gen_model != "demo" else "rule-engine + demo",
        pipeline_trace=trace,
        sources_cited=sources_cited,
        quality_issues=gate.issues,
    )


# ── Pipeline 3: Claim Routing ─────────────────────────────────────────────────

def run_claim_pipeline(
    claim: dict,
    client: Optional[anthropic.Anthropic],
) -> schemas.ClaimOutput:
    import time as _time
    trace: list[schemas.TraceStep] = []

    # Stage 1 — Build IR + Complexity Scoring + Quality Gate
    t0 = time.monotonic()
    complexity = _compute_complexity(claim)
    route = "frontier" if complexity > 60 else "standard"
    ir = schemas.ClaimIR(
        patient_id=claim["patient_id"],
        provider_npi=claim["provider_npi"],
        procedure_code=claim["procedure_code"],
        diagnosis_codes=claim["diagnosis_codes"],
        amount=float(claim["amount"]),
        flags={
            "prior_denial": bool(claim.get("prior_denial", False)),
            "out_of_network": bool(claim.get("out_of_network", False)),
            "experimental_treatment": bool(claim.get("experimental_treatment", False)),
        },
        complexity_score=complexity,
        route=route,
    )
    gate = quality_gate.validate_claim(ir)
    trace.append(schemas.TraceStep(
        stage="quality_gate",
        duration_ms=int((time.monotonic() - t0) * 1000),
        confidence=gate.confidence,
        issues=gate.issues,
    ))

    if not gate.passed:
        return schemas.ClaimOutput(
            claim_id=f"CLM-REJECTED-{ir.patient_id[:4].upper()}",
            complexity_score=complexity,
            route=route,
            result={
                "decision": "pending_review",
                "confidence": 0,
                "reasoning": f"Claim failed quality gate: {'; '.join(gate.issues)}",
                "denial_reason": "; ".join(gate.issues),
                "appeal_path": "Correct the indicated code format errors and resubmit.",
                "estimated_reimbursement": None,
            },
            source="quality-gate",
            pipeline_trace=trace,
            quality_issues=gate.issues,
        )

    # Stage 2 — Entity / Code Validation (Haiku)
    validated, val_model, val_duration = entity_extractor.extract_claim_codes(
        ir.procedure_code, ir.diagnosis_codes, client
    )
    ir.validated_codes = validated
    mean_conf = _mean_confidence(validated)
    trace.append(schemas.TraceStep(
        stage="code_validation",
        model=val_model,
        duration_ms=val_duration,
        entities_found=len(validated),
        confidence=mean_conf,
    ))

    # Stage 3 — RAG Retrieval (denial patterns + code profiles)
    t0 = time.monotonic()
    flag_keywords = []
    if ir.flags["prior_denial"]:             flag_keywords.append("prior denial authorization")
    if ir.flags["out_of_network"]:           flag_keywords.append("out of network provider")
    if ir.flags["experimental_treatment"]:   flag_keywords.append("experimental investigational")
    query = f"{ir.procedure_code} {' '.join(ir.diagnosis_codes)} {' '.join(flag_keywords)}"

    # Retrieve denial patterns first (most relevant for adjudication)
    retrieved = rag.retrieve(query, top_k=3, doc_type="denial_pattern")
    # Also retrieve CPT code profile for the specific procedure
    cpt_docs  = rag.retrieve(ir.procedure_code, top_k=2, doc_type="medical_code")
    # Merge, deduplicate by ID, limit to 5 total
    seen_ids = {d.id for d in retrieved}
    for d in cpt_docs:
        if d.id not in seen_ids:
            retrieved.append(d)
            seen_ids.add(d.id)
    retrieved = retrieved[:5]

    ir.retrieved_docs = retrieved
    trace.append(schemas.TraceStep(
        stage="rag_retrieval",
        duration_ms=int((time.monotonic() - t0) * 1000),
        docs_retrieved=len(retrieved),
        confidence=retrieved[0].relevance if retrieved else 0.0,
    ))

    # Stage 4 — Gated Adjudication (Haiku standard / Sonnet frontier)
    result, gen_model, gen_duration, sources_cited, stripped = generator.generate_claim_decision(ir, client)
    trace.append(schemas.TraceStep(
        stage="adjudication",
        model=gen_model,
        duration_ms=gen_duration,
        sources_cited=sources_cited,
        hallucinations_stripped=stripped,
    ))

    import time as t_mod
    claim_id = f"CLM-{int(t_mod.time())}-{ir.patient_id[:4].upper()}"

    return schemas.ClaimOutput(
        claim_id=claim_id,
        complexity_score=complexity,
        route=route,
        result=result,
        source=gen_model if gen_model != "demo" else "demo",
        pipeline_trace=trace,
        entity_confidence=mean_conf,
        sources_cited=sources_cited,
        quality_issues=gate.issues,
    )
