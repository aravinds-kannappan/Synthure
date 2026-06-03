"""FHIR R4 integration endpoints — Epic sandbox pull."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.integrations.fhir_client import fetch_patient, fetch_encounter_documents
from backend.agents.intake_agent import from_fhir

router = APIRouter()


class FHIRPullRequest(BaseModel):
    patient_id: str
    access_token: str


@router.post("/fhir/pull")
async def pull_from_fhir(
    body: FHIRPullRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    patient = await fetch_patient(body.patient_id, body.access_token)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found in FHIR")
    documents = await fetch_encounter_documents(body.patient_id, body.access_token)
    ir = from_fhir({"resourceType": "Bundle", "entry": [{"resource": d} for d in documents]})
    return {
        "patient": patient,
        "documents_found": len(documents),
        "encounter_ir": {"raw_note": ir.raw_note[:500] if ir.raw_note else ""},
    }
