"""Tier 1 action — send patient education materials via SMS."""
from __future__ import annotations
from backend.core.config import settings


async def execute(payload: dict) -> dict:
    phone = payload.get("phone")
    materials = payload.get("materials", [])
    patient_name = payload.get("patient_name", "Patient")

    if not phone:
        return {"status": "skipped", "reason": "no_phone"}

    if settings.twilio_account_sid and settings.twilio_auth_token:
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            body = (
                f"Hello {patient_name}, your care team has shared health education materials with you. "
                + " ".join(m.get("url", "") for m in materials[:2] if m.get("url"))
            )
            msg = client.messages.create(
                body=body[:1600],
                from_=settings.twilio_from_number,
                to=phone,
            )
            return {"status": "sent", "sid": msg.sid, "materials_count": len(materials)}
        except Exception as exc:
            return {"status": "failed", "error": str(exc)}

    return {"status": "demo_sent", "phone": phone, "materials_count": len(materials)}
