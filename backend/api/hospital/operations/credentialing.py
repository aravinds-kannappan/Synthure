"""Provider credentialing tracking + renewal workflow."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.multitenancy import org_list
from datetime import date, timedelta

router = APIRouter()

ALERT_DAYS = 90


@router.get("/credentialing/alerts")
async def credentialing_alerts(
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    providers = org_list("providers", org_id)
    warn_date = (date.today() + timedelta(days=ALERT_DAYS)).isoformat()

    alerts = []
    for p in providers:
        for field, label in [("license_expiration", "License"), ("dea_expiration", "DEA")]:
            exp = p.get(field)
            if exp and exp <= warn_date:
                days_left = (date.fromisoformat(exp) - date.today()).days
                alerts.append({
                    "provider_id": p["id"],
                    "provider_name": f"{p.get('first_name','')} {p['last_name']}".strip(),
                    "alert_type": label,
                    "expiration_date": exp,
                    "days_remaining": days_left,
                    "urgency": "critical" if days_left < 30 else "warning",
                })
    return {"alerts": alerts, "total": len(alerts)}
