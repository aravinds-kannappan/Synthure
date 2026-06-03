"""Denial management — event logging + appeal queueing."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_get, org_update

router = APIRouter()


class DenialUpdate(BaseModel):
    carc_code: Optional[str] = None
    rarc_code: Optional[str] = None
    denial_reason: Optional[str] = None


@router.get("/denials")
async def list_denials(
    appeal_status: Optional[str] = None,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    filters = {"appeal_status": appeal_status} if appeal_status else None
    denials = org_list("denial_events", org_id, filters)
    return {"denials": denials, "total": len(denials)}


@router.get("/denials/{denial_id}")
async def get_denial(
    denial_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    denial = org_get("denial_events", org_id, denial_id)
    if not denial:
        raise HTTPException(status_code=404, detail="Denial not found")
    appeals = org_list("appeals", org_id, {"denial_id": denial_id})
    return {**denial, "appeals": appeals}


@router.patch("/denials/{denial_id}")
async def update_denial(
    denial_id: str,
    body: DenialUpdate,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    return org_update("denial_events", org_id, denial_id, body.model_dump(exclude_none=True))
