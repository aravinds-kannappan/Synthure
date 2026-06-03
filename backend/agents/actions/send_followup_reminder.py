"""Tier 1 action — send follow-up reminder to patient."""
from __future__ import annotations
from backend.core.config import settings


async def execute(payload: dict) -> dict:
    phone = payload.get("phone")
    patient_name = payload.get("patient_name", "Patient")
    follow_up_date = payload.get("follow_up_date", "soon")

    if not phone:
        return {"status": "skipped", "reason": "no_phone"}

    body = (
        f"Hi {patient_name}, this is a reminder to schedule your follow-up appointment "
        f"(recommended: {follow_up_date}). "
        f"Please call your care team or book online."
    )

    if settings.twilio_account_sid:
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            msg = client.messages.create(body=body[:1600], from_=settings.twilio_from_number, to=phone)
            return {"status": "sent", "sid": msg.sid}
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}

    return {"status": "demo_sent", "phone": phone, "follow_up_date": follow_up_date}
