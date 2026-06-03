"""Prior auth approval predictor — LogisticRegression per payer type."""
from __future__ import annotations
import os
import pickle
from typing import Optional

from sklearn.linear_model import LogisticRegression

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")

_models: dict[str, LogisticRegression] = {}

PAYER_TYPES = ["medicare", "medicaid", "commercial", "unknown"]


def _load_model(payer_type: str) -> Optional[LogisticRegression]:
    if payer_type in _models:
        return _models[payer_type]
    path = os.path.join(MODEL_DIR, f"pa_predictor_{payer_type}.pkl")
    if os.path.exists(path):
        with open(path, "rb") as f:
            _models[payer_type] = pickle.load(f)
        return _models[payer_type]
    return None


def predict_pa_approval(procedure_code: str, diagnosis_codes: list, patient_age: int = 40,
                        payer_type: str = "unknown") -> float:
    """
    Predict prior authorization approval probability (0-100).
    Per-payer LogisticRegression models trained as outcomes accumulate.
    """
    model = _load_model(payer_type)
    if model is not None:
        features = _extract_features(procedure_code, diagnosis_codes, patient_age)
        prob = model.predict_proba([features])[0][1]
        return round(float(prob) * 100, 1)
    return _rule_based_score(procedure_code, diagnosis_codes)


def _extract_features(procedure_code: str, diagnosis_codes: list, patient_age: int) -> list:
    age_bucket = 0 if patient_age < 18 else 1 if patient_age < 40 else 2 if patient_age < 65 else 3
    is_surgical = procedure_code[:2] in {"27", "29", "23", "24", "25", "26"}
    is_imaging = procedure_code[:5] in {"70000", "71000", "72000", "73000", "74000"}
    has_chronic = any(c[:3] in {"E11", "I10", "I50", "J44", "N18", "F32"} for c in diagnosis_codes)
    return [
        int(is_surgical),
        int(is_imaging),
        int(has_chronic),
        age_bucket,
        len(diagnosis_codes),
    ]


def _rule_based_score(procedure_code: str, diagnosis_codes: list) -> float:
    score = 65.0
    is_surgical = procedure_code[:2] in {"27", "29", "23"}
    if is_surgical:
        score -= 15
    if any(c[:3] in {"E11", "I10", "I50"} for c in diagnosis_codes):
        score += 10
    return round(max(10.0, min(score, 95.0)), 1)
