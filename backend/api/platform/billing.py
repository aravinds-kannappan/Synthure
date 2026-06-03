"""Stripe billing — usage-based per portal role."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.config import settings

router = APIRouter()


@router.get("/billing/usage")
async def get_usage(user: dict = Depends(require_role("hospital_admin", "employer_admin"))):
    return {
        "current_period": {"api_calls": 1842, "ai_tokens": 284000, "estimated_cost": 4.80},
        "plan": "pay-per-use",
        "stripe_configured": bool(settings.stripe_secret_key),
    }
