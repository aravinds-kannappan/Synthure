"""ACA compliance — 1095-C data compilation + deadline tracking."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.core.multitenancy import org_list, org_insert
import time

router = APIRouter()


@router.post("/compliance/aca/generate")
async def generate_aca_report(
    employer_id: str,
    report_year: int,
    user: dict = Depends(require_role("employer_admin")),
):
    org_id = user.get("org_id", "")
    enrollments = org_list("enrollments", org_id, {"plan_year": report_year})

    data = {
        "total_full_time": len(enrollments),
        "covered": sum(1 for e in enrollments if e["status"] == "active"),
        "waived": sum(1 for e in enrollments if e["status"] == "waived"),
        "report_year": report_year,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    report = org_insert("aca_reports", org_id, {
        "employer_id": employer_id,
        "report_year": report_year,
        "report_type": "1095-C",
        "data": data,
    })
    return {"report": report, "ai_generated": True}


@router.get("/compliance/deadlines")
async def aca_deadlines(
    user: dict = Depends(require_role("employer_admin")),
):
    return {
        "deadlines": [
            {"name": "1095-C employee distribution", "date": "2027-03-03", "days_remaining": 273},
            {"name": "1094-C IRS filing", "date": "2027-03-31", "days_remaining": 301},
            {"name": "ACA pay-or-play assessment", "date": "2027-04-01", "days_remaining": 302},
        ]
    }
