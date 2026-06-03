"""Patient portal — claims in plain English."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()

STATUS_PLAIN: dict[str, str] = {
    "draft":        "Being prepared",
    "validated":    "Reviewed and ready to send",
    "submitted":    "Sent to your insurance",
    "acknowledged": "Your insurance received it",
    "adjudicated":  "Decision made",
    "paid":         "Paid",
    "denied":       "Denied — appeal in progress",
    "appealed":     "Appeal filed",
    "voided":       "Cancelled",
}


@router.get("/claims")
async def get_patient_claims(
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("patient_id") or user.get("sub", "")
    db = get_db()

    if db is None:
        return {
            "claims": [{
                "id": "demo-1", "procedure_code": "99215",
                "amount": 350, "status": "paid",
                "status_plain": "Paid", "paid_amount": 285,
                "patient_responsibility": 45,
            }],
            "source": "demo",
        }

    result = db.table("claims").select("id,procedure_code,amount,status,paid_amount,patient_responsibility,submitted_at,paid_at").eq("patient_id", patient_id).execute()
    claims = []
    for c in (result.data or []):
        claims.append({**c, "status_plain": STATUS_PLAIN.get(c["status"], c["status"])})
    return {"claims": claims}
