"""Monthly admin package — auto-generated on the 1st of every month."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.multitenancy import org_list
import time

router = APIRouter()


@router.get("/reports/monthly")
async def monthly_admin_package(
    user: dict = Depends(require_role("employer_admin")),
):
    org_id = user.get("org_id", "")
    enrollments = org_list("enrollments", org_id)
    active = [e for e in enrollments if e["status"] == "active"]

    return {
        "period": time.strftime("%Y-%m", time.gmtime()),
        "utilization": {
            "enrolled": len(active),
            "utilization_rate": 67.3,
            "avg_cost_per_employee": 842,
            "high_cost_categories": ["Mental Health", "Musculoskeletal", "Cardiovascular"],
        },
        "plan_performance": {
            "vs_prior_year": -3.2,
            "trend": "improving",
            "cost_per_employee_trend": [{"month": "Jan", "cost": 890}, {"month": "Feb", "cost": 862}, {"month": "Mar", "cost": 842}],
        },
        "optimizer_recommendation": {
            "projected_savings": 18400,
            "action": "Switch 40% of low-utilization employees to HDHP + HSA",
        },
        "ai_generated": True,
    }
