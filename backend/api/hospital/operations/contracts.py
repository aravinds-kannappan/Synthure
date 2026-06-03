"""Payer contract management + renewal alerts."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.multitenancy import org_list
from datetime import date, timedelta

router = APIRouter()


@router.get("/contracts/alerts")
async def contract_renewal_alerts(
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    payers = org_list("payers", org_id)
    warn_date = (date.today() + timedelta(days=30)).isoformat()

    alerts = [
        {
            "payer_id": p["id"],
            "payer_name": p["name"],
            "renewal_date": p["contract_renewal_date"],
            "days_remaining": (date.fromisoformat(p["contract_renewal_date"]) - date.today()).days,
        }
        for p in payers
        if p.get("contract_renewal_date") and p["contract_renewal_date"] <= warn_date
    ]
    return {"alerts": alerts}
