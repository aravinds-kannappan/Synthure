"""Tier 1 action — submit prior authorization to payer."""
from __future__ import annotations
import time
from backend.core.database import get_db


async def execute(payload: dict) -> dict:
    claim_id = payload.get("claim_id")
    patient_id = payload.get("patient_id")
    procedure_code = payload.get("procedure_code", "")
    payer_id = payload.get("payer_id")
    org_id = payload.get("org_id", "")

    db = get_db()
    auth_ref = f"PA-{int(time.time())}"
    if db and claim_id:
        db.table("prior_auths").insert({
            "claim_id": claim_id,
            "patient_id": patient_id,
            "org_id": org_id,
            "payer_id": payer_id,
            "procedure_code": procedure_code,
            "diagnosis_codes": payload.get("diagnosis_codes", []),
            "status": "pending",
            "submitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).execute()
    return {"status": "submitted", "auth_ref": auth_ref, "procedure_code": procedure_code}
