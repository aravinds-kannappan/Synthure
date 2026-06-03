"""Webhook management + delivery."""
import hashlib
import hmac
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert, org_update

router = APIRouter()


class WebhookCreate(BaseModel):
    url: str
    events: List[str]
    secret: str


@router.get("/webhooks")
async def list_webhooks(user: dict = Depends(require_role("hospital_admin", "employer_admin"))):
    org_id = user.get("org_id", "")
    return {"webhooks": org_list("webhooks", org_id)}


@router.post("/webhooks", status_code=201)
async def create_webhook(
    body: WebhookCreate,
    user: dict = Depends(require_role("hospital_admin", "employer_admin")),
):
    org_id = user.get("org_id", "")
    return org_insert("webhooks", org_id, body.model_dump())


async def deliver_webhook(org_id: str, event_type: str, payload: dict) -> None:
    """Deliver event to all active webhooks for the org."""
    from backend.core.database import get_db
    import httpx
    db = get_db()
    if not db:
        return
    webhooks = db.table("webhooks").select("*").eq("org_id", org_id).eq("is_active", True).execute().data or []
    for wh in webhooks:
        if event_type not in wh.get("events", []):
            continue
        try:
            body_bytes = json.dumps({"event": event_type, "data": payload}).encode()
            sig = hmac.new(wh["secret"].encode(), body_bytes, hashlib.sha256).hexdigest()
            async with httpx.AsyncClient() as client:
                await client.post(wh["url"], content=body_bytes, headers={"X-Synthure-Signature": sig}, timeout=10)
        except Exception:
            pass
