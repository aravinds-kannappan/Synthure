"""Employer analytics — population-level aggregate views.

Employers see aggregated, de-identified population health data across all
hospitals linked via employer_hospitals. Individual patient records are
never exposed directly to employer views.

Drill-down: Employer → Hospital → Population Metrics.
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


def _hospital_ids(db, employer_id: str) -> list[str]:
    rows = (
        db.table("employer_hospitals")
        .select("hospital_id")
        .eq("employer_id", employer_id)
        .execute()
    ).data or []
    return [r["hospital_id"] for r in rows]


@router.get("/overview")
async def employer_overview(user: dict = Depends(require_role("employer_admin"))):
    """Aggregate stats across all hospitals this employer covers."""
    employer_id = user.get("org_id")
    if not employer_id:
        raise HTTPException(status_code=403, detail="No employer org_id in token")

    db = _db()
    hospital_ids = _hospital_ids(db, employer_id)

    if not hospital_ids:
        return {
            "hospitals": 0, "patients": 0, "clinical_notes": 0,
            "top_conditions": [], "avg_readmission_risk": 0.0, "high_readmission_count": 0,
        }

    total_patients = 0
    total_notes = 0
    all_conditions: list[str] = []
    readmission_scores: list[float] = []
    high_risk = 0

    for hid in hospital_ids:
        patients = db.table("patients").select("id").eq("org_id", hid).execute().data or []
        total_patients += len(patients)

        notes = db.table("clinical_notes").select("id").eq("org_id", hid).execute().data or []
        total_notes += len(notes)

        conditions = (
            db.table("patient_conditions")
            .select("icd10_code")
            .eq("org_id", hid)
            .eq("status", "active")
            .execute()
        ).data or []
        all_conditions.extend(c["icd10_code"] for c in conditions)

        pipeline_results = (
            db.table("ai_pipeline_results")
            .select("result_json")
            .eq("org_id", hid)
            .eq("pipeline_type", "jargon")
            .execute()
        ).data or []
        for r in pipeline_results:
            rr = r.get("result_json", {}).get("data", {}).get("readmission_risk", {})
            if rr:
                s = float(rr.get("score", 0))
                readmission_scores.append(s)
                if rr.get("level") == "high":
                    high_risk += 1

    condition_counts = Counter(all_conditions)
    top_conditions = [
        {"code": code, "count": cnt}
        for code, cnt in condition_counts.most_common(5)
    ]
    avg_readmission = round(sum(readmission_scores) / len(readmission_scores), 3) if readmission_scores else 0.0

    return {
        "hospitals": len(hospital_ids),
        "patients": total_patients,
        "clinical_notes": total_notes,
        "top_conditions": top_conditions,
        "avg_readmission_risk": avg_readmission,
        "high_readmission_count": high_risk,
    }


@router.get("/hospitals")
async def employer_hospitals_breakdown(user: dict = Depends(require_role("employer_admin"))):
    """Per-hospital breakdown for this employer."""
    employer_id = user.get("org_id")
    if not employer_id:
        raise HTTPException(status_code=403, detail="No employer org_id in token")

    db = _db()
    hospital_ids = _hospital_ids(db, employer_id)

    result = []
    for hid in hospital_ids:
        org = db.table("orgs").select("id, name, type").eq("id", hid).maybeSingle().execute().data
        if not org:
            continue
        patients   = db.table("patients").select("id").eq("org_id", hid).execute().data or []
        notes      = db.table("clinical_notes").select("id").eq("org_id", hid).execute().data or []
        physicians = db.table("users").select("id").eq("org_id", hid).eq("role", "physician").execute().data or []
        result.append({
            "hospital_id": hid,
            "name": org["name"],
            "patient_count": len(patients),
            "note_count": len(notes),
            "physician_count": len(physicians),
        })

    return {"hospitals": result, "total": len(result)}


@router.get("/population/conditions")
async def population_conditions(user: dict = Depends(require_role("employer_admin"))):
    """Population-level condition frequency across all covered hospitals.
    Aggregated counts only — no individual patient data is exposed.
    """
    employer_id = user.get("org_id")
    if not employer_id:
        raise HTTPException(status_code=403, detail="No employer org_id in token")

    db = _db()
    hospital_ids = _hospital_ids(db, employer_id)

    condition_counter: Counter = Counter()
    total_patients = 0

    for hid in hospital_ids:
        patients = db.table("patients").select("id").eq("org_id", hid).execute().data or []
        total_patients += len(patients)
        conditions = (
            db.table("patient_conditions")
            .select("icd10_code")
            .eq("org_id", hid)
            .eq("status", "active")
            .execute()
        ).data or []
        for c in conditions:
            condition_counter[c["icd10_code"]] += 1

    breakdown = [
        {
            "code": code,
            "count": cnt,
            "prevalence_pct": round(cnt / max(total_patients, 1) * 100, 1),
        }
        for code, cnt in condition_counter.most_common(10)
    ]

    return {"total_covered_patients": total_patients, "conditions": breakdown}


@router.get("/population/risk")
async def population_risk(user: dict = Depends(require_role("employer_admin"))):
    """Population readmission risk distribution across all covered hospitals."""
    employer_id = user.get("org_id")
    if not employer_id:
        raise HTTPException(status_code=403, detail="No employer org_id in token")

    db = _db()
    hospital_ids = _hospital_ids(db, employer_id)

    risk_dist: Counter = Counter({"low": 0, "moderate": 0, "high": 0})

    for hid in hospital_ids:
        pipeline_results = (
            db.table("ai_pipeline_results")
            .select("result_json")
            .eq("org_id", hid)
            .eq("pipeline_type", "jargon")
            .execute()
        ).data or []
        for r in pipeline_results:
            rr = r.get("result_json", {}).get("data", {}).get("readmission_risk", {})
            level = rr.get("level", "low") if rr else "low"
            risk_dist[level] += 1

    total = sum(risk_dist.values())
    return {
        "distribution": dict(risk_dist),
        "total_assessed": total,
    }
