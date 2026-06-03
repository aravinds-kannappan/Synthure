"""Tier 1 action — generate and file appeal letter for a denial."""
from __future__ import annotations
from backend.core.database import get_db
from backend.api.hospital.rcm.appeals import _generate_letter
import time


async def execute(payload: dict) -> dict:
    denial_id = payload.get("denial_id")
    org_id = payload.get("org_id", "")
    db = get_db()
    if not db or not denial_id:
        return {"status": "demo", "denial_id": denial_id}
    denial = db.table("denial_events").select("*").eq("id", denial_id).single().execute().data
    if not denial:
        return {"status": "not_found"}
    letter = _generate_letter(denial)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    db.table("appeals").insert({
        "denial_id": denial_id,
        "claim_id": denial["claim_id"],
        "org_id": org_id,
        "letter_text": letter,
        "filed_at": now,
        "outcome": "pending",
    }).execute()
    db.table("denial_events").update({"appeal_status": "filed"}).eq("id", denial_id).execute()
    return {"status": "filed", "denial_id": denial_id}
