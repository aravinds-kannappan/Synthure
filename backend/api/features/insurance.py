"""Insurance matcher endpoint — FastAPI port."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.core.config import settings
from backend.agents import orchestrator

router = APIRouter()


class InsuranceRequest(BaseModel):
    age: int
    annual_income: int
    employed: bool
    state: Optional[str] = ""
    has_dependents: Optional[bool] = False
    chronic_condition: Optional[bool] = False


def _client():
    if not settings.anthropic_api_key:
        return None
    import anthropic
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


@router.post("/match-insurance")
async def match_insurance(
    body: InsuranceRequest,
    user: dict = Depends(get_current_user),
):
    try:
        return orchestrator.run_insurance_pipeline(body.model_dump(), _client()).to_dict()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
