"""Twilio SMS integration."""
from __future__ import annotations
from backend.core.config import settings


def send_sms(to: str, body: str) -> dict:
    if not settings.twilio_account_sid:
        return {"status": "demo", "to": to, "body": body[:80]}
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        msg = client.messages.create(body=body[:1600], from_=settings.twilio_from_number, to=to)
        return {"status": "sent", "sid": msg.sid}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
