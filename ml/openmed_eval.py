"""Evaluate the OpenMed backbone (de-identification + biomedical NER) directly
with onnxruntime against the gold spans in the synthetic corpus. Runs on a
subsample for speed. Returns span-level precision/recall/F1 (overlap match) for
NER and recall for de-identification on notes seeded with synthetic PII.
"""

import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "frontend" / "public" / "models"

try:
    import onnxruntime as ort
    from tokenizers import Tokenizer
    HAVE = True
except Exception:
    HAVE = False


def _load(model_dir):
    sess = ort.InferenceSession(str(MODELS / model_dir / "onnx" / "model_quantized.onnx"),
                                providers=["CPUExecutionProvider"])
    tok = Tokenizer.from_file(str(MODELS / model_dir / "tokenizer.json"))
    cfg = json.loads((MODELS / model_dir / "config.json").read_text())
    id2label = {int(k): v for k, v in cfg["id2label"].items()}
    inputs = {i.name for i in sess.get_inputs()}
    return sess, tok, id2label, inputs


def _run(sess, tok, id2label, inputs, text):
    enc = tok.encode(text)
    ids = np.array([enc.ids], dtype=np.int64)
    mask = np.array([enc.attention_mask], dtype=np.int64)
    feed = {"input_ids": ids, "attention_mask": mask}
    if "token_type_ids" in inputs:
        feed["token_type_ids"] = np.zeros_like(ids)
    logits = sess.run(None, feed)[0][0]
    labels = [id2label[int(i)] for i in logits.argmax(-1)]
    spans = []
    cur = None
    for lab, off in zip(labels, enc.offsets):
        if off == (0, 0):
            continue
        if lab == "O":
            if cur:
                spans.append(cur); cur = None
            continue
        tag = lab.split("-", 1)[-1]
        if cur and lab.startswith("I-") and cur[2] == tag:
            cur = (cur[0], off[1], tag)
        else:
            if cur:
                spans.append(cur)
            cur = (off[0], off[1], tag)
    if cur:
        spans.append(cur)
    return spans


def _overlap(a, b):
    return not (a[1] <= b[0] or b[1] <= a[0])


def prf(pred, gold):
    tp = 0
    used = set()
    for p in pred:
        for j, g in enumerate(gold):
            if j in used:
                continue
            if _overlap(p, g):
                tp += 1
                used.add(j)
                break
    fp = len(pred) - tp
    fn = len(gold) - tp
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return prec, rec, f1, tp, fp, fn


PII_SEED = [
    ("John Smith", "name"), ("Maria Garcia", "name"), ("Robert Chen", "name"),
    ("03/14/1961", "date"), ("555-123-4567", "phone"), ("MRN 4432219", "mrn"),
]


def evaluate(test, n=60):
    if not HAVE:
        return {"available": False, "note": "onnxruntime/tokenizers not installed in this environment"}
    sub = test[:n]
    dis = _load("disease-tinymed-65m")
    pha = _load("pharma-tinymed-65m")
    pii = _load("pii-clinicale5-33m")

    # NER: disease spans vs gold DIAGNOSIS+SIGN_SYMPTOM; pharma vs gold MEDICATION
    dP = dR = pP = pR = 0.0
    dTP = dFP = dFN = pTP = pFP = pFN = 0
    for r in sub:
        gold_dx = [(e["start"], e["end"], "D") for e in r["entities"] if e["type"] in ("DIAGNOSIS", "SIGN_SYMPTOM")]
        gold_rx = [(e["start"], e["end"], "M") for e in r["entities"] if e["type"] == "MEDICATION"]
        pd = [(s[0], s[1], "D") for s in _run(*dis, r["note"])]
        pr = [(s[0], s[1], "M") for s in _run(*pha, r["note"])]
        _, _, _, tp, fp, fn = prf(pd, gold_dx); dTP += tp; dFP += fp; dFN += fn
        _, _, _, tp, fp, fn = prf(pr, gold_rx); pTP += tp; pFP += fp; pFN += fn

    def agg(tp, fp, fn):
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f = 2 * p * r / (p + r) if p + r else 0.0
        return round(p, 3), round(r, 3), round(f, 3)

    dis_p, dis_r, dis_f = agg(dTP, dFP, dFN)
    rx_p, rx_r, rx_f = agg(pTP, pFP, pFN)

    # de-id recall: inject PII into 30 notes, measure how many spans the PII
    # model redacts (overlap with the injected span).
    hit = tot = 0
    for r in sub[:30]:
        note = r["note"]
        seeds = []
        for txt, _ in PII_SEED[:3]:
            pos = len(note)
            note = note + f" Contact: {txt}."
            s = note.find(txt, pos)
            seeds.append((s, s + len(txt)))
        spans = [(x[0], x[1]) for x in _run(*pii, note)]
        for gs in seeds:
            tot += 1
            if any(_overlap((gs[0], gs[1], "P"), (sp[0], sp[1], "P")) for sp in spans):
                hit += 1
    deid_recall = round(hit / tot, 3) if tot else 0.0

    return {
        "available": True,
        "n_notes": len(sub),
        "ner_disease": {"precision": dis_p, "recall": dis_r, "f1": dis_f},
        "ner_pharma": {"precision": rx_p, "recall": rx_r, "f1": rx_f},
        "deid_recall": deid_recall,
        "deid_seeded_spans": tot,
    }
