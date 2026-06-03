"""Cross-portal event emitter — writes to realtime_events; Supabase broadcasts to clients."""
from __future__ import annotations
import json
import time
from typing import Any

from backend.core.database import get_db

PORTALS = ("patient", "physician", "hospital", "employer")


async def emit_event(
    event_type: str,
    payload: dict[str, Any],
    portals: list[str] | None = None,
    org_id: str | None = None,
    patient_id: str | None = None,
) -> None:
    """Broadcast an event to one or more portals via the realtime_events table."""
    db = get_db()
    if db is None:
        return
    targets = portals or list(PORTALS)
    base = {
        "event_type": event_type,
        "payload": payload,
        "org_id": org_id,
        "patient_id": patient_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        rows = [{**base, "portal": p} for p in targets]
        db.table("realtime_events").insert(rows).execute()
    except Exception:
        pass
