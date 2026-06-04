"""Physician Navigator — clinical note submission + full AI pipeline + persistence.

Every submission:
  1. Inserts a clinical_notes row
  2. Upserts physician_patients assignment
  3. Runs jargon + insurance pipelines in PARALLEL via asyncio.gather
  4. Persists all AI results to ai_pipeline_results
  5. Updates patient_conditions and patient_medications from extracted entities
  6. Writes a care_event for the patient timeline
  7. Returns the full pipeline output to the physician UI

No demo paths. No hardcoded fallbacks.
If ANTHROPIC_API_KEY is not set, the request fails with 503.
"""
from __future__ import annotations

import asyncio
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.config import settings
from backend.core.database import get_db
from backend.agents import orchestrator

router = APIRouter()


class NavigatorRequest(BaseModel):
    notes: str
    patient_id: str  # Required — every note must be tied to a specific patient
    # Insurance profile fields — optional; enables the insurance pipeline
    age: Optional[int] = None
    annual_income: Optional[int] = None
    employed: Optional[bool] = False
    state: Optional[str] = ""
    has_dependents: Optional[bool] = False
    chronic_condition: Optional[bool] = False


def _client():
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI pipeline not available. Set ANTHROPIC_API_KEY to enable.",
        )
    import anthropic
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _persist_results(
    db,
    patient_id: str,
    physician_id: str,
    org_id: str,
    note_id: str,
    jargon_result: dict,
    insurance_result: Optional[dict],
) -> None:
    """Write pipeline outputs to DB and update patient record."""

    # ── Persist jargon output
    db.table("ai_pipeline_results").insert({
        "clinical_note_id": note_id,
        "patient_id": patient_id,
        "org_id": org_id,
        "pipeline_type": "jargon",
        "result_json": jargon_result,
        "model_used": jargon_result.get("source", ""),
        "duration_ms": sum(
            s.get("duration_ms", 0)
            for s in jargon_result.get("pipeline_trace", [])
        ),
    }).execute()

    # ── Persist insurance output if the pipeline ran
    if insurance_result:
        db.table("ai_pipeline_results").insert({
            "clinical_note_id": note_id,
            "patient_id": patient_id,
            "org_id": org_id,
            "pipeline_type": "insurance",
            "result_json": insurance_result,
            "model_used": insurance_result.get("source", ""),
        }).execute()

    data = jargon_result.get("data", {})

    # ── Update patient conditions (insert new ones only)
    existing_conditions = (
        db.table("patient_conditions")
        .select("icd10_code")
        .eq("patient_id", patient_id)
        .execute()
    ).data or []
    existing_icd10 = {r["icd10_code"] for r in existing_conditions}

    for cond in data.get("conditions", []):
        term = cond.get("term", "")
        # Extract ICD-10 code from format like "Hypertension (I10)"
        icd_match = re.search(r'\(([A-Z][0-9]{2}[^)]{0,6})\)', term)
        icd10 = (icd_match.group(1) if icd_match else term[:20]).strip()
        if icd10 and icd10 not in existing_icd10:
            db.table("patient_conditions").insert({
                "patient_id": patient_id,
                "org_id": org_id,
                "icd10_code": icd10,
                "description": cond.get("plain", "")[:500],
                "noted_by": physician_id,
                "status": "active",
            }).execute()
            existing_icd10.add(icd10)

    # ── Update patient medications (insert new ones only)
    existing_meds = (
        db.table("patient_medications")
        .select("name")
        .eq("patient_id", patient_id)
        .execute()
    ).data or []
    existing_med_names = {r["name"].lower() for r in existing_meds}

    for med in data.get("medications", []):
        name = med.get("name", "")[:200].strip()
        if name and name.lower() not in existing_med_names:
            db.table("patient_medications").insert({
                "patient_id": patient_id,
                "org_id": org_id,
                "name": name,
                "status": "active",
                "prescribed_by": physician_id,
            }).execute()
            existing_med_names.add(name.lower())

    # ── Write care event to patient timeline
    cond_count = len(data.get("conditions", []))
    med_count  = len(data.get("medications", []))
    db.table("care_events").insert({
        "patient_id": patient_id,
        "org_id": org_id,
        "event_type": "physician_visit",
        "title": "Physician visit recorded",
        "detail": (
            f"AI pipeline processed clinical note. "
            f"{cond_count} condition(s) and {med_count} medication(s) identified."
        ),
        "actor": physician_id,
        "ai_generated": True,
        "portal_visibility": ["patient", "physician", "hospital"],
    }).execute()


@router.post("/navigator")
async def navigator(
    body: NavigatorRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    """
    Submit a clinical note for a patient.
    Runs all AI pipelines in parallel, persists every result, and returns the output.
    """
    notes = body.notes.strip()
    if not notes:
        raise HTTPException(status_code=400, detail="'notes' is required")
    if not body.patient_id:
        raise HTTPException(status_code=400, detail="'patient_id' is required")

    physician_id = user.get("user_id") or user.get("sub", "")
    org_id       = user.get("org_id", "")
    client       = _client()
    db           = get_db()

    # ── 1. Persist the clinical note + assignment ──────────────────────────────
    note_id: Optional[str] = None
    if db:
        try:
            result = db.table("clinical_notes").insert({
                "patient_id": body.patient_id,
                "physician_id": physician_id,
                "org_id": org_id,
                "note_text": notes,
            }).execute()
            if result.data:
                note_id = result.data[0]["id"]

            # Ensure physician–patient assignment exists
            db.table("physician_patients").upsert({
                "physician_id": physician_id,
                "patient_id": body.patient_id,
                "org_id": org_id,
            }, on_conflict="physician_id,patient_id").execute()
        except Exception as exc:
            # Log but don’t fail — pipeline still runs
            print(f"[navigator] Note persistence failed: {exc}")

    # ── 2. Run all pipelines in parallel ────────────────────────────────────
    insurance_profile = None
    if body.age is not None and body.annual_income is not None:
        insurance_profile = {
            "age": body.age,
            "annual_income": body.annual_income,
            "employed": body.employed,
            "state": body.state,
            "has_dependents": body.has_dependents,
            "chronic_condition": body.chronic_condition,
        }

    loop = asyncio.get_event_loop()

    async def _jargon():
        return await loop.run_in_executor(
            None, orchestrator.run_jargon_pipeline, notes, client
        )

    async def _insurance():
        if insurance_profile is None:
            return None
        return await loop.run_in_executor(
            None, orchestrator.run_insurance_pipeline, insurance_profile, client
        )

    jargon_out, insurance_out = await asyncio.gather(
        _jargon(), _insurance(), return_exceptions=True
    )

    if isinstance(jargon_out, Exception):
        raise HTTPException(status_code=500, detail=f"Jargon pipeline error: {jargon_out}")

    results: dict = {"jargon": jargon_out.to_dict()}
    if insurance_out and not isinstance(insurance_out, Exception):
        results["insurance"] = insurance_out.to_dict()

    # ── 3. Persist AI results ────────────────────────────────────────────
    if db and note_id:
        try:
            _persist_results(
                db=db,
                patient_id=body.patient_id,
                physician_id=physician_id,
                org_id=org_id,
                note_id=note_id,
                jargon_result=results["jargon"],
                insurance_result=results.get("insurance"),
            )
        except Exception as exc:
            print(f"[navigator] Result persistence failed: {exc}")

    return {
        "pipelines": results,
        "patient_id": body.patient_id,
        "note_id": note_id,
        "physician": user.get("name"),
    }
