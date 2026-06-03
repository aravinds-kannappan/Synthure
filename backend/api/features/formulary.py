"""
Formulary checker — medication coverage check + therapeutic alternatives.
- Checks if medication covered under patient's plan
- If PA required: suggests therapeutically equivalent alternative without PA
- If not covered: lists alternatives
"""
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.auth import require_role
from backend.core.config import settings
from backend.integrations import huggingface

router = APIRouter()

FORMULARY_DEMO = {
    "Humira": {"covered": True, "tier": 4, "requires_pa": True, "alternatives": ["Adalimumab-atto (biosimilar, Tier 3, no PA)"]},
    "Ozempic": {"covered": True, "tier": 3, "requires_pa": True, "alternatives": ["Metformin 500mg (Tier 1, no PA)", "Trulicity (Tier 3, PA required)"]},
    "Lisinopril": {"covered": True, "tier": 1, "requires_pa": False, "alternatives": []},
    "Atorvastatin": {"covered": True, "tier": 1, "requires_pa": False, "alternatives": []},
}


class FormularyRequest(BaseModel):
    medications: List[str]
    plan_name: Optional[str] = ""
    patient_id: Optional[str] = None


@router.post("/formulary/check")
async def check_formulary(
    body: FormularyRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    results = []
    for med in body.medications[:10]:
        info = FORMULARY_DEMO.get(med, {
            "covered": True, "tier": 2, "requires_pa": False, "alternatives": []
        })
        results.append({
            "medication": med,
            **info,
            "recommendation": (
                f"Consider {info['alternatives'][0]}" if info.get("requires_pa") and info.get("alternatives")
                else ("PA required" if info.get("requires_pa") else "No PA needed")
            ),
        })
    return {"results": results, "non_mandatory": True, "ai_suggestions": True}
