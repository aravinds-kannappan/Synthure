"""Hospital CRM — payer records and live scorecard."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_get, org_insert, org_update

router = APIRouter()


class PayerCreate(BaseModel):
    name: str
    edi_payer_id: Optional[str] = None
    pa_phone: Optional[str] = None
    portal_url: Optional[str] = None
    timely_filing_days: Optional[int] = 90
    contract_renewal_date: Optional[str] = None


@router.get("/payers")
async def list_payers(
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    payers = org_list("payers", org_id)
    # Flag payers with contract renewals within 30 days
    from datetime import date, timedelta
    warn_date = (date.today() + timedelta(days=30)).isoformat()
    for p in payers:
        p["renewal_alert"] = bool(
            p.get("contract_renewal_date") and p["contract_renewal_date"] <= warn_date
        )
    return {"payers": payers, "total": len(payers)}


@router.get("/payers/{payer_id}")
async def get_payer(
    payer_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    payer = org_get("payers", org_id, payer_id)
    if not payer:
        raise HTTPException(status_code=404, detail="Payer not found")
    return payer


@router.post("/payers", status_code=201)
async def create_payer(
    body: PayerCreate,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    return org_insert("payers", org_id, body.model_dump(exclude_none=True))


@router.patch("/payers/{payer_id}/scorecard")
async def update_scorecard(
    payer_id: str,
    denial_rate: Optional[float] = None,
    avg_days_to_pay: Optional[float] = None,
    appeal_win_rate: Optional[float] = None,
    pa_approval_rate: Optional[float] = None,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    updates = {k: v for k, v in {
        "denial_rate": denial_rate,
        "avg_days_to_pay": avg_days_to_pay,
        "appeal_win_rate": appeal_win_rate,
        "pa_approval_rate": pa_approval_rate,
    }.items() if v is not None}
    return org_update("payers", org_id, payer_id, updates)
