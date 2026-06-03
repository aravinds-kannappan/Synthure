"""
Action orchestrator — executes Tier 1 actions from the action_queue.
Tier 2 items sit in the queue until physician taps approve.
Tier 3 items are rejected immediately.
"""
from __future__ import annotations
import time
from typing import Any

from backend.core.autonomy import classify, Tier
from backend.core.database import get_db
from backend.core.realtime import emit_event


async def queue_action(
    action_type: str,
    payload: dict,
    org_id: str,
    patient_id: str | None = None,
    encounter_id: str | None = None,
) -> dict | None:
    """
    Add an action to the queue.
    Tier 1: immediately marks as executing and runs.
    Tier 2: leaves as pending (physician one-tap required).
    Tier 3: rejects without queuing.
    """
    tier = classify(action_type)
    if tier == Tier.THREE:
        return None

    db = get_db()
    if db is None:
        return _demo_queue_action(action_type, tier, payload)

    row = db.table("action_queue").insert({
        "org_id": org_id,
        "patient_id": patient_id,
        "encounter_id": encounter_id,
        "action_type": action_type,
        "tier": tier.value,
        "status": "pending",
        "payload": payload,
    }).execute().data[0]

    if tier == Tier.ONE:
        await _execute_tier1(row["id"], action_type, payload, org_id, patient_id)

    return row


async def approve_tier2(
    action_id: str,
    org_id: str,
    physician_name: str,
) -> dict:
    """Physician approves a Tier 2 one-tap action."""
    db = get_db()
    if db is None:
        return {"status": "approved", "demo": True}
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    db.table("action_queue").update({
        "status": "executing",
        "approved_by": physician_name,
        "approved_at": now,
    }).eq("id", action_id).execute()
    return {"action_id": action_id, "status": "approved", "approved_by": physician_name}


async def _execute_tier1(
    action_id: str,
    action_type: str,
    payload: dict,
    org_id: str,
    patient_id: str | None,
) -> None:
    """Run a Tier 1 autonomous action and record the result."""
    db = get_db()
    try:
        result = await _dispatch(action_type, payload)
        status = "completed"
        error = None
    except Exception as exc:
        result = None
        status = "failed"
        error = str(exc)

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if db:
        db.table("action_queue").update({
            "status": status,
            "result": result,
            "error": error,
            "executed_at": now,
        }).eq("id", action_id).execute()

    await emit_event(
        f"action_{status}",
        {"action_type": action_type, "action_id": action_id, "patient_id": patient_id},
        portals=["physician", "hospital", "patient"],
        org_id=org_id,
        patient_id=patient_id,
    )


async def _dispatch(action_type: str, payload: dict) -> Any:
    """Route to the appropriate action handler."""
    if action_type == "send_patient_education":
        from backend.agents.actions.send_patient_education import execute
        return await execute(payload)
    if action_type == "send_followup_reminder":
        from backend.agents.actions.send_followup_reminder import execute
        return await execute(payload)
    if action_type == "stage_claim":
        return {"status": "staged", "claim_id": payload.get("claim_id")}
    if action_type == "submit_prior_auth":
        return {"status": "submitted", "auth_ref": f"AUTH-{int(time.time())}"}
    if action_type == "verify_eligibility":
        return {"status": "active", "source": "demo"}
    return {"status": "executed", "action_type": action_type}


def _demo_queue_action(action_type: str, tier: Tier, payload: dict) -> dict:
    return {
        "id": f"demo-{action_type}-{int(time.time())}",
        "action_type": action_type,
        "tier": tier.value,
        "status": "completed" if tier == Tier.ONE else "pending",
        "payload": payload,
    }
