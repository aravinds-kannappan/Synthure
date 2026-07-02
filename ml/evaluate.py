"""Evaluate every Synthure-owned model and the OpenMed backbone on the held-out
test split, then write ml/artifacts/results.json (copied to frontend/data/
evals.json for the dashboard). Reports the full metric suite with honest, small
sample sizes and clear labeling of what is synthetic.
"""

import json
import time
import datetime

import numpy as np
from sklearn.metrics import roc_auc_score, average_precision_score, f1_score

from common import OUT, DATA, ICD_OF
from features import structural_features, struct_vector, NOTE_TYPES, MISSING_FIELDS
from section_parser import parse_sections
import train as T
import openmed_eval

MODELS = OUT / "models"


def load(split):
    with open(OUT / f"{split}.jsonl") as f:
        return [json.loads(l) for l in f]


def m(name):
    return json.loads((MODELS / f"{name}.json").read_text())


# ── Note type ─────────────────────────────────────────────────────────────────
def eval_note_type(test):
    md = m("note_type")
    vocab, idf, coef, inter = md["vocab"], md["idf"], md["coef"], md["intercept"]
    from features import note_type_tokens
    correct = 0
    t0 = time.time()
    for r in test:
        toks = note_type_tokens(r["note"])
        tf = {}
        for tk in toks:
            if tk in vocab:
                tf[vocab[tk]] = tf.get(vocab[tk], 0) + 1
        # sublinear tf-idf
        vec = {i: (1 + np.log(c)) * idf[i] for i, c in tf.items()}
        norm = np.sqrt(sum(v * v for v in vec.values())) or 1.0
        scores = list(inter)
        for i, v in vec.items():
            vn = v / norm
            for cls in range(len(scores)):
                scores[cls] += coef[cls][i] * vn
        pred = NOTE_TYPES[int(np.argmax(scores))]
        correct += pred == r["note_type"]
    ms = (time.time() - t0) * 1000 / len(test)
    return {"accuracy": round(correct / len(test), 3), "n": len(test), "ms_per_note": round(ms, 2)}


# ── Section parsing (rule based) ──────────────────────────────────────────────
def eval_sections(test):
    tp = fp = fn = 0
    for r in test:
        pred = parse_sections(r["note"])
        gold = r["sections"]
        gmatched = set()
        for p in pred:
            hit = False
            for j, g in enumerate(gold):
                if j in gmatched:
                    continue
                # overlap of spans and same section name
                if p["name"] == g["name"] and not (p["end"] <= g["start"] or g["end"] <= p["start"]):
                    tp += 1; gmatched.add(j); hit = True; break
            if not hit:
                fp += 1
        fn += len(gold) - len(gmatched)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(f1, 3), "type": "rule-based"}


# ── ICD candidate ranking (reranker top-k) ────────────────────────────────────
def eval_coding(test):
    terms, tokmap, tab = T.load_index()
    rr = m("reranker")
    coef, inter = rr["coef"], rr["intercept"]
    top1 = top3 = total = 0
    halluc = 0
    for r in test:
        for c in r["icd"]:
            cond = ICD_OF.get(c)
            if not cond:
                continue
            total += 1
            cands = T.retrieve(cond["say"][0], terms, tokmap, tab, 8)
            scored = []
            for cd in cands:
                x = [cd["overlap"], cd["termlen"], cd["billable"], cd["rank"]]
                s = inter + sum(a * b for a, b in zip(coef, x))
                scored.append((s, cd["code"]))
                # hallucination: every candidate must exist in the tabular
                if cd["code"].replace(".", "").upper() not in tab:
                    halluc += 1
            scored.sort(reverse=True)
            gold = c.replace(".", "").upper()
            ranked = [cd.replace(".", "").upper() for _, cd in scored]
            if ranked[:1] == [gold]:
                top1 += 1
            if gold in ranked[:3]:
                top3 += 1
    return {
        "top1_accuracy": round(top1 / total, 3),
        "top3_accuracy": round(top3 / total, 3),
        "n": total,
        "hallucinated_codes": halluc,
        "hallucination_rate": round(halluc / max(total, 1), 4),
    }


# ── Missing info (per field + micro F1) ───────────────────────────────────────
def eval_missing(test):
    md = m("missing")
    keys = md["keys"]
    Y_true, Y_pred = [], []
    per = {}
    for f in MISSING_FIELDS:
        per[f] = {"tp": 0, "fp": 0, "fn": 0}
    for r in test:
        feats = structural_features(r["note"], r["note_type"], len(r["icd"]), len(r["cpt"]))
        x = struct_vector(feats)
        for f in MISSING_FIELDS:
            mm = md["models"][f]
            z = mm["intercept"] + sum(a * b for a, b in zip(mm["coef"], x))
            p = 1 / (1 + np.exp(-z))
            pred = 1 if p >= 0.5 else 0
            true = 1 if f in r["missing"] else 0
            Y_true.append(true); Y_pred.append(pred)
            if pred and true: per[f]["tp"] += 1
            elif pred and not true: per[f]["fp"] += 1
            elif not pred and true: per[f]["fn"] += 1
    micro = f1_score(Y_true, Y_pred, zero_division=0)
    fields = {}
    for f, c in per.items():
        p = c["tp"] / (c["tp"] + c["fp"]) if c["tp"] + c["fp"] else 0.0
        rr = c["tp"] / (c["tp"] + c["fn"]) if c["tp"] + c["fn"] else 0.0
        fields[f] = round(2 * p * rr / (p + rr), 3) if p + rr else 0.0
    return {"micro_f1": round(micro, 3), "per_field_f1": fields}


# ── Readiness AUROC/AUPRC + ECE + abstention ──────────────────────────────────
def gbm_prob(gbm, x):
    s = gbm["init"]
    for tree in gbm["trees"]:
        node = 0
        while tree["children_left"][node] != -1:
            if x[tree["feature"][node]] <= tree["threshold"][node]:
                node = tree["children_left"][node]
            else:
                node = tree["children_right"][node]
        s += gbm["learning_rate"] * tree["value"][node]
    return 1 / (1 + np.exp(-s))


def calibrate(cal, p):
    xs, ys = cal["x"], cal["y"]
    for i in range(len(xs) - 1):
        if p <= xs[i + 1]:
            t = (p - xs[i]) / (xs[i + 1] - xs[i] + 1e-9)
            return ys[i] + t * (ys[i + 1] - ys[i])
    return ys[-1]


def ece(probs, labels, bins=10):
    probs, labels = np.array(probs), np.array(labels)
    e = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        mask = (probs > lo) & (probs <= hi)
        if mask.sum() == 0:
            continue
        conf = probs[mask].mean()
        acc = labels[mask].mean()
        e += (mask.sum() / len(probs)) * abs(conf - acc)
    return e


def eval_readiness(test):
    md = m("readiness")
    gbm, cal = md["gbm"], md["calibration"]
    raw, calp, y = [], [], []
    for r in test:
        x = struct_vector(structural_features(r["note"], r["note_type"], len(r["icd"]), len(r["cpt"])))
        p = gbm_prob(gbm, x)
        raw.append(p); calp.append(calibrate(cal, p)); y.append(r["ready"])
    auroc = roc_auc_score(y, raw)
    auprc = average_precision_score(y, raw)
    ece_raw = ece(raw, y)
    ece_cal = ece(calp, y)
    # abstention: withhold the least confident 20% (nearest to 0.5), measure
    # accuracy on the confident remainder vs overall
    conf = [abs(p - 0.5) for p in calp]
    order = np.argsort(conf)  # least confident first
    keep = set(order[int(0.2 * len(order)):].tolist())
    preds = [1 if p >= 0.5 else 0 for p in calp]
    acc_all = np.mean([preds[i] == y[i] for i in range(len(y))])
    acc_conf = np.mean([preds[i] == y[i] for i in range(len(y)) if i in keep])
    return {
        "auroc": round(auroc, 3), "auprc": round(auprc, 3),
        "ece_raw": round(ece_raw, 3), "ece_calibrated": round(ece_cal, 3),
        "abstain_frac": 0.2,
        "accuracy_all": round(float(acc_all), 3),
        "accuracy_confident": round(float(acc_conf), 3),
        "n": len(y),
    }


def main():
    test = load("test")
    t0 = time.time()
    results = {
        "built": datetime.date.today().isoformat(),
        "corpus": {
            "note": "Synthetic clinical notes constructed from curated conditions with real ICD 10 CM codes. Labels are exact gold. Absolute numbers reflect a controlled synthetic distribution and will be lower on real clinical text.",
            "test_notes": len(test),
        },
        "note_type": eval_note_type(test),
        "sections": eval_sections(test),
        "coding": eval_coding(test),
        "missing_info": eval_missing(test),
        "readiness": eval_readiness(test),
    }
    print("running OpenMed backbone eval (onnxruntime, subsample)...")
    results["openmed"] = openmed_eval.evaluate(test, n=60)
    results["eval_wall_seconds"] = round(time.time() - t0, 1)

    (OUT / "results.json").write_text(json.dumps(results, indent=1))
    (DATA / "evals.json").write_text(json.dumps(results, indent=1))
    print(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
