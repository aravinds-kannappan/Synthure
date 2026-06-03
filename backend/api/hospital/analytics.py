"""Hospital analytics — all metrics computed from live DB, not hardcoded."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
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
            "error": "Database not connected.",
            "hint": "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
            "source": "no_db",
        }

    import time
    month_start = time.strftime("%Y-%m-01T00:00:00Z", time.gmtime())

    # Claims this month
    claims_result = (
        db.table("claims")
        .select("amount, status, paid_amount, submitted_at")
        .eq("org_id", org_id)
        .gte("created_at", month_start)
        .execute()
    )
    rows = claims_result.data or []

    billed = sum(float(r.get("amount") or 0) for r in rows)
    paid   = sum(float(r.get("paid_amount") or 0) for r in rows if r.get("paid_amount"))
    denied = sum(1 for r in rows if r.get("status") == "denied")
    submitted = sum(1 for r in rows if r.get("submitted_at"))

    # AR aging summary
    ar_result = db.table("ar_aging").select("aging_bucket, amount").eq("org_id", org_id).execute()
    ar_rows = ar_result.data or []
    ar_over_90 = sum(float(r.get("amount") or 0) for r in ar_rows if r.get("aging_bucket") == "90+")

    # Denial events this month
    denials_result = (
        db.table("denial_events")
        .select("id, amount_at_stake")
        .eq("org_id", org_id)
        .gte("created_at", month_start)
        .execute()
    )
    denial_rows = denials_result.data or []

    # Days to payment — average from paid claims
    paid_claims = [
        r for r in rows
        if r.get("status") == "paid"
        and r.get("submitted_at")
        and r.get("paid_amount")
    ]
    if paid_claims:
        from datetime import datetime
        deltas = []
        for r in paid_claims:
            try:
                submitted_dt = datetime.fromisoformat(r["submitted_at"].replace("Z", "+00:00"))
                # paid_at not always present, use now as proxy
                deltas.append((datetime.utcnow() - submitted_dt.replace(tzinfo=None)).days)
            except Exception:
                pass
        avg_days_to_pay = round(sum(deltas) / len(deltas), 1) if deltas else None
    else:
        avg_days_to_pay = None

    return {
        "period": time.strftime("%Y-%m", time.gmtime()),
        "claims_this_month": len(rows),
        "claims_submitted": submitted,
        "total_billed": round(billed, 2),
        "total_paid": round(paid, 2),
        "collection_rate": round(paid / billed * 100, 1) if billed else 0,
        "denial_rate": round(denied / len(rows) * 100, 1) if rows else 0,
        "open_denials": len(denial_rows),
        "denial_amount_at_stake": round(sum(float(r.get("amount_at_stake") or 0) for r in denial_rows), 2),
        "ar_over_90_days": round(ar_over_90, 2),
        "avg_days_to_pay": avg_days_to_pay,
        "source": "live_db",
    }
