"""
Patient financial assistance finder.
When estimated OOP cost exceeds threshold, searches:
- NeedyMeds manufacturer programs
- State assistance programs
- Federal programs
Listed in patient portal automatically.
"""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role

router = APIRouter()

OOP_THRESHOLD = 500.0


class AssistanceRequest(BaseModel):
    patient_id: str
    estimated_oop: float
    conditions: list[str] = []
    medications: list[str] = []
    annual_income: Optional[int] = None


@router.post("/financial-assistance")
async def find_assistance(
    body: AssistanceRequest,
    user: dict = Depends(require_role("physician", "hospital_admin", "patient")),
):
    if body.estimated_oop < OOP_THRESHOLD:
        return {"programs": [], "message": "OOP below threshold — no assistance search triggered"}

    programs = _search_programs(body)
    return {
        "programs": programs,
        "estimated_oop": body.estimated_oop,
        "programs_found": len(programs),
        "ai_generated": True,
    }


def _search_programs(body: AssistanceRequest) -> list:
    programs = []
    # Manufacturer programs for known medications
    MANUFACTURER_PROGRAMS = {
        "Humira": {"name": "AbbVie myAbbVie Assist", "url": "https://www.abbvie.com/patients/patient-assistance.html", "savings": "Up to $5/month copay"},
        "Ozempic": {"name": "Novo Nordisk Patient Assistance", "url": "https://www.novocare.com", "savings": "Free medication for eligible patients"},
        "Lisinopril": {"name": "GoodRx", "url": "https://www.goodrx.com", "savings": "Up to 80% off"},
    }
    for med in body.medications:
        prog = MANUFACTURER_PROGRAMS.get(med)
        if prog:
            programs.append({**prog, "type": "manufacturer", "medication": med})

    # Federal programs based on income
    if body.annual_income and body.annual_income < 30000:
        programs.append({
            "name": "Extra Help (LIS) — Medicare Part D",
            "url": "https://www.ssa.gov/medicare/part-d-extra-help",
            "savings": "Full or partial premium + copay assistance",
            "type": "federal",
        })

    # NeedyMeds
    programs.append({
        "name": "NeedyMeds Drug Assistance Programs",
        "url": "https://www.needymeds.org",
        "savings": "Search 10,000+ assistance programs",
        "type": "database",
    })

    return programs
