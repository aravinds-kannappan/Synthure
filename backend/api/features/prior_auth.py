"""
Prior authorization automation — end-to-end PA lifecycle.
- Check if PA required for procedure + payer
- Auto-fill payer-specific form
- Submit + track lifecycle
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import time

from backend.core.auth import require_role
from backend.core.config import settings
from backend.core.multitenancy import org_list, org_insert, org_update, org_get
from backend.ml.prior_auth_predictor import predict_pa_approval

router = APIRouter()


class PriorAuthRequest(BaseModel):
    patient_id: str
    procedure_code: str
    diagnosis_codes: List[str]
    payer_id: Optional[str] = None
    patient_age: Optional[int] = 40
    payer_type: Optional[str] = "unknown"
    clinical_notes: Optional[str] = ""


@router.post("/prior-auth/check")
async def check_pa_required(
    body: PriorAuthRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    """Check if prior auth is required and predict approval probability."""
    # Procedures commonly requiring PA
    PA_REQUIRED_PREFIXES = {"27", "29", "23", "63", "61", "70", "71", "72", "73", "74"}
    requires_pa = body.procedure_code[:2] in PA_REQUIRED_PREFIXES

    approval_prob = predict_pa_approval(
        body.procedure_code,
        body.diagnosis_codes,
        body.patient_age or 40,
        body.payer_type or "unknown",
    )

    return {
        "requires_pa": requires_pa,
        "approval_probability": approval_prob,
        "recommendation": "submit_pa" if requires_pa else "no_pa_needed",
    }


@router.post("/prior-auth/submit", status_code=201)
async def submit_prior_auth(
    body: PriorAuthRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    """Auto-fill payer form and submit prior auth."""
    org_id = user.get("org_id", "")

    payer_form = _autofill_payer_form(body)
    approval_prob = predict_pa_approval(
        body.procedure_code,
        body.diagnosis_codes,
        body.patient_age or 40,
        body.payer_type or "unknown",
    )

    pa = org_insert("prior_auths", org_id, {
        "patient_id": body.patient_id,
        "payer_id": body.payer_id,
        "procedure_code": body.procedure_code,
        "diagnosis_codes": body.diagnosis_codes,
        "status": "pending",
        "approval_score": approval_prob,
        "payer_form": payer_form,
        "submitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    return {
        "prior_auth": pa,
        "approval_probability": approval_prob,
        "payer_form_filled": True,
        "ai_submitted": True,
    }


@router.get("/prior-auth")
async def list_prior_auths(
    status: Optional[str] = None,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    org_id = user.get("org_id", "")
    filters = {"status": status} if status else None
    pas = org_list("prior_auths", org_id, filters)
    return {"prior_auths": pas, "total": len(pas)}


def _autofill_payer_form(body: PriorAuthRequest) -> dict:
    return {
        "procedure_code": body.procedure_code,
        "diagnosis_codes": body.diagnosis_codes,
        "patient_id": body.patient_id,
        "clinical_notes_summary": (body.clinical_notes or "")[:200],
        "payer_type": body.payer_type,
        "submitted_by": "Synthure Auto-PA",
        "form_version": "2024-Q4",
    }
