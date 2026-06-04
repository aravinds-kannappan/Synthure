"""Physician-facing patient endpoints.

Physicians query their own assigned patients and that patient's note history.
All queries are scoped to physician_id from the JWT — a physician can never
see patients assigned to a different physician.
"""
from fastapi import APIRouter, Depends, HTTPException

from backend.core.auth import require_role
from backend.core.database import get_db

router = APIRouter()


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


@router.get("/patients")
async def my_patients(user: dict = Depends(require_role("physician"))):
    """Returns all patients assigned to the authenticated physician,
    with their latest visit summary and readmission risk.
    """
    physician_id = user.get("user_id") or user.get("sub", "")
    db = _db()

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
            .eq("physician_id", physician_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data

        summary = None
        urgency = None
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
                summary          = data.get("summary", "")
                urgency          = data.get("urgency", "routine")
                readmission_risk = data.get("readmission_risk")

        all_notes = (
            db.table("clinical_notes")
            .select("id")
            .eq("patient_id", a["patient_id"])
            .eq("physician_id", physician_id)
            .execute()
        ).data or []

        patients.append({
            **pat,
            "latest_visit": latest_note[0]["created_at"] if latest_note else None,
            "latest_summary": summary,
            "urgency": urgency,
            "readmission_risk": readmission_risk,
            "note_count": len(all_notes),
        })

    return {"patients": patients, "total": len(patients)}


@router.get("/patients/{patient_id}/notes")
async def patient_note_history(
    patient_id: str,
    user: dict = Depends(require_role("physician")),
):
    """Full note history for one patient (physician view).
    Only returns notes submitted by this physician.
    """
    physician_id = user.get("user_id") or user.get("sub", "")
    db = _db()

    # Verify assignment exists
    assignment = (
        db.table("physician_patients")
        .select("patient_id")
        .eq("physician_id", physician_id)
        .eq("patient_id", patient_id)
        .maybeSingle()
        .execute()
    ).data
    if not assignment:
        raise HTTPException(status_code=404, detail="Patient not assigned to this physician")

    notes = (
        db.table("clinical_notes")
        .select("*")
        .eq("patient_id", patient_id)
        .eq("physician_id", physician_id)
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

    patient = db.table("patients").select("*").eq("id", patient_id).maybeSingle().execute().data
    return {"patient": patient, "notes": enriched, "total": len(enriched)}
