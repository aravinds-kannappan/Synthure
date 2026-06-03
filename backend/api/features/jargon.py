"""Jargon decoder endpoint — FastAPI port of the original Flask handler."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import get_current_user
from backend.core.config import settings
from backend.agents import orchestrator

router = APIRouter()


class JargonRequest(BaseModel):
    notes: str


def _client():
    if not settings.anthropic_api_key:
        return None
    import anthropic
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


@router.post("/explain-jargon")
async def explain_jargon(
    body: JargonRequest,
    user: dict = Depends(get_current_user),
):
    notes = body.notes.strip()
    if not notes:
        raise HTTPException(status_code=400, detail="Field 'notes' is required")
    if len(notes) > 5000:
        raise HTTPException(status_code=422, detail="Notes exceed 5000-character limit")
    try:
        return orchestrator.run_jargon_pipeline(notes, _client()).to_dict()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
