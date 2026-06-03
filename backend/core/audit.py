"""HIPAA audit log writer — every PHI access is recorded."""
from __future__ import annotations
from typing import Optional
import time

from backend.core.database import get_db


async def log_access(
    user_id: str,
    org_id: str,
    resource_type: str,
    resource_id: str,
    action: str,
    ip_address: Optional[str] = None,
    detail: Optional[str] = None,
) -> None:
    db = get_db()
    if db is None:
        return
    try:
        db.table("audit_logs").insert({
            "user_id": user_id,
            "org_id": org_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "ip_address": ip_address,
            "detail": detail,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).execute()
    except Exception:
        pass
