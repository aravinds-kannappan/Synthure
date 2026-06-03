"""SendGrid email integration."""
from __future__ import annotations
from backend.core.config import settings


def send_email(to: str, subject: str, html_body: str, from_email: str = "noreply@synthure.ai") -> dict:
    if not settings.sendgrid_api_key:
        return {"status": "demo", "to": to, "subject": subject}
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail
        sg = sendgrid.SendGridAPIClient(api_key=settings.sendgrid_api_key)
        message = Mail(from_email=from_email, to_emails=to, subject=subject, html_content=html_body)
        response = sg.send(message)
        return {"status": "sent", "status_code": response.status_code}
    except Exception as e:
        return {"status": "failed", "error": str(e)}
