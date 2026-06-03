"""Collections workflow — statement → statement 2 → agency → write-off."""
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert, org_update, org_get

router = APIRouter()

STAGE_ORDER = ["statement_1", "statement_2", "agency_referral", "write_off"]
STAGE_DAYS = {"statement_1": 30, "statement_2": 30, "agency_referral": 60}


@router.post("/collections", status_code=201)
async def start_collections(
    claim_id: str,
    balance_due: float,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    claim = org_get("claims", org_id, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    now = datetime.utcnow()
    row = org_insert("collections", org_id, {
        "claim_id": claim_id,
        "patient_id": claim.get("patient_id"),
        "stage": "statement_1",
        "balance_due": balance_due,
        "last_action_at": now.isoformat() + "Z",
        "next_action_at": (now + timedelta(days=30)).isoformat() + "Z",
    })
    return row


@router.post("/collections/{collection_id}/advance")
async def advance_stage(
    collection_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    col = org_get("collections", org_id, collection_id)
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")

    current_idx = STAGE_ORDER.index(col["stage"])
    if current_idx >= len(STAGE_ORDER) - 1:
        raise HTTPException(status_code=422, detail="Already at final stage")

    next_stage = STAGE_ORDER[current_idx + 1]
    now = datetime.utcnow()
    next_days = STAGE_DAYS.get(next_stage, 0)

    return org_update("collections", org_id, collection_id, {
        "stage": next_stage,
        "last_action_at": now.isoformat() + "Z",
        "next_action_at": (now + timedelta(days=next_days)).isoformat() + "Z" if next_days else None,
    })


@router.get("/collections")
async def list_collections(
    stage: Optional[str] = None,
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    filters = {"stage": stage} if stage else None
    cols = org_list("collections", org_id, filters)
    return {"collections": cols, "total": len(cols)}
