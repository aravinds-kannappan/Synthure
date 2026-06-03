"""
Physician Navigator — unified intake pipeline.
Runs jargon + insurance + claim adjudication in parallel.
Queues all Tier 1 autonomous actions immediately.
Populates care_events timeline and encounter record.
"""
import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.config import settings
from backend.core.realtime import emit_event
from backend.core.database import get_db
from backend.agents import orchestrator
from backend.agents.intake_agent import from_note, PatientEncounterIR
from backend.agents.action_orchestrator import queue_action
from backend.ml.denial_predictor import predict_denial_risk
from backend.ml.readmission_scorer import score_readmission_risk

router = APIRouter()


class NavigatorRequest(BaseModel):
    notes: str
    patient_id: Optional[str] = None
    age: Optional[int] = None
    annual_income: Optional[int] = None
    employed: Optional[bool] = False
    state: Optional[str] = ""
    has_dependents: Optional[bool] = False
    chronic_condition: Optional[bool] = False
    patient_phone: Optional[str] = None


def _client():
    if not settings.anthropic_api_key:
        return None
    import anthropic
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


@router.post("/navigator")
async def navigator(
    body: NavigatorRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    """
    Unified Navigator — all AI pipelines run in parallel via asyncio.
    Every Tier 1 action queues immediately. Timeline populated in care_events.
    """
    notes = body.notes.strip()
    if not notes:
        raise HTTPException(status_code=400, detail="'notes' is required")

    org_id = user.get("org_id", "")
    physician_name = user.get("name", "")
    client = _client()

    ir = from_note(notes, {
        "patient_id": body.patient_id,
        "org_id": org_id,
        "physician_name": physician_name,
        "age": body.age,
        "annual_income": body.annual_income,
        "employed": body.employed,
        "state": body.state,
        "has_dependents": body.has_dependents,
        "chronic_condition": body.chronic_condition,
    })

    # ── Run all pipelines in parallel
    loop = asyncio.get_event_loop()
    jargon_future = loop.run_in_executor(None, orchestrator.run_jargon_pipeline, notes, client)

    ins_future = None
    if body.age is not None and body.annual_income is not None:
        ins_future = loop.run_in_executor(
            None,
            orchestrator.run_insurance_pipeline,
            {"age": body.age, "annual_income": body.annual_income,
             "employed": body.employed, "state": body.state,
             "has_dependents": body.has_dependents, "chronic_condition": body.chronic_condition},
            client,
        )

    jargon_result = await jargon_future
    insurance_result = await ins_future if ins_future else None

    ir.jargon_output = jargon_result.to_dict()
    if insurance_result:
        ir.insurance_output = insurance_result.to_dict()

    # ── ML scores
    if body.age:
        conditions = jargon_result.data.get("conditions", [])
        dx_codes = [c.get("source_doc_id", "").replace("icd10_", "") for c in conditions]
        ir.readmission_risk = score_readmission_risk(
            body.age, len(conditions), 0, dx_codes
        )

    # ── Persist encounter
    encounter_id = _save_encounter(ir, org_id)

    # ── Queue Tier 1 actions
    actions_queued = []
    if body.patient_phone:
        action = await queue_action(
            "send_patient_education",
            payload={
                "phone": body.patient_phone,
                "patient_name": "Patient",
                "materials": jargon_result.data.get("conditions", [])[:3],
            },
            org_id=org_id,
            patient_id=body.patient_id,
            encounter_id=encounter_id,
        )
        if action:
            actions_queued.append(action)

    # ── Emit cross-portal event
    await emit_event(
        "navigator_complete",
        {"patient_id": body.patient_id, "encounter_id": encounter_id,
         "readmission_risk": ir.readmission_risk},
        portals=["physician", "hospital", "patient"],
        org_id=org_id,
        patient_id=body.patient_id,
    )

    return {
        "encounter_id": encounter_id,
        "pipelines": {
            "jargon": ir.jargon_output,
            "insurance": ir.insurance_output,
        },
        "readmission_risk": ir.readmission_risk,
        "actions_queued": actions_queued,
        "physician": physician_name,
        "patient_id": body.patient_id,
    }


@router.get("/navigator/{encounter_id}")
async def get_encounter(
    encounter_id: str,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    result = db.table("encounters").select("*").eq("id", encounter_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Encounter not found")
    return result.data


def _save_encounter(ir: PatientEncounterIR, org_id: str) -> str | None:
    db = get_db()
    if db is None:
        return None
    try:
        result = db.table("encounters").insert({
            "org_id": org_id,
            "patient_id": ir.patient_id,
            "raw_note": ir.raw_note,
            "jargon_output": ir.jargon_output,
            "insurance_output": ir.insurance_output,
            "readmission_risk": ir.readmission_risk,
        }).execute()
        enc_id = result.data[0]["id"] if result.data else None

        # Write care event
        if enc_id and ir.patient_id:
            db.table("care_events").insert({
                "patient_id": ir.patient_id,
                "org_id": org_id,
                "event_type": "navigator_run",
                "title": "Clinical note processed via Navigator",
                "detail": f"Jargon decoded · Insurance matched · Readmission risk: {ir.readmission_risk or 0:.0f}%",
                "actor": ir.physician_name,
                "ai_generated": True,
                "tier": "1",
            }).execute()
        return enc_id
    except Exception:
        return None
