"""Train denial predictor on accumulated claim outcomes."""
import os
import pickle
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import cross_val_score

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "denial_predictor.pkl")


def train(X: np.ndarray, y: np.ndarray) -> dict:
    """
    Train and calibrate a denial predictor.
    Requires at least 500 labelled claim outcomes.
    Features: [dx_count, amount, out_of_network, prior_denial, experimental, complexity_score]
    """
    base = GradientBoostingClassifier(n_estimators=200, max_depth=4, learning_rate=0.05)
    calibrated = CalibratedClassifierCV(base, cv=5, method='sigmoid')
    calibrated.fit(X, y)

    scores = cross_val_score(calibrated, X, y, cv=5, scoring='f1')
    metrics = {
        "f1_mean": float(scores.mean()),
        "f1_std": float(scores.std()),
        "training_rows": len(X),
    }

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(calibrated, f)

    print(f"Denial predictor trained: F1={metrics['f1_mean']:.3f} ±{metrics['f1_std']:.3f}")
    return metrics


if __name__ == "__main__":
    # Bootstrap on synthetic data from complexity-scoring rules
    rng = np.random.default_rng(42)
    n = 1000
    X = np.column_stack([
        rng.integers(1, 8, n),
        rng.uniform(100, 50000, n),
        rng.binomial(1, 0.15, n),
        rng.binomial(1, 0.10, n),
        rng.binomial(1, 0.05, n),
        rng.integers(0, 101, n),
    ]).astype(float)
    y = ((X[:, 2] > 0) | (X[:, 5] > 60) | (rng.random(n) > 0.8)).astype(int)
    train(X, y)
