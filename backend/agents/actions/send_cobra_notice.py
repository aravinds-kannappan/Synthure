"""Tier 1 action — generate and send COBRA notice."""
from __future__ import annotations
from backend.integrations.sendgrid import send_email


async def execute(payload: dict) -> dict:
    to_email = payload.get("email")
    employee_name = payload.get("employee_name", "Employee")
    qualifying_event = payload.get("qualifying_event", "qualifying event")
    if not to_email:
        return {"status": "skipped", "reason": "no_email"}
    html = (
        f"<h2>COBRA Continuation Coverage Notice</h2>"
        f"<p>Dear {employee_name},</p>"
        f"<p>You or a covered dependent has experienced a qualifying event ({qualifying_event}) "
        f"that may affect your health coverage. You have the right to elect COBRA continuation "
        f"coverage. You must elect within 60 days of this notice.</p>"
        f"<p>Contact HR for details and enrollment forms.</p>"
    )
    result = send_email(to_email, "COBRA Continuation Coverage Notice", html)
    return {"status": result["status"], "to": to_email}
