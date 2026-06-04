"""Hospital CRM — patient records."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_get, org_insert, org_update
from backend.core.audit import log_access

router = APIRouter()


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    sex: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mrn: Optional[str] = None
    primary_language: Optional[str] = "en"


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    primary_language: Optional[str] = None


@router.get("/patients")
async def list_patients(
    user: dict = Depends(require_role("hospital_admin", "physician", "provider")),
):
    org_id = user.get("org_id", "")
    patients = org_list("patients", org_id)
    await log_access(user["sub"], org_id, "patients", "*", "list")
    return {"patients": patients, "total": len(patients)}


@router.get("/patients/{patient_id}")
async def get_patient(
    patient_id: str,
    user: dict = Depends(require_role("hospital_admin", "physician", "provider")),
):
    org_id = user.get("org_id", "")
    patient = org_get("patients", org_id, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    await log_access(user["sub"], org_id, "patients", patient_id, "read")
    # Attach conditions, medications, insurance, timeline
    conditions = org_list("patient_conditions", org_id, {"patient_id": patient_id})
    medications = org_list("patient_medications", org_id, {"patient_id": patient_id})
    insurance = org_list("patient_insurance", org_id, {"patient_id": patient_id})
    documents = org_list("patient_documents", org_id, {"patient_id": patient_id})
    return {
        **patient,
        "conditions": conditions,
        "medications": medications,
        "insurance": insurance,
        "documents": documents,
    }


@router.post("/patients", status_code=201)
async def create_patient(
    body: PatientCreate,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    row = org_insert("patients", org_id, body.model_dump(exclude_none=True))
    await log_access(user["sub"], org_id, "patients", row.get("id", ""), "create")
    return row


@router.patch("/patients/{patient_id}")
async def update_patient(
    patient_id: str,
    body: PatientUpdate,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    row = org_update("patients", org_id, patient_id, body.model_dump(exclude_none=True))
    await log_access(user["sub"], org_id, "patients", patient_id, "update")
    return row
