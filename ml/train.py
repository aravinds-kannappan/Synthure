"""Train the Synthure-owned models and export them to JSON for TS inference.

Models:
  note_type   TF-IDF (word 1-2gram) + multinomial logistic regression
  missing     per-field logistic regression over structural features
  readiness   gradient boosted trees over structural features
  calibration isotonic calibration of readiness scores (fit on val)
  reranker    logistic regression over lexical features for ICD candidate ranking

Exports land in ml/artifacts/models/ and are copied to frontend/lib/models/.
"""

import gzip
import json
import re
import shutil

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression

from common import OUT, DATA, ROOT
from features import (
    note_type_tokens, structural_features, struct_vector, STRUCT_KEYS,
    NOTE_TYPES, MISSING_FIELDS,
)

MODELS = OUT / "models"
MODELS.mkdir(parents=True, exist_ok=True)
FE_MODELS = ROOT / "frontend" / "lib" / "models"
FE_MODELS.mkdir(parents=True, exist_ok=True)


def load(split):
    with open(OUT / f"{split}.jsonl") as f:
        return [json.loads(l) for l in f]


def dump(name, obj):
    (MODELS / name).write_text(json.dumps(obj))
    shutil.copy(MODELS / name, FE_MODELS / name)
    print(f"  exported {name} ({(MODELS / name).stat().st_size/1024:.0f} KB)")


# ── 1. Note-type classifier ──────────────────────────────────────────────────
def train_note_type(train, val):
    print("note_type: TF-IDF + logistic regression")
    Xtr = [" ".join(note_type_tokens(r["note"])) for r in train]
    ytr = [NOTE_TYPES.index(r["note_type"]) for r in train]
    vec = TfidfVectorizer(analyzer="word", token_pattern=r"[^ ]+", max_features=1600, sublinear_tf=True)
    Xv = vec.fit_transform(Xtr)
    clf = LogisticRegression(max_iter=2000, C=6.0)
    clf.fit(Xv, ytr)
    # export vocab + idf + coef
    vocab = vec.vocabulary_
    inv = {i: t for t, i in vocab.items()}
    dump("note_type.json", {
        "classes": NOTE_TYPES,
        "vocab": {inv[i]: i for i in range(len(inv))},
        "idf": vec.idf_.tolist(),
        "coef": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
    })
    acc = np.mean([NOTE_TYPES[int(np.argmax(clf.decision_function(vec.transform([" ".join(note_type_tokens(r["note"]))]))[0]))] == r["note_type"] for r in val])
    print(f"  val accuracy: {acc:.3f}")


# ── 2. Missing-info detector (per field) ──────────────────────────────────────
def train_missing(train, val):
    print("missing: per-field logistic regression")
    Xtr = np.array([struct_vector(structural_features(r["note"], r["note_type"], len(r["icd"]), len(r["cpt"]))) for r in train])
    models = {}
    for field in MISSING_FIELDS:
        y = np.array([1 if field in r["missing"] else 0 for r in train])
        if y.sum() < 5 or y.sum() > len(y) - 5:
            models[field] = {"coef": [0.0] * len(STRUCT_KEYS), "intercept": -4.0}
            continue
        clf = LogisticRegression(max_iter=1500, C=3.0, class_weight="balanced")
        clf.fit(Xtr, y)
        models[field] = {"coef": clf.coef_[0].tolist(), "intercept": float(clf.intercept_[0])}
    dump("missing.json", {"fields": MISSING_FIELDS, "keys": STRUCT_KEYS, "models": models})


# ── 3. Readiness predictor + calibration ──────────────────────────────────────
def export_gbm(clf):
    """Serialize a sklearn GradientBoostingClassifier (binary) to a compact JSON
    ensemble of regression trees plus init and learning rate."""
    trees = []
    for stage in clf.estimators_:
        t = stage[0].tree_
        trees.append({
            "children_left": t.children_left.tolist(),
            "children_right": t.children_right.tolist(),
            "feature": t.feature.tolist(),
            "threshold": t.threshold.tolist(),
            "value": [v[0][0] for v in t.value],
        })
    init = float(clf.init_.class_prior_[1])
    init_log = np.log(init / (1 - init))
    return {"trees": trees, "learning_rate": float(clf.learning_rate), "init": init_log, "keys": STRUCT_KEYS}


def train_readiness(train, val):
    print("readiness: gradient boosted trees + isotonic calibration")
    Xtr = np.array([struct_vector(structural_features(r["note"], r["note_type"], len(r["icd"]), len(r["cpt"]))) for r in train])
    ytr = np.array([r["ready"] for r in train])
    clf = GradientBoostingClassifier(n_estimators=80, max_depth=3, learning_rate=0.15, random_state=0)
    clf.fit(Xtr, ytr)
    Xva = np.array([struct_vector(structural_features(r["note"], r["note_type"], len(r["icd"]), len(r["cpt"]))) for r in val])
    yva = np.array([r["ready"] for r in val])
    raw = clf.predict_proba(Xva)[:, 1]
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(raw, yva)
    # export calibration as a monotone step function (x thresholds -> y)
    xs = np.linspace(0, 1, 51)
    ys = iso.predict(xs).tolist()
    dump("readiness.json", {"gbm": export_gbm(clf), "calibration": {"x": xs.tolist(), "y": ys}})
    from sklearn.metrics import roc_auc_score
    print(f"  val AUROC (raw): {roc_auc_score(yva, raw):.3f}")


# ── 4. ICD candidate reranker ─────────────────────────────────────────────────
# Minimal port of the index token-overlap retrieval so we can build candidate
# sets in Python, then train a learned reranker over lexical features.
def load_index():
    with gzip.open(DATA / "icd10index.json.gz", "rt") as f:
        raw = json.load(f)
    with gzip.open(DATA / "icd10cm.json.gz", "rt") as f:
        tab = json.load(f)
    tokmap = {}
    terms = []
    for term, codes in raw.items():
        i = len(terms)
        terms.append((term, codes))
        for t in set(re.sub(r"[^a-z0-9]+", " ", term.lower()).split()):
            if len(t) > 1:
                tokmap.setdefault(t, []).append(i)
    return terms, tokmap, tab


def retrieve(phrase, terms, tokmap, tab, limit=8):
    q = [t for t in re.sub(r"[^a-z0-9]+", " ", phrase.lower()).split() if len(t) > 1]
    if not q:
        return []
    counts = {}
    for t in set(q):
        for i in tokmap.get(t, []):
            counts[i] = counts.get(i, 0) + 1
    need = len(set(q))
    ids = [i for i, n in counts.items() if n >= need] or [i for i, n in counts.items() if n >= max(1, need - 1)]
    scored = []
    for i in ids:
        term, codes = terms[i]
        tt = re.sub(r"[^a-z0-9]+", " ", term.lower()).split()
        overlap = len(set(tt) & set(q))
        scored.append((overlap, -(len(tt) - overlap), i))
    scored.sort(reverse=True)
    out = []
    seen = set()
    for overlap, _, i in scored:
        term, codes = terms[i]
        for code in codes:
            u = code.replace(".", "").upper()
            if u in seen or u not in tab:
                continue
            seen.add(u)
            tt = re.sub(r"[^a-z0-9]+", " ", term.lower()).split()
            out.append({"code": code, "overlap": overlap, "termlen": len(tt), "billable": tab[u][0], "rank": len(out)})
            if len(out) >= limit:
                return out
    return out


def train_reranker(train, terms, tokmap, tab):
    print("reranker: logistic regression over lexical features")
    X, y = [], []
    from common import ICD_OF
    for r in train[:600]:
        for c in r["icd"]:
            cond = ICD_OF.get(c)
            if not cond:
                continue
            phrase = cond["say"][0]
            cands = retrieve(phrase, terms, tokmap, tab, 8)
            gold = c.replace(".", "").upper()
            for cand in cands:
                feat = [cand["overlap"], cand["termlen"], cand["billable"], cand["rank"]]
                X.append(feat)
                y.append(1 if cand["code"].replace(".", "").upper() == gold else 0)
    X, y = np.array(X, float), np.array(y)
    if y.sum() < 5:
        print("  not enough positives, skipping")
        return
    clf = LogisticRegression(max_iter=1500, class_weight="balanced")
    clf.fit(X, y)
    dump("reranker.json", {"keys": ["overlap", "termlen", "billable", "rank"], "coef": clf.coef_[0].tolist(), "intercept": float(clf.intercept_[0])})


def main():
    train, val = load("train"), load("val")
    train_note_type(train, val)
    train_missing(train, val)
    train_readiness(train, val)
    terms, tokmap, tab = load_index()
    train_reranker(train, terms, tokmap, tab)
    print("done.")


if __name__ == "__main__":
    main()
