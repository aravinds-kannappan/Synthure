"""Hospital analytics — aggregate and drill-down views for hospital administrators.

Drill-down hierarchy: Hospital → Physician → Patient → Note → AI Results.
All queries are scoped to the hospital's org_id from the JWT.
"""
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException

from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


@router.get("/overview")
async def hospital_overview(user: dict = Depends(require_role("hospital_admin"))):
    """Aggregate statistics across the entire hospital."""
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="No hospital org_id in token")

    db = _db()

    patients   = db.table("patients").select("id").eq("org_id", org_id).execute().data or []
    notes      = db.table("clinical_notes").select("id").eq("org_id", org_id).execute().data or []
    physicians = db.table("users").select("id").eq("org_id", org_id).eq("role", "physician").execute().data or []

    pipeline_results = (
        db.table("ai_pipeline_results")
        .select("result_json")
        .eq("org_id", org_id)
        .eq("pipeline_type", "jargon")
        .execute()
    ).data or []

    readmission_scores = []
    high_risk = 0
    for r in pipeline_results:
        rr = r.get("result_json", {}).get("data", {}).get("readmission_risk", {})
        if rr:
            s = float(rr.get("score", 0))
            readmission_scores.append(s)
            if rr.get("level") == "high":
                high_risk += 1

    avg_readmission = round(sum(readmission_scores) / len(readmission_scores), 3) if readmission_scores else 0.0

    conditions = (
        db.table("patient_conditions")
        .select("icd10_code, description")
        .eq("org_id", org_id)
        .eq("status", "active")
        .execute()
    ).data or []
    condition_counts = Counter(c["icd10_code"] for c in conditions)
    top_conditions = [
        {"code": code, "count": cnt}
        for code, cnt in condition_counts.most_common(5)
    ]

    return {
        "org_id": org_id,
        "patients": len(patients),
        "clinical_notes": len(notes),
        "physicians": len(physicians),
        "avg_readmission_risk": avg_readmission,
        "high_readmission_count": high_risk,
        "top_conditions": top_conditions,
    }


@router.get("/physicians")
async def list_physicians(user: dict = Depends(require_role("hospital_admin"))):
    """All physicians in this hospital with patient and note counts."""
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="No hospital org_id in token")

    db = _db()
    physicians = (
        db.table("users")
        .select("id, name, email")
        .eq("org_id", org_id)
        .eq("role", "physician")
        .execute()
    ).data or []

    result = []
    for phys in physicians:
        patient_ids = (
            db.table("physician_patients")
            .select("patient_id")
            .eq("physician_id", phys["id"])
            .execute()
        ).data or []
        note_count = (
            db.table("clinical_notes")
            .select("id")
            .eq("physician_id", phys["id"])
            .execute()
        ).data or []
        result.append({
            "physician_id": phys["id"],
            "name": phys["name"],
            "email": phys["email"],
            "patient_count": len(patient_ids),
            "note_count": len(note_count),
        })

    return {"physicians": result, "total": len(result)}


@router.get("/physicians/{physician_id}/patients")
async def physician_patients(
    physician_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    """All patients assigned to a specific physician with latest visit summary."""
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="No hospital org_id in token")

    db = _db()
    phys = (
        db.table("users")
        .select("id, name")
        .eq("id", physician_id)
        .eq("org_id", org_id)
        .maybeSingle()
        .execute()
    ).data
    if not phys:
        raise HTTPException(status_code=404, detail="Physician not found in this hospital")

    assignments = (
        db.table("physician_patients")
        .select("patient_id")
        .eq("physician_id", physician_id)
        .execute()
    ).data or []

    patients = []
    for a in assignments:
        pat = db.table("patients").select("*").eq("id", a["patient_id"]).maybeSingle().execute().data
        if not pat:
            continue

        latest_note = (
            db.table("clinical_notes")
            .select("id, created_at")
            .eq("patient_id", a["patient_id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data

        summary = None
        readmission_risk = None
        if latest_note:
            jargon = (
                db.table("ai_pipeline_results")
                .select("result_json")
                .eq("clinical_note_id", latest_note[0]["id"])
                .eq("pipeline_type", "jargon")
                .limit(1)
                .execute()
            ).data
            if jargon:
                data = jargon[0]["result_json"].get("data", {})
                summary = data.get("summary", "")
                readmission_risk = data.get("readmission_risk")

        all_notes = db.table("clinical_notes").select("id").eq("patient_id", a["patient_id"]).execute().data or []
        patients.append({
            **pat,
            "latest_visit": latest_note[0]["created_at"] if latest_note else None,
            "latest_summary": summary,
            "readmission_risk": readmission_risk,
            "note_count": len(all_notes),
        })

    return {"physician": phys, "patients": patients, "total": len(patients)}


@router.get("/patients/{patient_id}/notes")
async def patient_notes_hospital(
    patient_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    """All notes and AI results for one patient (hospital drill-down endpoint)."""
    org_id = user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=403, detail="No hospital org_id in token")

    db = _db()
    patient = (
        db.table("patients")
        .select("*")
        .eq("id", patient_id)
        .eq("org_id", org_id)
        .maybeSingle()
        .execute()
    ).data
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found in this hospital")

    notes = (
        db.table("clinical_notes")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    enriched = []
    for note in notes:
        results = (
            db.table("ai_pipeline_results")
            .select("pipeline_type, result_json, model_used")
            .eq("clinical_note_id", note["id"])
            .execute()
        ).data or []
        note["pipeline_results"] = {r["pipeline_type"]: r["result_json"] for r in results}
        enriched.append(note)

    conditions = db.table("patient_conditions").select("*").eq("patient_id", patient_id).execute().data or []
    medications = db.table("patient_medications").select("*").eq("patient_id", patient_id).execute().data or []

    return {
        "patient": {**patient, "conditions": conditions, "medications": medications},
        "notes": enriched,
        "total_notes": len(enriched),
    }
