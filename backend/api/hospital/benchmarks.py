"""Benchmark intelligence — practice vs CMS regional and national data."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role

router = APIRouter()


@router.get("/benchmarks")
async def benchmarks(
    user: dict = Depends(require_role("hospital_admin")),
):
    """
    Compare practice performance against CMS Medicare data.
    Real implementation fetches from data.cms.gov API and computes percentile ranks.
    """
    return {
        "findings": [
            {"metric": "Aetna 99215 reimbursement", "your_rate": 285, "cms_rate": 332, "delta_pct": -14.2, "finding": "14% below Medicare rate in your region"},
            {"metric": "Denial rate", "your_rate": 8.2, "cms_rate": 11.4, "delta_pct": 28.0, "finding": "28% better than national average"},
            {"metric": "Days to payment", "your_rate": 22, "cms_rate": 28, "delta_pct": 21.4, "finding": "6 days faster than national average"},
            {"metric": "Clean claim rate", "your_rate": 91.2, "cms_rate": 87.5, "delta_pct": 4.2, "finding": "Above national average"},
        ],
        "ai_generated": True,
        "source": "demo_cms_benchmark",
    }
