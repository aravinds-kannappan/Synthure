"""Patient portal — notifications + mark read."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db
import time

router = APIRouter()


@router.get("/notifications")
async def get_notifications(
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("sub", "")
    db = get_db()
    if db is None:
        return {"notifications": [], "source": "demo"}
    result = db.table("notifications").select("*").eq("user_id", patient_id).eq("portal", "patient").order("created_at", desc=True).limit(20).execute()
    return {"notifications": result.data or []}


@router.post("/notifications/{notification_id}/read")
async def mark_read(
    notification_id: str,
    user: dict = Depends(require_role("patient")),
):
    db = get_db()
    if db:
        db.table("notifications").update({"read_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}).eq("id", notification_id).execute()
    return {"status": "ok"}
