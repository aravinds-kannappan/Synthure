"""Payment posting + reconciliation."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert, org_update, org_get

router = APIRouter()


class PaymentPost(BaseModel):
    claim_id: str
    payer_id: Optional[str] = None
    payment_amount: float
    contractual_adj: Optional[float] = 0.0
    other_adj: Optional[float] = 0.0
    patient_resp: Optional[float] = 0.0
    era_reference: Optional[str] = None


@router.post("/payments", status_code=201)
async def post_payment(
    body: PaymentPost,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")

    claim = org_get("claims", org_id, body.claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    expected = float(claim["amount"])
    total_paid = body.payment_amount + (body.contractual_adj or 0)
    underpayment = total_paid < (expected * 0.95)  # flag if paid < 95% of billed

    payment = org_insert("payments", org_id, {
        **body.model_dump(),
        "underpayment_flag": underpayment,
    })

    # Transition claim to paid
    org_update("claims", org_id, body.claim_id, {
        "status": "paid",
        "paid_amount": body.payment_amount,
        "patient_responsibility": body.patient_resp or 0,
    })

    return {
        "payment": payment,
        "underpayment_flagged": underpayment,
        "expected": expected,
        "received": body.payment_amount,
    }


@router.get("/claims/{claim_id}/payments")
async def list_claim_payments(
    claim_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    payments = org_list("payments", org_id, {"claim_id": claim_id})
    return {"payments": payments}
