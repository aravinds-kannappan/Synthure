"""ML prediction endpoints — denial risk, PA approval, readmission score."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.ml.denial_predictor import predict_denial_risk
from backend.ml.prior_auth_predictor import predict_pa_approval
from backend.ml.readmission_scorer import score_readmission_risk

router = APIRouter()


class DenialRiskRequest(BaseModel):
    diagnosis_codes: List[str]
    procedure_code: str
    amount: float
    prior_denial: Optional[bool] = False
    out_of_network: Optional[bool] = False
    experimental_treatment: Optional[bool] = False
    complexity_score: Optional[int] = 0


class PAApprovalRequest(BaseModel):
    procedure_code: str
    diagnosis_codes: List[str]
    patient_age: Optional[int] = 40
    payer_type: Optional[str] = "unknown"


class ReadmissionRequest(BaseModel):
    age: int
    condition_count: int
    medication_count: int
    diagnosis_codes: List[str]


@router.post("/predictions/denial-risk")
async def denial_risk(
    body: DenialRiskRequest,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    score = predict_denial_risk(body.model_dump())
    return {
        "denial_risk": score,
        "risk_level": "high" if score > 60 else "medium" if score > 30 else "low",
        "source": "ml_model",
    }


@router.post("/predictions/pa-approval")
async def pa_approval(
    body: PAApprovalRequest,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    score = predict_pa_approval(
        body.procedure_code,
        body.diagnosis_codes,
        body.patient_age or 40,
        body.payer_type or "unknown",
    )
    return {"approval_probability": score, "source": "ml_model"}


@router.post("/predictions/readmission")
async def readmission(
    body: ReadmissionRequest,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    score = score_readmission_risk(
        body.age, body.condition_count, body.medication_count, body.diagnosis_codes
    )
    risk_level = "high" if score > 60 else "medium" if score > 30 else "low"
    return {"readmission_risk": score, "risk_level": risk_level, "source": "ml_model"}
