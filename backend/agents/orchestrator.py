"""
Multi-agent pipeline orchestrator.
Coordinates quality gate → entity extraction → RAG retrieval → generation.

ML models used (all lazy-loaded from real data on first call):
  denial_predictor  — GradientBoosting trained on DataFog/medical-transcription-instruct
  readmission       — ICD-10 frequency index from birgermoell/icd10-clinical-notes + CMS HRRP
  entity_extractor  — HuggingFace Inference API → Claude Haiku → regex
"""

from __future__ import annotations

import time
from typing import Optional

import anthropic

from backend.ir import schemas
from backend.ir import quality_gate
from backend.rag import retriever as rag
from backend.agents import entity_extractor, generator
from backend.ml import denial_predictor, readmission


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mean_confidence(entities: list[schemas.EntityTag]) -> float:
    if not entities:
        return 0.0
    return round(sum(e.confidence for e in entities) / len(entities), 3)


def _rule_based_match(patient: dict) -> list[dict]:
    """Deterministic insurance plan scoring from ACA/CMS eligibility rules."""
    age      = int(patient.get("age", 0))
    income   = int(patient.get("annual_income", 0))
    employed = patient.get("employed", False)
    has_deps = patient.get("has_dependents", False)
    condition = patient.get("chronic_condition", False)
    fpl      = 20120 + (4720 * (2 if has_deps else 0))

    score_map: dict[str, int] = {}
    if age >= 65:                           score_map["Medicare"] = 95
    elif age >= 60:                         score_map["Medicare"] = 40
    if income <= fpl:                       score_map["Medicaid"] = 90
    elif income <= fpl * 1.5:              score_map["Medicaid"] = 50
    if employed:                            score_map["Employer-Sponsored (ESI)"] = 85
    if fpl < income <= fpl * 4:            score_map["ACA Marketplace (Subsidized)"] = 80
    elif income > fpl * 4:                 score_map["ACA Marketplace (Full Price)"] = 65
    if has_deps and income <= fpl * 2:     score_map["CHIP (for dependents)"] = 70
    if income > 60000 and not condition and age < 50:
        score_map["HDHP + HSA"] = 60

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


def _compute_complexity(claim: dict, notes: str = "") -> tuple[int, denial_predictor.DenialPrediction]:
    """
    Compute claim complexity using the real ML denial predictor.
    Returns (complexity_0_100, DenialPrediction).
    Replaces the old hardcoded flag-counting heuristic.
    """
    flags = {
        "prior_denial":           bool(claim.get("prior_denial", False)),
        "out_of_network":         bool(claim.get("out_of_network", False)),
        "experimental_treatment": bool(claim.get("experimental_treatment", False)),
    }
    # Use clinical notes if provided, otherwise use serialized claim data as text
    text = notes or (
        f"procedure {claim.get('procedure_code', '')} "
        f"diagnoses {' '.join(claim.get('diagnosis_codes', []))} "
        f"amount {claim.get('amount', 0)}"
    )
    pred = denial_predictor.predict(text, claim_flags=flags)
    return denial_predictor.to_complexity_score_100(pred), pred


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

    # Stage 2 — Entity Extraction (HF NER → Claude Haiku → regex)
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

    # Stage 3 — RAG Retrieval (pgvector → BM25 fallback)
    t0 = time.monotonic()
    code_tokens = " ".join(e.code for e in entities)
    query = f"{code_tokens} {notes[:200]}"
    retrieved = rag.retrieve(query, top_k=5, doc_type="medical_code")
    ir.retrieved_docs = retrieved
    trace.append(schemas.TraceStep(
        stage="rag_retrieval",
        duration_ms=int((time.monotonic() - t0) * 1000),
        docs_retrieved=len(retrieved),
        confidence=retrieved[0].relevance if retrieved else 0.0,
    ))

    # Stage 3b — Readmission risk (ML model from birgermoell + CMS HRRP)
    t0 = time.monotonic()
    icd10_codes = [e.code for e in entities if e.entity_type == "diagnosis"]
    readmission_risk = readmission.score_patient(icd10_codes)
    trace.append(schemas.TraceStep(
        stage="readmission_risk",
        duration_ms=int((time.monotonic() - t0) * 1000),
        confidence=readmission_risk.score,
    ))

    # Stage 4 — Gated Generation (Claude Haiku with RAG context)
    data, gen_model, gen_duration, sources_cited, hallucinations_stripped = generator.generate_jargon(ir, client)

    # Inject readmission risk into output
    data["readmission_risk"] = {
        "score": readmission_risk.score,
        "level": readmission_risk.risk_level,
        "driving_codes": readmission_risk.driving_codes,
        "calibrated_with_cms": readmission_risk.calibrated,
    }

    trace.append(schemas.TraceStep(
        stage="generation",
        model=gen_model,
        duration_ms=gen_duration,
        sources_cited=sources_cited,
        hallucinations_stripped=hallucinations_stripped,
    ))

    # Stage 5 — Citation validation
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
    trace: list[schemas.TraceStep] = []

    # Stage 1 — ML complexity scoring (replaces hardcoded heuristic)
    t0 = time.monotonic()
    complexity, denial_pred = _compute_complexity(claim)
    route = "frontier" if complexity > 60 else "standard"

    ir = schemas.ClaimIR(
        patient_id=claim["patient_id"],
        provider_npi=claim["provider_npi"],
        procedure_code=claim["procedure_code"],
        diagnosis_codes=claim["diagnosis_codes"],
        amount=float(claim["amount"]),
        flags={
            "prior_denial":           bool(claim.get("prior_denial", False)),
            "out_of_network":         bool(claim.get("out_of_network", False)),
            "experimental_treatment": bool(claim.get("experimental_treatment", False)),
        },
        complexity_score=complexity,
        route=route,
    )
    gate = quality_gate.validate_claim(ir)
    trace.append(schemas.TraceStep(
        stage="ml_complexity_scoring",
        duration_ms=int((time.monotonic() - t0) * 1000),
        confidence=denial_pred.denial_probability,
        issues=[
            f"model={denial_pred.model_source}",
            f"top_features={denial_pred.features_used[:3]}",
        ],
    ))
    trace.append(schemas.TraceStep(
        stage="quality_gate",
        duration_ms=0,
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

    # Stage 2 — Code validation (Claude Haiku)
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

    # Stage 3 — RAG (denial patterns + CPT profiles)
    t0 = time.monotonic()
    flag_keywords = []
    if ir.flags["prior_denial"]:           flag_keywords.append("prior denial authorization")
    if ir.flags["out_of_network"]:         flag_keywords.append("out of network provider")
    if ir.flags["experimental_treatment"]: flag_keywords.append("experimental investigational")
    query = f"{ir.procedure_code} {' '.join(ir.diagnosis_codes)} {' '.join(flag_keywords)}"

    retrieved = rag.retrieve(query, top_k=3, doc_type="denial_pattern")
    cpt_docs = rag.retrieve(ir.procedure_code, top_k=2, doc_type="medical_code")
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

    # Stage 4 — Gated adjudication
    result, gen_model, gen_duration, sources_cited, stripped = generator.generate_claim_decision(ir, client)

    # Attach ML denial probability to result
    result["ml_denial_probability"] = denial_pred.denial_probability
    result["ml_features"] = denial_pred.features_used[:5]

    trace.append(schemas.TraceStep(
        stage="adjudication",
        model=gen_model,
        duration_ms=gen_duration,
        sources_cited=sources_cited,
        hallucinations_stripped=stripped,
    ))

    claim_id = f"CLM-{int(time.time())}-{ir.patient_id[:4].upper()}"

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
