"""Denial prediction model — GradientBoostingClassifier with Platt scaling calibration."""
from __future__ import annotations
import os
import pickle
import numpy as np
from typing import Optional

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "denial_predictor.pkl")

_model: Optional[CalibratedClassifierCV] = None


def _load_model() -> Optional[CalibratedClassifierCV]:
    global _model
    if _model is not None:
        return _model
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
        return _model
    return None


def predict_denial_risk(claim: dict) -> float:
    """
    Predict denial probability (0-100) for a claim.
    Falls back to rule-based scoring if model not trained yet.
    """
    model = _load_model()
    if model is not None:
        features = _extract_features(claim)
        prob = model.predict_proba([features])[0][1]
        return round(float(prob) * 100, 1)
    return _rule_based_score(claim)


def _extract_features(claim: dict) -> list:
    flags = claim.get("flags") or {}
    return [
        len(claim.get("diagnosis_codes") or []),
        float(claim.get("amount") or 0),
        1 if (flags.get("out_of_network") or claim.get("out_of_network")) else 0,
        1 if (flags.get("prior_denial") or claim.get("prior_denial")) else 0,
        1 if (flags.get("experimental_treatment") or claim.get("experimental_treatment")) else 0,
        claim.get("complexity_score") or 0,
    ]


def _rule_based_score(claim: dict) -> float:
    """Deterministic baseline used before model is trained on real data."""
    score = 0.0
    flags = claim.get("flags") or {}
    dx_count = len(claim.get("diagnosis_codes") or [])
    score += min(dx_count * 5, 20)
    if flags.get("prior_denial") or claim.get("prior_denial"):
        score += 30
    if flags.get("out_of_network") or claim.get("out_of_network"):
        score += 20
    if flags.get("experimental_treatment") or claim.get("experimental_treatment"):
        score += 25
    amount = float(claim.get("amount") or 0)
    if amount > 10000:
        score += 15
    return min(round(score, 1), 100.0)
