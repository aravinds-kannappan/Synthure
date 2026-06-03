"""30-day readmission risk scorer — LogisticRegression with L2 regularization."""
from __future__ import annotations
import os
import pickle
from typing import Optional

from sklearn.linear_model import LogisticRegression

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "readmission_scorer.pkl")

_model: Optional[LogisticRegression] = None

HIGH_RISK_ICD10 = frozenset({"I50", "J44", "E11", "N18", "J18", "I21", "G20", "F32"})


def _load_model() -> Optional[LogisticRegression]:
    global _model
    if _model is not None:
        return _model
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
    return _model


def score_readmission_risk(
    age: int,
    condition_count: int,
    medication_count: int,
    diagnosis_codes: list[str],
) -> float:
    """
    Returns 30-day readmission risk score (0-100).
    Trained model used when available; otherwise rule-based.
    """
    model = _load_model()
    features = _extract_features(age, condition_count, medication_count, diagnosis_codes)
    if model is not None:
        prob = model.predict_proba([features])[0][1]
        return round(float(prob) * 100, 1)
    return _rule_based_score(features, diagnosis_codes)


def _extract_features(age, condition_count, medication_count, dx_codes) -> list:
    high_risk = int(any(c[:3] in HIGH_RISK_ICD10 for c in dx_codes))
    return [
        min(age, 100) / 100,
        min(condition_count, 20) / 20,
        min(medication_count, 20) / 20,
        high_risk,
    ]


def _rule_based_score(features: list, dx_codes: list) -> float:
    age_norm, cond_norm, med_norm, high_risk = features
    score = 10.0
    score += age_norm * 25
    score += cond_norm * 20
    score += med_norm * 15
    if high_risk:
        score += 20
    return round(min(score, 100.0), 1)
