"""Train 30-day readmission risk scorer."""
import os
import pickle
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import cross_val_score

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "readmission_scorer.pkl")


def train(X: np.ndarray, y: np.ndarray) -> dict:
    base = LogisticRegression(C=1.0, max_iter=200)
    calibrated = CalibratedClassifierCV(base, cv=5, method='sigmoid')
    calibrated.fit(X, y)
    scores = cross_val_score(calibrated, X, y, cv=5, scoring='roc_auc')
    metrics = {"auc_mean": float(scores.mean()), "training_rows": len(X)}
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(calibrated, f)
    print(f"Readmission scorer trained: AUC={metrics['auc_mean']:.3f}")
    return metrics


if __name__ == "__main__":
    rng = np.random.default_rng(42)
    n = 2000
    ages = rng.uniform(0, 1, n)
    conds = rng.uniform(0, 1, n)
    meds = rng.uniform(0, 1, n)
    high_risk = rng.binomial(1, 0.25, n).astype(float)
    X = np.column_stack([ages, conds, meds, high_risk])
    y = ((ages > 0.6) & (conds > 0.4) | (high_risk == 1) | (rng.random(n) > 0.85)).astype(int)
    train(X, y)
