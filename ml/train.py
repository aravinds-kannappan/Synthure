"""Train the Synthure-owned models and export them to JSON for TS inference.

Data source: the trained data engine (ml/data_engine), which writes
ml/artifacts/corpus/{train,val,test}.jsonl. `test.jsonl` is a frozen real-note
holdout; every headline number is reported on it, separately from the synthetic
val split. If the corpus is absent, this falls back to the legacy
ml/artifacts/{split}.jsonl for backward compatibility.

Models:
  note_type   PyTorch multinomial logistic over word 1-2 gram TF-IDF (note_type_torch.py)
  missing     per-field logistic regression over structural features (scikit-learn)
  readiness   gradient boosted trees + isotonic calibration (scikit-learn)
  reranker    logistic regression over lexical features (scikit-learn)

Exports land in ml/artifacts/models/ and, unless --no-export is passed, are copied
to frontend/lib/models/. scikit-learn is imported lazily so `--only note_type`
runs with just torch (handy for local verification without sklearn).
"""

import argparse
import gzip
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np

from common import OUT, DATA, ROOT
from features import (
    structural_features, struct_vector, STRUCT_KEYS,
    NOTE_TYPES, MISSING_FIELDS,
)
from note_type_torch import train_note_type as _train_note_type_torch

# The data engine's independent labelers, for records that arrive without
# missing/readiness labels (e.g. real notes). Flat imports resolve because we add
# the data_engine dir to the path; there is no name clash with ml/ modules.
sys.path.append(str(Path(__file__).resolve().parent / "data_engine"))
from labels import missing_labels, readiness_label  # noqa: E402

CORPUS = ROOT / "ml" / "artifacts" / "corpus"
MODELS = OUT / "models"
MODELS.mkdir(parents=True, exist_ok=True)
FE_MODELS = ROOT / "frontend" / "lib" / "models"
FE_MODELS.mkdir(parents=True, exist_ok=True)

EXPORT_FE = True  # set False by --no-export to avoid clobbering the shipped models

_DX_SECTION = re.compile(r"\b(assessment|diagnosis|impression|problem|decision)\b", re.I)


def _enrich(r: dict) -> dict:
    """Fill labels an incoming record may lack, using the independent labelers so a
    real note and a generated note carry the same label semantics."""
    if r.get("icd") is None:
        r["icd"] = []
    if r.get("cpt") is None:
        r["cpt"] = []
    if r.get("missing") is None:
        r["missing"] = missing_labels(r["note"])
    if r.get("ready") is None:
        has_dx = bool(r["icd"]) or bool(_DX_SECTION.search(r["note"].lower()))
        r["ready"] = readiness_label(r["missing"], has_dx)
    return r


def load(split: str) -> list[dict]:
    path = CORPUS / f"{split}.jsonl"
    if not path.exists():
        path = OUT / f"{split}.jsonl"  # legacy fallback
    if not path.exists():
        return []
    with open(path) as f:
        return [_enrich(json.loads(line)) for line in f if line.strip()]


def dump(name: str, obj) -> None:
    (MODELS / name).write_text(json.dumps(obj))
    if EXPORT_FE:
        shutil.copy(MODELS / name, FE_MODELS / name)
        print(f"  exported {name} ({(MODELS / name).stat().st_size/1024:.0f} KB) -> frontend/lib/models/")
    else:
        print(f"  wrote {name} to ml/artifacts/models/ (frontend export skipped)")


# ── 1. Note-type classifier (PyTorch) ─────────────────────────────────────────
def train_note_type(train, val, test):
    print("note_type: PyTorch multinomial logistic over TF-IDF")
    export, metrics = _train_note_type_torch(train, val, test)
    dump("note_type.json", export)
    (MODELS / "note_type_eval.json").write_text(json.dumps(metrics, indent=2))
    print(
        f"  train {metrics['train_acc']}  |  synthetic-val {metrics['val_acc']}  |  "
        f"REAL-test {metrics['real_test_acc']}  (n_test={metrics['n_test']}, vocab={metrics['vocab_size']})"
    )
    if metrics["real_test_acc"] is not None and metrics["real_test_acc"] >= 0.999:
        print("  note: real-test accuracy at ceiling. Confirm the test split is real notes, not synthetic.")
    return metrics


# ── 2. Missing-info detector (per field) ──────────────────────────────────────
def train_missing(train, val):
    from sklearn.linear_model import LogisticRegression

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
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.isotonic import IsotonicRegression
    from sklearn.metrics import roc_auc_score

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
    xs = np.linspace(0, 1, 51)
    ys = iso.predict(xs).tolist()
    dump("readiness.json", {"gbm": export_gbm(clf), "calibration": {"x": xs.tolist(), "y": ys}})
    print(f"  val AUROC (raw): {roc_auc_score(yva, raw):.3f}")


# ── 4. ICD candidate reranker ─────────────────────────────────────────────────
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
    from sklearn.linear_model import LogisticRegression
    from common import ICD_OF

    print("reranker: logistic regression over lexical features")
    X, y = [], []
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
        print("  not enough positives (corpus lacks gold ICD pairs); skipping reranker")
        return
    clf = LogisticRegression(max_iter=1500, class_weight="balanced")
    clf.fit(X, y)
    dump("reranker.json", {"keys": ["overlap", "termlen", "billable", "rank"], "coef": clf.coef_[0].tolist(), "intercept": float(clf.intercept_[0])})


def main():
    global EXPORT_FE
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="all", choices=["all", "note_type"], help="which models to train")
    ap.add_argument("--no-export", action="store_true", help="do not copy artifacts into frontend/lib/models")
    args = ap.parse_args()
    EXPORT_FE = not args.no_export

    train, val, test = load("train"), load("val"), load("test")
    if not train:
        raise SystemExit("no training corpus found. Run ml/data_engine/build.py first.")
    print(f"corpus: train {len(train)} / val {len(val)} / test {len(test)} (test is the frozen real-note holdout)")

    train_note_type(train, val, test)
    if args.only == "all":
        train_missing(train, val)
        train_readiness(train, val)
        terms, tokmap, tab = load_index()
        train_reranker(train, terms, tokmap, tab)
    print("done.")


if __name__ == "__main__":
    main()
