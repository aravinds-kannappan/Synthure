"""Faithfulness-checker metrics (pure numpy, unit testable).

Convention: label 1 = SUPPORTED, label 0 = UNSUPPORTED. The actionable output is
the FLAG (a sentence predicted unsupported), so we report flag precision and
recall separately from overall accuracy:

  flag_precision  of the sentences we flag, how many are truly unsupported
                  (high precision = we rarely cry wolf on good writing)
  flag_recall     of the truly unsupported sentences, how many we catch
                  (high recall = few hallucinations slip through)

`p_supported` is the model's probability that the claim is supported; a sentence
is flagged when p_supported < threshold.
"""

from __future__ import annotations

import numpy as np


def _rates(y_true: np.ndarray, flagged: np.ndarray) -> dict:
    # unsupported (label 0) is the positive class for flagging
    truly_unsup = y_true == 0
    tp = int((flagged & truly_unsup).sum())
    fp = int((flagged & ~truly_unsup).sum())
    fn = int((~flagged & truly_unsup).sum())
    tn = int((~flagged & ~truly_unsup).sum())
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    sup_acc = tn / (tn + fp) if (tn + fp) else 0.0   # specificity: supported kept
    bal_acc = 0.5 * (rec + sup_acc)
    acc = (tp + tn) / len(y_true) if len(y_true) else 0.0
    return {
        "flag_precision": round(prec, 4),
        "flag_recall": round(rec, 4),
        "flag_f1": round(f1, 4),
        "balanced_acc": round(bal_acc, 4),
        "accuracy": round(acc, 4),
        "flag_rate": round(float(flagged.mean()), 4) if len(flagged) else 0.0,
    }


def auroc(y_true: np.ndarray, p_supported: np.ndarray) -> float:
    try:
        from sklearn.metrics import roc_auc_score
    except Exception:
        return float("nan")
    if y_true.min() == y_true.max():
        return float("nan")
    return float(roc_auc_score(y_true, p_supported))


def best_threshold(y_true: np.ndarray, p_supported: np.ndarray, grid: int = 50,
                   objective: str = "balanced_acc") -> float:
    """Pick the flag threshold on validation. Flag when p_supported < t."""
    best_t, best_v = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, grid):
        flagged = p_supported < t
        v = _rates(y_true, flagged)[objective]
        if v > best_v:
            best_v, best_t = v, float(t)
    return best_t


def evaluate(y_true: np.ndarray, p_supported: np.ndarray, threshold: float) -> dict:
    y_true = y_true.astype(int)
    flagged = p_supported < threshold
    out = {"threshold": round(float(threshold), 4), "n": int(len(y_true)),
           "auroc": round(auroc(y_true, p_supported), 4)}
    out.update(_rates(y_true, flagged))
    return out


if __name__ == "__main__":
    rng = np.random.default_rng(0)
    n = 600
    y = (rng.random(n) < 0.5).astype(int)                    # half supported
    # a model that puts supported claims high, unsupported low, with noise
    p_signal = np.clip(y * 0.6 + 0.2 + rng.normal(0, 0.15, n), 0, 1)
    p_noise = rng.random(n)
    t = best_threshold(y, p_signal)
    good = evaluate(y, p_signal, t)
    bad = evaluate(y, p_noise, best_threshold(y, p_noise))
    print("tuned threshold:", round(t, 3))
    print("signal:", good)
    print("noise :", bad)
    assert good["auroc"] > 0.8 > bad["auroc"] or good["auroc"] > bad["auroc"] + 0.2
    assert good["balanced_acc"] > bad["balanced_acc"]
    print("\nmetrics.py smoke test passed")
