"""COBRA administration — qualifying event detection + auto notice generation."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert
from backend.agents.actions.send_cobra_notice import execute as send_cobra
from datetime import date, timedelta
import asyncio

router = APIRouter()


class CobraEvent(BaseModel):
    employer_id: str
    employee_email: str
    employee_name: str
    qualifying_event: str
    event_date: str


@router.post("/cobra/event", status_code=201)
async def record_cobra_event(
    body: CobraEvent,
    user: dict = Depends(require_role("employer_admin")),
):
    org_id = user.get("org_id", "")
    event_date = date.fromisoformat(body.event_date)
    notice_deadline = (event_date + timedelta(days=44)).isoformat()
    election_deadline = (event_date + timedelta(days=60)).isoformat()

    row = org_insert("cobra_events", org_id, {
        "employer_id": body.employer_id,
        "employee_email": body.employee_email,
        "employee_name": body.employee_name,
        "qualifying_event": body.qualifying_event,
        "event_date": body.event_date,
        "notice_deadline": notice_deadline,
        "election_deadline": election_deadline,
    })

    # Tier 1: send COBRA notice immediately
    sms_result = await send_cobra({
        "email": body.employee_email,
        "employee_name": body.employee_name,
        "qualifying_event": body.qualifying_event,
    })

    return {"cobra_event": row, "notice": sms_result, "tier": "1"}


@router.get("/cobra/events")
async def list_cobra_events(
    user: dict = Depends(require_role("employer_admin")),
):
    org_id = user.get("org_id", "")
    events = org_list("cobra_events", org_id)
    return {"events": events}
