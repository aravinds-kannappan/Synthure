"""Eligibility verification — auto-runs before every claim."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert

router = APIRouter()


class EligibilityRequest(BaseModel):
    patient_id: str
    payer_id: Optional[str] = None
    insurance_id: Optional[str] = None


@router.post("/eligibility/verify")
async def verify_eligibility(
    body: EligibilityRequest,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    """
    Verify patient eligibility with the payer.
    Real EDI 270/271 integration added in Phase 6.
    Currently returns a structured demo response and logs the check.
    """
    org_id = user.get("org_id", "")

    # Stub: in production this calls the payer EDI endpoint
    demo_result = {
        "status": "active",
        "deductible_met": 250.00,
        "oop_met": 750.00,
        "copay": 30.00,
        "coinsurance": 20.0,
    }

    check = org_insert("eligibility_checks", org_id, {
        "patient_id": body.patient_id,
        "payer_id": body.payer_id,
        "insurance_id": body.insurance_id,
        "status": demo_result["status"],
        "deductible_met": demo_result["deductible_met"],
        "oop_met": demo_result["oop_met"],
        "copay": demo_result["copay"],
        "coinsurance": demo_result["coinsurance"],
        "raw_response": demo_result,
    })
    return {"eligibility": check, "source": "demo"}


@router.get("/eligibility/{patient_id}/history")
async def eligibility_history(
    patient_id: str,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    checks = org_list("eligibility_checks", org_id, {"patient_id": patient_id})
    return {"checks": checks}
