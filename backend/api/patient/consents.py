"""Patient consents for autonomous actions."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.core.database import get_db
import time

router = APIRouter()


class ConsentUpdate(BaseModel):
    consent_type: str
    consented: bool


@router.get("/consents")
async def get_consents(
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("sub", "")
    db = get_db()
    if db is None:
        return {"consents": [
            {"consent_type": "autonomous_actions", "consented": True},
            {"consent_type": "sms_notifications", "consented": True},
        ]}
    result = db.table("patient_consents").select("*").eq("patient_id", patient_id).execute()
    return {"consents": result.data or []}


@router.post("/consents")
async def update_consent(
    body: ConsentUpdate,
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("sub", "")
    org_id = user.get("org_id", "")
    db = get_db()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if db:
        db.table("patient_consents").upsert({
            "patient_id": patient_id, "org_id": org_id,
            "consent_type": body.consent_type,
            "consented": body.consented,
            "consented_at": now if body.consented else None,
            "revoked_at": None if body.consented else now,
        }, on_conflict="patient_id,consent_type").execute()
    return {"status": "ok", "consent_type": body.consent_type, "consented": body.consented}
