"""Patient portal — health summary (conditions, medications)."""
from fastapi import APIRouter, Depends, HTTPException
from backend.core.auth import require_role
from backend.core.multitenancy import org_list
from backend.core.audit import log_access
from backend.core.database import get_db

router = APIRouter()


@router.get("/health")
async def get_health_summary(
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("patient_id") or user.get("sub", "")
    org_id = user.get("org_id", "")
    db = get_db()

    if db is None:
        return {
            "conditions": [{"icd10_code": "I10", "description": "Essential Hypertension", "status": "active"}],
            "medications": [{"name": "Lisinopril 10mg", "dose": "10mg", "status": "active"}],
            "source": "demo",
        }

    conditions = org_list("patient_conditions", org_id, {"patient_id": patient_id})
    medications = org_list("patient_medications", org_id, {"patient_id": patient_id})
    await log_access(user["sub"], org_id, "patient_health", patient_id, "read")
    return {"conditions": conditions, "medications": medications}
