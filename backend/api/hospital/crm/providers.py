"""Hospital CRM — provider/credentialing records."""
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_get, org_insert, org_update

router = APIRouter()


class ProviderCreate(BaseModel):
    npi: str
    first_name: Optional[str] = None
    last_name: str
    specialty: Optional[str] = None
    taxonomy_code: Optional[str] = None
    network_status: Optional[str] = "in-network"
    license_expiration: Optional[str] = None
    dea_expiration: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


@router.get("/providers")
async def list_providers(
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    providers = org_list("providers", org_id)
    # Flag providers with expiring credentials (within 90 days)
    from datetime import date, timedelta
    warn_date = (date.today() + timedelta(days=90)).isoformat()
    for p in providers:
        p["credentialing_alert"] = (
            (p.get("license_expiration") or "9999") <= warn_date
            or (p.get("dea_expiration") or "9999") <= warn_date
        )
    return {"providers": providers, "total": len(providers)}


@router.get("/providers/{provider_id}")
async def get_provider(
    provider_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    provider = org_get("providers", org_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@router.post("/providers", status_code=201)
async def create_provider(
    body: ProviderCreate,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    return org_insert("providers", org_id, body.model_dump(exclude_none=True))
