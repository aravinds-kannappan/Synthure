"""Hospital analytics dashboard — payer scorecard + summary metrics."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.multitenancy import org_list
from backend.core.database import get_db

router = APIRouter()


@router.get("/analytics")
async def analytics(
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    db = get_db()

    if db is None:
        return {
            "claims_this_month": 47,
            "total_billed": 182400,
            "total_paid": 148200,
            "collection_rate": 81.2,
            "denial_rate": 8.2,
            "avg_days_to_pay": 22,
            "source": "demo",
        }

    import time
    month_start = time.strftime("%Y-%m-01T00:00:00Z", time.gmtime())
    claims = db.table("claims").select("amount, status, paid_amount").eq("org_id", org_id).gte("created_at", month_start).execute()
    rows = claims.data or []
    billed = sum(float(r.get("amount") or 0) for r in rows)
    paid = sum(float(r.get("paid_amount") or 0) for r in rows if r.get("paid_amount"))
    denied = sum(1 for r in rows if r["status"] == "denied")
    return {
        "claims_this_month": len(rows),
        "total_billed": round(billed, 2),
        "total_paid": round(paid, 2),
        "collection_rate": round(paid / billed * 100, 1) if billed else 0,
        "denial_rate": round(denied / len(rows) * 100, 1) if rows else 0,
    }
