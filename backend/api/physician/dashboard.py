"""Physician dashboard — feed of completed actions + pending one-tap queue."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()


@router.get("/dashboard")
async def physician_dashboard(
    user: dict = Depends(require_role("physician", "provider")),
):
    org_id = user.get("org_id", "")
    db = get_db()

    if db is None:
        return {
            "pending_one_tap": [],
            "completed_today": [
                {"action_type": "send_patient_education", "status": "completed", "tier": "1"},
                {"action_type": "submit_prior_auth", "status": "completed", "tier": "1"},
            ],
            "source": "demo",
        }

    # Pending Tier 2 (one-tap)
    tier2 = db.table("action_queue").select("*").eq("org_id", org_id).eq("tier", "2").eq("status", "pending").order("created_at", desc=True).limit(10).execute()

    # Completed today
    import time
    today = time.strftime("%Y-%m-%dT00:00:00Z", time.gmtime())
    completed = db.table("action_queue").select("action_type,status,tier,executed_at").eq("org_id", org_id).eq("status", "completed").gte("executed_at", today).order("executed_at", desc=True).limit(20).execute()

    return {
        "pending_one_tap": tier2.data or [],
        "completed_today": completed.data or [],
    }


@router.post("/actions/{action_id}/approve")
async def approve_one_tap(
    action_id: str,
    user: dict = Depends(require_role("physician", "provider")),
):
    from backend.agents.action_orchestrator import approve_tier2
    return await approve_tier2(action_id, user.get("org_id", ""), user.get("name", ""))
