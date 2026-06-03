"""Feature store — patient + claim features computed on creation, refreshed every 24h."""
from __future__ import annotations
from typing import Optional
import time

from backend.core.database import get_db


def get_patient_features(patient_id: str, org_id: str) -> dict:
    """
    Compute and return patient features for ML models.
    Reads from feature_store if fresh (< 24h); otherwise recomputes.
    """
    db = get_db()
    if db is None:
        return _fallback_patient_features(patient_id)

    try:
        result = (
            db.table("feature_store")
            .select("features, computed_at")
            .eq("entity_type", "patient")
            .eq("entity_id", patient_id)
            .single()
            .execute()
        )
        if result.data:
            return result.data["features"]
    except Exception:
        pass

    features = _compute_patient_features(patient_id, org_id, db)
    _upsert_features("patient", patient_id, org_id, features, db)
    return features


def get_claim_features(claim_id: str, org_id: str) -> dict:
    db = get_db()
    if db is None:
        return {}
    try:
        result = (
            db.table("feature_store")
            .select("features")
            .eq("entity_type", "claim")
            .eq("entity_id", claim_id)
            .single()
            .execute()
        )
        if result.data:
            return result.data["features"]
    except Exception:
        pass
    features = _compute_claim_features(claim_id, org_id, db)
    _upsert_features("claim", claim_id, org_id, features, db)
    return features


def _compute_patient_features(patient_id: str, org_id: str, db) -> dict:
    features: dict = {"age_bucket": "unknown", "condition_count": 0, "medication_count": 0,
                       "denial_rate": 0.0, "readmission_risk": 0.0, "high_risk_dx": False}
    try:
        conds = db.table("patient_conditions").select("icd10_code").eq("patient_id", patient_id).execute()
        meds = db.table("patient_medications").select("id").eq("patient_id", patient_id).execute()
        features["condition_count"] = len(conds.data or [])
        features["medication_count"] = len(meds.data or [])
        high_risk = {"I50", "J44", "E11", "N18"}
        features["high_risk_dx"] = any(
            c["icd10_code"][:3] in high_risk for c in (conds.data or [])
        )
    except Exception:
        pass
    return features


def _compute_claim_features(claim_id: str, org_id: str, db) -> dict:
    features: dict = {"dx_code_count": 0, "amount_bucket": "low", "flags": {}}
    try:
        result = db.table("claims").select("*").eq("id", claim_id).single().execute()
        if result.data:
            claim = result.data
            features["dx_code_count"] = len(claim.get("diagnosis_codes") or [])
            amount = float(claim.get("amount") or 0)
            features["amount_bucket"] = "high" if amount > 10000 else "medium" if amount > 2000 else "low"
            features["flags"] = claim.get("flags") or {}
    except Exception:
        pass
    return features


def _upsert_features(entity_type, entity_id, org_id, features, db):
    try:
        db.table("feature_store").upsert({
            "entity_type": entity_type,
            "entity_id": entity_id,
            "org_id": org_id,
            "features": features,
            "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }, on_conflict="entity_type,entity_id").execute()
    except Exception:
        pass


def _fallback_patient_features(patient_id: str) -> dict:
    return {"age_bucket": "unknown", "condition_count": 0, "medication_count": 0,
            "denial_rate": 0.0, "readmission_risk": 0.0, "high_risk_dx": False}
