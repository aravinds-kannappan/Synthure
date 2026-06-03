"""Claims lifecycle — state machine + submission + adjudication."""
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user, require_role
from backend.core.config import settings
from backend.core.multitenancy import org_list, org_get, org_insert, org_update
from backend.core.realtime import emit_event
from backend.agents import orchestrator

router = APIRouter()

VALID_TRANSITIONS = {
    "draft":         {"validated", "voided"},
    "validated":     {"submitted", "voided"},
    "submitted":     {"acknowledged", "denied", "voided"},
    "acknowledged":  {"adjudicated", "denied"},
    "adjudicated":   {"paid", "denied"},
    "denied":        {"appealed", "voided"},
    "appealed":      {"adjudicated", "voided"},
    "paid":          set(),
    "voided":        set(),
}


class ClaimCreate(BaseModel):
    patient_id: str
    payer_id: Optional[str] = None
    provider_npi: str
    procedure_code: str
    diagnosis_codes: List[str]
    amount: float
    prior_denial: Optional[bool] = False
    out_of_network: Optional[bool] = False
    experimental_treatment: Optional[bool] = False


class StatusTransition(BaseModel):
    to_status: str
    note: Optional[str] = None


def _client():
    if not settings.anthropic_api_key:
        return None
    import anthropic
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


@router.get("/claims")
async def list_claims(
    status: Optional[str] = None,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    filters = {"status": status} if status else None
    claims = org_list("claims", org_id, filters)
    return {"claims": claims, "total": len(claims)}


@router.get("/claims/{claim_id}")
async def get_claim(
    claim_id: str,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    claim = org_get("claims", org_id, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    transitions = org_list("claim_transitions", org_id, {"claim_id": claim_id})
    denials = org_list("denial_events", org_id, {"claim_id": claim_id})
    payments = org_list("payments", org_id, {"claim_id": claim_id})
    return {**claim, "transitions": transitions, "denials": denials, "payments": payments}


@router.post("/claims", status_code=201)
async def create_claim(
    body: ClaimCreate,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    if not body.diagnosis_codes:
        raise HTTPException(status_code=400, detail="diagnosis_codes must be non-empty")

    org_id = user.get("org_id", "")

    # Run AI adjudication pipeline to get complexity score + denial risk
    ai_result = orchestrator.run_claim_pipeline(body.model_dump(), _client())
    ai_dict = ai_result.to_dict()

    claim = org_insert("claims", org_id, {
        "patient_id": body.patient_id,
        "payer_id": body.payer_id,
        "provider_npi": body.provider_npi,
        "procedure_code": body.procedure_code,
        "diagnosis_codes": body.diagnosis_codes,
        "amount": body.amount,
        "status": "draft",
        "complexity_score": ai_dict.get("complexity_score", 0),
        "route": ai_dict.get("route", "standard"),
        "ai_decision": ai_dict.get("result"),
        "flags": {
            "prior_denial": body.prior_denial,
            "out_of_network": body.out_of_network,
            "experimental_treatment": body.experimental_treatment,
        },
    })

    _log_transition(org_id, claim["id"], None, "draft", user.get("name"))
    await emit_event("claim_created", {"claim_id": claim["id"]}, org_id=org_id)
    return claim


@router.post("/claims/submit")
async def submit_claim_legacy(
    body: ClaimCreate,
    user: dict = Depends(get_current_user),
):
    """Legacy endpoint kept for backwards compatibility."""
    ai_result = orchestrator.run_claim_pipeline(body.model_dump(), _client())
    return ai_result.to_dict()


@router.post("/claims/{claim_id}/transition")
async def transition_claim(
    claim_id: str,
    body: StatusTransition,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    org_id = user.get("org_id", "")
    claim = org_get("claims", org_id, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    current = claim["status"]
    if body.to_status not in VALID_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid transition: {current} → {body.to_status}",
        )

    updates: dict = {"status": body.to_status}
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if body.to_status == "submitted":
        updates["submitted_at"] = now
    elif body.to_status == "acknowledged":
        updates["acknowledged_at"] = now
    elif body.to_status == "adjudicated":
        updates["adjudicated_at"] = now
    elif body.to_status == "paid":
        updates["paid_at"] = now
    elif body.to_status == "denied":
        _create_denial_event(org_id, claim_id, claim["amount"])

    updated = org_update("claims", org_id, claim_id, updates)
    _log_transition(org_id, claim_id, current, body.to_status, user.get("name"), body.note)

    await emit_event(
        f"claim_{body.to_status}",
        {"claim_id": claim_id, "patient_id": claim.get("patient_id")},
        portals=["physician", "hospital", "patient"],
        org_id=org_id,
    )
    return updated


# ── Helpers

def _log_transition(org_id, claim_id, from_s, to_s, actor=None, note=None):
    try:
        from backend.core.database import get_db
        db = get_db()
        if db:
            db.table("claim_transitions").insert({
                "claim_id": claim_id, "org_id": org_id,
                "from_status": from_s, "to_status": to_s,
                "actor": actor, "note": note,
            }).execute()
    except Exception:
        pass


def _create_denial_event(org_id, claim_id, amount):
    from backend.core.database import get_db
    import datetime
    db = get_db()
    if not db:
        return
    try:
        deadline = (datetime.date.today() + datetime.timedelta(days=180)).isoformat()
        db.table("denial_events").insert({
            "claim_id": claim_id, "org_id": org_id,
            "appeal_deadline": deadline,
            "amount_at_stake": amount,
        }).execute()
    except Exception:
        pass
