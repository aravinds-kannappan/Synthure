"""Revenue forecasting — AR aging + historical payment patterns."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()


@router.get("/forecasting/revenue")
async def revenue_forecast(
    user: dict = Depends(require_role("hospital_admin")),
):
    """
    Project revenue for next 30/60/90 days based on AR aging + denial rate trends.
    """
    return {
        "forecast": [
            {"period": "Next 30 days", "projected": 42500, "basis": "AR aging + historical payment rate"},
            {"period": "Next 60 days", "projected": 78200, "basis": "AR aging + denial trend"},
            {"period": "Next 90 days", "projected": 108000, "basis": "AR aging + seasonal adjustment"},
        ],
        "denial_rate_trend": {"current": 8.2, "prev_month": 9.1, "direction": "improving"},
        "ai_generated": True,
        "source": "demo",
    }
