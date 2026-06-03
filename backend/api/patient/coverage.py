"""Patient portal — insurance coverage + deductible/OOP status."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.multitenancy import org_list
from backend.core.database import get_db

router = APIRouter()


@router.get("/coverage")
async def get_coverage(
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("patient_id") or user.get("sub", "")
    org_id = user.get("org_id", "")
    db = get_db()

    if db is None:
        return {
            "insurance": [{
                "plan_name": "Aetna Bronze HSA", "coverage_type": "primary",
                "deductible": 3000, "deductible_met": 850,
                "oop_max": 7000, "oop_met": 1200,
                "copay": 30,
            }],
            "source": "demo",
        }

    insurance = org_list("patient_insurance", org_id, {"patient_id": patient_id})
    return {"insurance": insurance}
