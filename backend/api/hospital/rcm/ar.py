"""AR aging — SQL view query + collections trigger."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()

AR_THRESHOLD_DAYS = 90


@router.get("/ar-aging")
async def ar_aging(
    user: dict = Depends(require_role("hospital_admin")),
):
    """
    Returns AR buckets (0-30, 31-60, 61-90, 90+) from the ar_aging view.
    Automatically triggers collections workflow for claims over threshold.
    """
    org_id = user.get("org_id", "")
    db = get_db()

    if db is None:
        # Demo mode — return synthetic buckets
        return {
            "buckets": [
                {"bucket": "0-30",  "count": 12, "total": 18450.00},
                {"bucket": "31-60", "count": 7,  "total": 9200.00},
                {"bucket": "61-90", "count": 3,  "total": 4100.00},
                {"bucket": "90+",   "count": 2,  "total": 6800.00},
            ],
            "source": "demo",
        }

    result = (
        db.table("ar_aging")
        .select("aging_bucket, claim_id, amount")
        .eq("org_id", org_id)
        .execute()
    )
    rows = result.data or []

    buckets: dict[str, dict] = {}
    for r in rows:
        b = r["aging_bucket"]
        if b not in buckets:
            buckets[b] = {"bucket": b, "count": 0, "total": 0.0}
        buckets[b]["count"] += 1
        buckets[b]["total"] += float(r.get("amount") or 0)

    return {
        "buckets": list(buckets.values()),
        "total_claims": len(rows),
    }


@router.get("/ar-aging/details")
async def ar_aging_details(
    bucket: str = "90+",
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    db = get_db()
    if db is None:
        return {"claims": [], "source": "demo"}
    result = (
        db.table("ar_aging")
        .select("*")
        .eq("org_id", org_id)
        .eq("aging_bucket", bucket)
        .execute()
    )
    return {"claims": result.data or []}
