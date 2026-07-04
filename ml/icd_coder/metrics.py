"""Multi-label ICD coding metrics.

Pure numpy so this runs on any machine (no torch, no GPU) and is unit testable.
All functions take:
  y_true : (N, L) 0/1 array of gold labels
  y_prob : (N, L) float array of predicted probabilities (post sigmoid)

The headline numbers for automated ICD coding are micro F1, macro F1, and
precision at k. We also report micro AUC and example based F1 so the picture is
honest across the long tail of rare codes.
"""

from __future__ import annotations

import numpy as np


def _binarize(y_prob: np.ndarray, threshold: float) -> np.ndarray:
    return (y_prob >= threshold).astype(np.int8)


def micro_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    tp = int((y_pred & y_true).sum())
    fp = int((y_pred & (1 - y_true)).sum())
    fn = int(((1 - y_pred) & y_true).sum())
    denom = 2 * tp + fp + fn
    return (2 * tp / denom) if denom else 0.0


def macro_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    # Per label F1 averaged over labels that appear in gold at least once, so
    # never seen labels do not silently inflate the mean toward zero or one.
    tp = (y_pred & y_true).sum(axis=0)
    fp = (y_pred & (1 - y_true)).sum(axis=0)
    fn = ((1 - y_pred) & y_true).sum(axis=0)
    denom = 2 * tp + fp + fn
    support = y_true.sum(axis=0) > 0
    if support.sum() == 0:
        return 0.0
    with np.errstate(divide="ignore", invalid="ignore"):
        f1 = np.where(denom > 0, 2 * tp / denom, 0.0)
    return float(f1[support].mean())


def example_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    # F1 computed per note (row) then averaged over notes. Rewards getting a
    # whole note's code set right, which is what a coder is judged on in practice.
    tp = (y_pred & y_true).sum(axis=1)
    fp = (y_pred & (1 - y_true)).sum(axis=1)
    fn = ((1 - y_pred) & y_true).sum(axis=1)
    denom = 2 * tp + fp + fn
    with np.errstate(divide="ignore", invalid="ignore"):
        f1 = np.where(denom > 0, 2 * tp / denom, 0.0)
    return float(f1.mean())


def precision_at_k(y_true: np.ndarray, y_prob: np.ndarray, k: int) -> float:
    # For each note take the k highest scoring codes, measure the fraction that
    # are truly assigned. This is threshold free, the standard MIMIC metric.
    n = y_true.shape[0]
    if y_true.shape[1] < k:
        k = y_true.shape[1]
    top = np.argpartition(-y_prob, kth=k - 1, axis=1)[:, :k]
    rows = np.arange(n)[:, None]
    hits = y_true[rows, top]
    return float(hits.sum(axis=1).mean() / k)


def micro_auc(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    # Micro averaged ROC AUC over all (note, label) cells. sklearn is optional;
    # if it is missing we skip the metric rather than fail the whole eval.
    try:
        from sklearn.metrics import roc_auc_score
    except Exception:
        return float("nan")
    yt = y_true.reshape(-1)
    yp = y_prob.reshape(-1)
    if yt.min() == yt.max():
        return float("nan")
    return float(roc_auc_score(yt, yp))


def best_threshold(y_true: np.ndarray, y_prob: np.ndarray, grid: int = 50) -> float:
    """Pick the global threshold that maximizes micro F1 on the given split.

    Tune this on validation only, then apply the frozen value to test.
    """
    best_t, best_f = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, grid):
        f = micro_f1(y_true, _binarize(y_prob, t))
        if f > best_f:
            best_f, best_t = f, float(t)
    return best_t


def evaluate(y_true: np.ndarray, y_prob: np.ndarray, threshold: float) -> dict:
    y_true = y_true.astype(np.int8)
    y_pred = _binarize(y_prob, threshold)
    out = {
        "threshold": round(float(threshold), 4),
        "micro_f1": round(micro_f1(y_true, y_pred), 4),
        "macro_f1": round(macro_f1(y_true, y_pred), 4),
        "example_f1": round(example_f1(y_true, y_pred), 4),
        "micro_auc": round(micro_auc(y_true, y_prob), 4),
        "n": int(y_true.shape[0]),
        "labels": int(y_true.shape[1]),
        "avg_codes_true": round(float(y_true.sum(axis=1).mean()), 3),
        "avg_codes_pred": round(float(y_pred.sum(axis=1).mean()), 3),
    }
    for k in (5, 8, 15):
        out[f"p_at_{k}"] = round(precision_at_k(y_true, y_prob, k), 4)
    return out


if __name__ == "__main__":
    # Smoke test: a signal carrying predictor should beat a random one on micro F1.
    rng = np.random.default_rng(0)
    N, L = 400, 60
    yt = (rng.random((N, L)) < 0.08).astype(np.int8)
    signal = yt * 0.6 + rng.random((N, L)) * 0.4  # correlated with truth
    noise = rng.random((N, L))
    t = best_threshold(yt, signal)
    good = evaluate(yt, signal, t)
    bad = evaluate(yt, noise, best_threshold(yt, noise))
    print("tuned threshold:", t)
    print("signal :", good)
    print("random :", bad)
    assert good["micro_f1"] > bad["micro_f1"], "signal must beat noise"
    assert good["p_at_5"] > bad["p_at_5"], "P@5 must beat noise"
    print("\nmetrics.py smoke test passed")
