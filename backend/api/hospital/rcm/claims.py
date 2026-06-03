"""Claims submission endpoint — FastAPI port."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.core.config import settings
from backend.agents import orchestrator

router = APIRouter()


class ClaimRequest(BaseModel):
    patient_id: str
    diagnosis_codes: List[str]
    procedure_code: str
    amount: float
    provider_npi: str
    prior_denial: Optional[bool] = False
    out_of_network: Optional[bool] = False
    experimental_treatment: Optional[bool] = False


def _client():
    if not settings.anthropic_api_key:
        return None
    import anthropic
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


@router.post("/claims/submit")
async def submit_claim(
    body: ClaimRequest,
    user: dict = Depends(get_current_user),
):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")
    if not body.diagnosis_codes:
        raise HTTPException(status_code=400, detail="diagnosis_codes must be non-empty")
    try:
        return orchestrator.run_claim_pipeline(body.model_dump(), _client()).to_dict()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
