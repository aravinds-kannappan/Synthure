"""
Denial probability predictor trained on DataFog/medical-transcription-instruct.

Dataset: DataFog/medical-transcription-instruct (38,924 rows)
  Columns used:
    - transcription (text)      → TF-IDF features
    - complexity_score (float)  → training label proxy (>= 0.5 = high-complexity = likely denial)

Model: TF-IDF (5k features, unigrams + bigrams) → GradientBoostingClassifier
Output: denial_probability (float 0–1) + complexity_score (float 0–1)

The model is trained once from the live HuggingFace dataset on first call,
then pickled to MODEL_PATH for all subsequent calls. Re-train by deleting the pickle.

Why this approach:
  The DataFog complexity_score is a human-annotated measure of clinical note difficulty.
  High-complexity notes correlate strongly with claims that require prior auth review
  or get flagged for denial. We learn what text features (rare medical terms, multi-code
  combinations, high-value procedures) predict high complexity, then apply that to new notes.
"""

from __future__ import annotations

import os
import pickle
import re
import threading
from typing import NamedTuple

MODEL_PATH = os.path.join(os.path.dirname(__file__), "denial_predictor.pkl")
_lock = threading.Lock()
_model = None  # loaded lazily


class DenialPrediction(NamedTuple):
    denial_probability: float   # 0–1; >= 0.5 means likely denial / high complexity
    complexity_score: float     # 0–1; raw model output before threshold
    features_used: list[str]    # top TF-IDF terms that drove the score
    model_source: str           # "trained" | "rule-based-fallback"


# ── Feature engineering ───────────────────────────────────────────────────────

_ICD10_RE = re.compile(r"\b[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?\b")
_CPT_RE   = re.compile(r"\b[0-9]{5}\b")
_HIGH_COST_TERMS = re.compile(
    r"\b(surgery|surgical|transplant|chemotherapy|radiation|ICU|intensive care|"
    r"ventilator|dialysis|MRI|CT scan|angioplasty|bypass|implant|biopsy|"
    r"endoscopy|colonoscopy|laparoscopy|arthroplasty)\b",
    re.IGNORECASE,
)


def _engineer_features(text: str) -> dict:
    """Structured features extracted from raw text, appended to TF-IDF."""
    return {
        "num_icd10_codes": len(_ICD10_RE.findall(text)),
        "num_cpt_codes": len(_CPT_RE.findall(text)),
        "num_high_cost_terms": len(_HIGH_COST_TERMS.findall(text)),
        "text_length": len(text),
        "word_count": len(text.split()),
        "has_prior_auth_mention": int(bool(re.search(r"prior auth|pre-auth|preauthorization", text, re.I))),
        "has_denial_history": int(bool(re.search(r"denied|denial|not covered|rejected", text, re.I))),
        "has_experimental": int(bool(re.search(r"experimental|investigational|off-label", text, re.I))),
        "has_out_of_network": int(bool(re.search(r"out.of.network|OON|non-participating", text, re.I))),
    }


def _rule_based_score(text: str, claim_flags: dict | None = None) -> DenialPrediction:
    """
    Fallback when the trained model is unavailable.
    Replaces the old hardcoded _compute_complexity() in orchestrator.py.
    """
    feats = _engineer_features(text)
    score = 0.0
    score += min(feats["num_icd10_codes"] * 0.08, 0.24)
    score += min(feats["num_cpt_codes"] * 0.10, 0.20)
    score += min(feats["num_high_cost_terms"] * 0.07, 0.21)
    score += feats["has_prior_auth_mention"] * 0.15
    score += feats["has_denial_history"] * 0.20
    score += feats["has_experimental"] * 0.25
    score += feats["has_out_of_network"] * 0.18
    if claim_flags:
        score += 0.25 if claim_flags.get("prior_denial") else 0
        score += 0.20 if claim_flags.get("out_of_network") else 0
        score += 0.25 if claim_flags.get("experimental_treatment") else 0
    score = min(score, 1.0)
    return DenialPrediction(
        denial_probability=round(score, 3),
        complexity_score=round(score, 3),
        features_used=[k for k, v in feats.items() if v > 0],
        model_source="rule-based-fallback",
    )


# ── Training ──────────────────────────────────────────────────────────────────

def _train() -> object:
    """
    Download DataFog/medical-transcription-instruct and train the model.
    Called once; result is pickled.
    """
    import numpy as np
    from datasets import load_dataset
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.pipeline import FeatureUnion, Pipeline
    from sklearn.preprocessing import FunctionTransformer
    from scipy.sparse import hstack
    import scipy.sparse as sp

    print("[denial_predictor] Downloading DataFog/medical-transcription-instruct...")
    ds = load_dataset("DataFog/medical-transcription-instruct", split="train")

    texts: list[str] = []
    labels: list[int] = []
    struct_rows: list[list[float]] = []

    for row in ds:
        t = (row.get("transcription") or "").strip()
        c = float(row.get("complexity_score") or 0.0)
        if not t:
            continue
        texts.append(t[:1000])
        labels.append(1 if c >= 0.5 else 0)
        feats = _engineer_features(t)
        struct_rows.append(list(feats.values()))

    print(f"[denial_predictor] Training on {len(texts):,} samples "
          f"({sum(labels):,} high-complexity, {len(labels)-sum(labels):,} standard)...")

    tfidf = TfidfVectorizer(
        max_features=5000,
        ngram_range=(1, 2),
        sublinear_tf=True,
        strip_accents="unicode",
    )
    X_tfidf = tfidf.fit_transform(texts)
    X_struct = sp.csr_matrix(np.array(struct_rows, dtype=float))
    X = hstack([X_tfidf, X_struct])

    clf = GradientBoostingClassifier(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
    )
    clf.fit(X, labels)

    bundle = {"tfidf": tfidf, "clf": clf}
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(bundle, f)
    print(f"[denial_predictor] Model saved to {MODEL_PATH}")
    return bundle


def _load() -> object | None:
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            return pickle.load(f)
    return None


def _get_model() -> object | None:
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        bundle = _load()
        if bundle is None:
            try:
                bundle = _train()
            except Exception as exc:
                print(f"[denial_predictor] Training failed — using rule-based fallback: {exc}")
                return None
        _model = bundle
    return _model


# ── Public API ────────────────────────────────────────────────────────────────

def predict(text: str, claim_flags: dict | None = None) -> DenialPrediction:
    """
    Predict denial probability for a clinical note or claim text.
    Returns DenialPrediction with probability, score, and contributing features.
    Falls back to rule-based scoring if model is unavailable.
    """
    import numpy as np
    import scipy.sparse as sp

    bundle = _get_model()
    if bundle is None:
        return _rule_based_score(text, claim_flags)

    tfidf = bundle["tfidf"]
    clf = bundle["clf"]

    feats = _engineer_features(text)
    X_tfidf = tfidf.transform([text[:1000]])
    X_struct = sp.csr_matrix(np.array([list(feats.values())], dtype=float))

    import scipy.sparse
    X = scipy.sparse.hstack([X_tfidf, X_struct])

    proba = clf.predict_proba(X)[0][1]  # probability of class 1 (high complexity)

    # Top TF-IDF terms driving the score
    feature_names = list(tfidf.get_feature_names_out()) + list(feats.keys())
    importances = clf.feature_importances_
    top_indices = importances.argsort()[-5:][::-1]
    top_features = [feature_names[i] for i in top_indices if i < len(feature_names)]

    if claim_flags:
        adjustment = (
            0.15 * claim_flags.get("prior_denial", False)
            + 0.12 * claim_flags.get("out_of_network", False)
            + 0.18 * claim_flags.get("experimental_treatment", False)
        )
        proba = min(proba + adjustment, 1.0)

    return DenialPrediction(
        denial_probability=round(float(proba), 3),
        complexity_score=round(float(proba), 3),
        features_used=top_features,
        model_source="trained",
    )


def to_complexity_score_100(pred: DenialPrediction) -> int:
    """Convert DenialPrediction to 0–100 int for backwards compatibility with ClaimIR."""
    return int(pred.complexity_score * 100)
