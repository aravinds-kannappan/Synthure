"""Patient portal — education materials (from discharge_records, visible_to_patient docs)."""
from fastapi import APIRouter, Depends
from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()


@router.get("/education")
async def get_education(
    user: dict = Depends(require_role("patient")),
):
    patient_id = user.get("patient_id") or user.get("sub", "")
    db = get_db()

    if db is None:
        return {
            "materials": [
                {"title": "Living with Heart Failure", "source": "MedlinePlus", "url": "https://medlineplus.gov/heartfailure.html", "type": "condition"},
                {"title": "Lisinopril — What you need to know", "source": "DailyMed", "url": "https://dailymed.nlm.nih.gov", "type": "medication"},
                {"title": "Managing High Blood Pressure", "source": "MedlinePlus", "url": "https://medlineplus.gov/highbloodpressure.html", "type": "condition"},
            ],
            "source": "demo",
        }

    result = db.table("discharge_records").select("condition_materials, medication_guides, created_at").eq("patient_id", patient_id).order("created_at", desc=True).limit(5).execute()
    materials = []
    for r in (result.data or []):
        materials.extend(r.get("condition_materials") or [])
        materials.extend(r.get("medication_guides") or [])
    return {"materials": materials}
