"""Tier 1 action — transition a claim from draft/validated to submitted."""
from __future__ import annotations
from backend.core.database import get_db
import time


async def execute(payload: dict) -> dict:
    claim_id = payload.get("claim_id")
    org_id = payload.get("org_id", "")
    db = get_db()
    if db and claim_id:
        db.table("claims").update({
            "status": "submitted",
            "submitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).eq("id", claim_id).eq("org_id", org_id).execute()
    return {"status": "submitted", "claim_id": claim_id}
