"""Physician Navigator — unified intake pipeline (stub expanded in Phase 4)."""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user, require_role
from backend.core.config import settings
from backend.agents import orchestrator

router = APIRouter()


class NavigatorRequest(BaseModel):
    notes: str
    patient_id: Optional[str] = None
    # Insurance profile — optional; enables insurance pipeline
    age: Optional[int] = None
    annual_income: Optional[int] = None
    employed: Optional[bool] = False
    state: Optional[str] = ""
    has_dependents: Optional[bool] = False
    chronic_condition: Optional[bool] = False


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
    Unified Navigator — runs all AI pipelines in parallel from one clinical note.
    Phase 4 expands this with PatientEncounterIR, action queue, and timeline population.
    """
    notes = body.notes.strip()
    if not notes:
        raise HTTPException(status_code=400, detail="'notes' is required")

    client = _client()

    # Run jargon + insurance pipelines concurrently in Phase 4 via asyncio.gather.
    # For Phase 0, run sequentially to keep the port faithful.
    results: dict = {}

    jargon_out = orchestrator.run_jargon_pipeline(notes, client)
    results["jargon"] = jargon_out.to_dict()

    if body.age is not None and body.annual_income is not None:
        ins_out = orchestrator.run_insurance_pipeline(
            {
                "age": body.age,
                "annual_income": body.annual_income,
                "employed": body.employed,
                "state": body.state,
                "has_dependents": body.has_dependents,
                "chronic_condition": body.chronic_condition,
            },
            client,
        )
        results["insurance"] = ins_out.to_dict()

    return {
        "pipelines": results,
        "patient_id": body.patient_id,
        "physician": user.get("name"),
    }
