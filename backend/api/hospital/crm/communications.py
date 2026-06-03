"""Patient communications log."""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert

router = APIRouter()


class CommunicationCreate(BaseModel):
    patient_id: str
    channel: str
    direction: str
    subject: Optional[str] = None
    body: str
    ai_generated: Optional[bool] = False


@router.get("/patients/{patient_id}/communications")
async def list_communications(
    patient_id: str,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    comms = org_list("communications", org_id, {"patient_id": patient_id})
    return {"communications": comms}


@router.post("/communications", status_code=201)
async def log_communication(
    body: CommunicationCreate,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    row = org_insert("communications", org_id, {
        **body.model_dump(),
        "sent_by": user.get("name", ""),
    })
    return row
