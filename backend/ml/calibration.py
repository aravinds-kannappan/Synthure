"""Calibrated classifier wrapper — all sklearn models wrapped with CalibratedClassifierCV."""
from __future__ import annotations
from sklearn.calibration import CalibratedClassifierCV
from sklearn.base import BaseEstimator


def calibrate(estimator: BaseEstimator, cv: int = 5) -> CalibratedClassifierCV:
    """Wrap an estimator with Platt scaling calibration."""
    return CalibratedClassifierCV(estimator, cv=cv, method='sigmoid')
