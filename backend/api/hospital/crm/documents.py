"""Patient document upload + AI classification endpoint."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert
from backend.core.config import settings

router = APIRouter()


_DOCUMENT_TYPES = (
    "denial_letter", "eob", "insurance_card", "lab_result",
    "referral", "prior_auth", "discharge_summary", "other"
)


@router.get("/patients/{patient_id}/documents")
async def list_documents(
    patient_id: str,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    docs = org_list("patient_documents", org_id, {"patient_id": patient_id})
    return {"documents": docs}


@router.post("/patients/{patient_id}/documents", status_code=201)
async def upload_document(
    patient_id: str,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    """
    Upload a document and trigger AI classification.
    - denial_letter → extracts CARC code, finds claim, queues appeal
    - insurance_card → Claude Vision OCR → populates patient_insurance
    - eob → payment reconciliation
    - lab_result → attached to record, physician notified
    Full document intelligence implemented in Phase 10.
    """
    org_id = user.get("org_id", "")
    content = await file.read()

    row = org_insert("patient_documents", org_id, {
        "patient_id": patient_id,
        "document_type": document_type,
        "file_name": file.filename,
        "ai_classification": document_type,
        "visible_to_patient": document_type in ("eob", "lab_result", "discharge_summary"),
    })

    return {
        "document": row,
        "ai_action": f"Document queued for processing (Phase 10: document intelligence)",
    }
