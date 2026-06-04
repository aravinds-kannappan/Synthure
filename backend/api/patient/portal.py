"""Patient portal — authenticated patient views their own records only.

All endpoints enforce that the requesting user's patient_id (from JWT)
matches the records being fetched. Patients cannot see other patients' data.
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


@router.get("/me")
async def get_my_profile(user: dict = Depends(require_role("patient"))):
    """Returns the authenticated patient's full profile with conditions, medications, and insurance."""
    patient_id = user.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=404, detail="No patient record linked to this account")

    db = _db()
    patient = db.table("patients").select("*").eq("id", patient_id).maybeSingle().execute().data
    if not patient:
        raise HTTPException(status_code=404, detail="Patient record not found")

    conditions = db.table("patient_conditions").select("*").eq("patient_id", patient_id).eq("status", "active").execute().data or []
    medications = db.table("patient_medications").select("*").eq("patient_id", patient_id).eq("status", "active").execute().data or []
    insurance   = db.table("patient_insurance").select("*").eq("patient_id", patient_id).execute().data or []

    return {**patient, "conditions": conditions, "medications": medications, "insurance": insurance}


@router.get("/notes")
async def get_my_notes(user: dict = Depends(require_role("patient"))):
    """Returns all clinical notes for this patient, newest first.
    Each note includes the AI-generated summary and urgency from the jargon pipeline.
    """
    patient_id = user.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=404, detail="No patient record linked to this account")

    db = _db()
    notes = (
        db.table("clinical_notes")
        .select("id, physician_id, note_text, created_at")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    enriched = []
    for note in notes:
        # Attach physician name
        if note.get("physician_id"):
            phys = db.table("users").select("name").eq("id", note["physician_id"]).maybeSingle().execute().data
            note["physician_name"] = phys["name"] if phys else "Unknown"
        else:
            note["physician_name"] = "Unknown"

        # Attach jargon pipeline summary
        jargon_rows = (
            db.table("ai_pipeline_results")
            .select("result_json")
            .eq("clinical_note_id", note["id"])
            .eq("pipeline_type", "jargon")
            .limit(1)
            .execute()
        ).data
        if jargon_rows:
            data = jargon_rows[0]["result_json"].get("data", {})
            note["ai_summary"] = data.get("summary", "")
            note["urgency"]    = data.get("urgency", "routine")
        else:
            note["ai_summary"] = None
            note["urgency"]    = None

        # Don't expose raw note text to patient view (physician narrative)
        note.pop("note_text", None)
        enriched.append(note)

    return {"notes": enriched, "total": len(enriched)}


@router.get("/notes/{note_id}/results")
async def get_note_results(note_id: str, user: dict = Depends(require_role("patient"))):
    """Returns the full AI pipeline outputs (conditions explained, medications, insurance, follow-up)
    for one specific visit. Enforces patient owns this note.
    """
    patient_id = user.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=404, detail="No patient record linked to this account")

    db = _db()
    note = (
        db.table("clinical_notes")
        .select("id, physician_id, created_at")
        .eq("id", note_id)
        .eq("patient_id", patient_id)
        .maybeSingle()
        .execute()
    ).data
    if not note:
        raise HTTPException(status_code=404, detail="Note not found or access denied")

    results = (
        db.table("ai_pipeline_results")
        .select("pipeline_type, result_json, model_used, created_at")
        .eq("clinical_note_id", note_id)
        .execute()
    ).data or []

    by_type = {r["pipeline_type"]: r["result_json"] for r in results}

    return {
        "note_id": note_id,
        "created_at": note["created_at"],
        "jargon": by_type.get("jargon"),
        "insurance": by_type.get("insurance"),
        "claims": by_type.get("claims"),
    }


@router.get("/timeline")
async def get_my_timeline(user: dict = Depends(require_role("patient"))):
    """Returns the care event timeline visible to the patient."""
    patient_id = user.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=404, detail="No patient record linked to this account")

    db = _db()
    events = (
        db.table("care_events")
        .select("*")
        .eq("patient_id", patient_id)
        .contains("portal_visibility", ["patient"])
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    ).data or []

    return {"events": events, "total": len(events)}
