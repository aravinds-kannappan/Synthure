"""
Clinical decision support — ACC/AHA/ADA guideline gap detection.
Conditions detected → cross-referenced with guidelines → gaps surfaced as non-mandatory suggestions.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.core.config import settings

router = APIRouter()

GUIDELINE_RULES = {
    "I10": [
        {"guideline": "ACC/AHA 2023", "gap": "Consider ACE inhibitor or ARB as first-line therapy", "evidence": "Class I"},
        {"guideline": "ACC/AHA 2023", "gap": "Annual kidney function check if on ACE inhibitor", "evidence": "Class I"},
    ],
    "E11": [
        {"guideline": "ADA Standards 2024", "gap": "Metformin first-line if not contraindicated", "evidence": "Class I"},
        {"guideline": "ADA Standards 2024", "gap": "HbA1c target < 7% for most non-pregnant adults", "evidence": "Class I"},
        {"guideline": "ADA Standards 2024", "gap": "Annual eye exam + foot exam recommended", "evidence": "Class I"},
    ],
    "I50": [
        {"guideline": "ACC/AHA 2022", "gap": "Beta-blocker + ACE inhibitor + aldosterone antagonist for HFrEF", "evidence": "Class I"},
        {"guideline": "ACC/AHA 2022", "gap": "Daily weight monitoring + fluid restriction education", "evidence": "Class IIa"},
    ],
    "N18": [
        {"guideline": "KDIGO 2022", "gap": "Blood pressure target < 120/80 in CKD", "evidence": "Class I"},
        {"guideline": "KDIGO 2022", "gap": "Avoid NSAIDs and nephrotoxic agents", "evidence": "Class I"},
    ],
}


class CDSRequest(BaseModel):
    diagnosis_codes: List[str]
    current_medications: Optional[List[str]] = []
    patient_age: Optional[int] = None


@router.post("/clinical-decision-support")
async def clinical_decision_support(
    body: CDSRequest,
    user: dict = Depends(require_role("physician")),
):
    gaps = []
    for code in body.diagnosis_codes:
        prefix = code[:3]
        for rule in GUIDELINE_RULES.get(prefix, []):
            gaps.append({**rule, "icd10_code": code})

    return {
        "gaps": gaps,
        "total": len(gaps),
        "non_mandatory": True,
        "source": "ACC/AHA/ADA/KDIGO guidelines",
        "note": "Physician can acknowledge or ignore. Not a substitute for clinical judgment.",
    }
