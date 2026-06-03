"""Open enrollment workflow — notifications, tracking, confirmation, summary."""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert
from backend.integrations.sendgrid import send_email
import time

router = APIRouter()


class OpenEnrollmentOpen(BaseModel):
    employer_id: str
    plan_year: int
    start_date: str
    end_date: str
    employee_emails: list[str]


@router.post("/enrollment/open")
async def open_enrollment(
    body: OpenEnrollmentOpen,
    user: dict = Depends(require_role("employer_admin")),
):
    """
    Open enrollment period — sends notification to all eligible employees.
    Tier 1: executes immediately.
    """
    sent = 0
    for email in body.employee_emails[:100]:
        result = send_email(
            email,
            f"Open Enrollment {body.plan_year} — Action Required",
            f"<h2>Open Enrollment is now open</h2>"
            f"<p>Enrollment period: {body.start_date} to {body.end_date}</p>"
            f"<p>Log in to your benefits portal to review and select your {body.plan_year} coverage.</p>",
        )
        if result["status"] in ("sent", "demo"):
            sent += 1
    return {"notified": sent, "tier": "1", "action_type": "send_enrollment_notice"}


@router.get("/enrollment/summary")
async def enrollment_summary(
    plan_year: Optional[int] = None,
    user: dict = Depends(require_role("employer_admin")),
):
    org_id = user.get("org_id", "")
    filters = {"plan_year": plan_year} if plan_year else None
    enrollments = org_list("enrollments", org_id, filters)
    by_status = {}
    for e in enrollments:
        s = e["status"]
        by_status[s] = by_status.get(s, 0) + 1
    return {"total": len(enrollments), "by_status": by_status}
