"""Compliance automation — HIPAA audit, CMS quality, state licensing."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db
from backend.core.config import settings
import time

router = APIRouter()


@router.get("/compliance/hipaa-audit")
async def generate_hipaa_audit(
    user: dict = Depends(require_role("hospital_admin")),
):
    org_id = user.get("org_id", "")
    db = get_db()
    audit_period = time.strftime("%Y-%m", time.gmtime())

    if db is None:
        return {"period": audit_period, "total_accesses": 142, "by_resource": [], "source": "demo"}

    result = db.table("audit_logs").select("resource_type, action").eq("org_id", org_id).gte("created_at", f"{audit_period}-01T00:00:00Z").execute()
    rows = result.data or []
    by_type: dict = {}
    for r in rows:
        rt = r["resource_type"]
        by_type[rt] = by_type.get(rt, 0) + 1
    return {"period": audit_period, "total_accesses": len(rows), "by_resource": [{"resource": k, "count": v} for k, v in by_type.items()]}


@router.get("/compliance/cms-quality")
async def cms_quality_report(
    user: dict = Depends(require_role("hospital_admin")),
):
    return {
        "measures": [
            {"measure": "Readmission Rate", "value": "12.4%", "benchmark": "15.2%", "status": "above_benchmark"},
            {"measure": "Patient Satisfaction", "value": "87", "benchmark": "82", "status": "above_benchmark"},
            {"measure": "Medication Reconciliation", "value": "94%", "benchmark": "90%", "status": "above_benchmark"},
        ],
        "ai_generated": True,
        "source": "demo",
    }
