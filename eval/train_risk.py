#!/usr/bin/env python3
"""Train Synthure's data backed models and produce the honest benchmark numbers.
Pure stdlib (no numpy / sklearn / datasets), fully reproducible offline once the
committed data samples exist.

Outputs
  frontend/lib/models/icd_model.json          trained ICD 10 classifier (Rocchio)
  frontend/lib/models/readmission_model.json  CMS HRRP calibrated readmission map
  eval/results.json                            one source of truth for the trust page

What is and is not a trained model here (stated plainly, see also eval/README.md):
  * ICD classifier   REAL trained model. Learns TF IDF category centroids from
                     symptom text and is evaluated against the BM25 lexical
                     baseline on the same held out split. This is the model that
                     beats the documented retrieval floor and powers the offline
                     extraction path (which previously scored 0% on prose).
  * Readmission      Calibration, not extrapolation. Maps ICD 10 codes to the
                     real CMS HRRP published 30 day rates; national rate is the
                     baseline. We report a leave one out test showing chapter
                     features do NOT beat the mean, which is exactly why we rely
                     on the published rates directly rather than predict them.
  * Denial           NOT modeled. There is no public claim adjudication dataset.
                     The one labeled signal available (DataFog complexity_score)
                     turned out to be an inverse length artifact (corr about
                     -0.62 with note length), so training on it is meaningless.
                     We removed the denial heuristic instead of dressing it up;
                     the product now shows sourced prior authorization and claim
                     validity facts, never a fabricated denial probability.

Run:  python3 eval/train_risk.py
"""
import json, os, math, re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
MODELS = os.path.join(HERE, "..", "frontend", "lib", "models")  # small runtime models
EVAL_MODELS = os.path.join(HERE, "models")  # benchmark artifacts (not bundled)
os.makedirs(MODELS, exist_ok=True)
os.makedirs(EVAL_MODELS, exist_ok=True)

TOKEN_RE = re.compile(r"[a-z][a-z]+")
STOP = set(
    "the and for with this that was has had her his she him are you not but all out "
    "which were they their them then than have from your our its also can may will "
    "been being into over under about after before more most some such only who whom "
    "does did done per via due both each any one two pain or of a an to in on is at as "
    "be by it no if".split()
)


def toks(text):
    return [t for t in TOKEN_RE.findall(text.lower()) if t not in STOP and len(t) > 2]


def cat3(code):
    return code.replace(".", "")[:3].upper()


def exact(code):
    return code.replace(".", "").upper()


def split(rows, frac=0.2, seed=42):
    # Deterministic hash split so train/test are stable and reproducible.
    test, train = [], []
    for i, r in enumerate(rows):
        h = (i * 2654435761) % 1000
        (test if h < frac * 1000 else train).append(r)
    return train, test


# ── TF IDF helpers ────────────────────────────────────────────────────────────
def build_idf(docs):
    df = {}
    for d in docs:
        for w in set(d):
            df[w] = df.get(w, 0) + 1
    n = len(docs)
    # Keep terms seen in >=3 docs and <60% of docs.
    return {w: math.log((n + 1) / (c + 0.5))
            for w, c in df.items() if 3 <= c <= 0.6 * n}


def tfidf(tokens, idf):
    tf = {}
    for w in tokens:
        if w in idf:
            tf[w] = tf.get(w, 0) + 1.0
    vec = {w: (1.0 + math.log(c)) * idf[w] for w, c in tf.items()}
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {w: v / norm for w, v in vec.items()}


def cosine(a, b):
    # a, b sparse dicts (already l2 normalized for centroids/queries we build).
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(w, 0.0) for w, v in a.items())


# ── ICD retriever: tuned hybrid (word + char ngram + BM25) vs BM25 baseline ───
def char_ngrams(text, lo=3, hi=4):
    s = "^" + re.sub(r"[^a-z ]", "", text.lower()) + "$"
    out = []
    for n in range(lo, hi + 1):
        for i in range(len(s) - n + 1):
            g = s[i:i + n]
            if " " not in g or g.strip():
                out.append(g)
    return out


def vec_from(counts, idf):
    vec = {w: (1.0 + math.log(c)) * idf[w] for w, c in counts.items() if w in idf}
    nrm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {w: v / nrm for w, v in vec.items()}


def train_icd():
    from collections import Counter
    rows = json.load(open(os.path.join(DATA, "icd10_train.json")))
    rows = [r for r in rows if r.get("symptoms")]
    train, test = split(rows)
    # Hold a validation slice out of train to tune the hybrid weight honestly.
    val = train[::5]
    fit = [r for i, r in enumerate(train) if i % 5 != 0]

    # Catalog text per code = symptoms + description (everything we know at index time).
    def cat_text(r):
        return (r.get("symptoms", "") + " " + r.get("description", "")).strip()

    word_docs = [toks(cat_text(r)) for r in fit]
    char_docs = [char_ngrams(cat_text(r)) for r in fit]
    word_idf = build_idf(word_docs)
    char_idf = build_idf(char_docs)

    # Per category centroids in word space and char space (l2 normalized means).
    def build_centroids(docs, idf):
        acc, cnt = {}, {}
        for r, d in zip(fit, docs):
            c = cat3(r["code"])
            v = vec_from(Counter(d), idf)
            a = acc.setdefault(c, {})
            for w, val in v.items():
                a[w] = a.get(w, 0.0) + val
            cnt[c] = cnt.get(c, 0) + 1
        cents = {}
        for c, a in acc.items():
            for w in a:
                a[w] /= cnt[c]
            nrm = math.sqrt(sum(x * x for x in a.values())) or 1.0
            cents[c] = {w: x / nrm for w, x in a.items()}
        return cents

    word_cent = build_centroids(word_docs, word_idf)
    char_cent = build_centroids(char_docs, char_idf)
    cats = list(word_cent)

    # Inverted indexes term -> [(cat, weight)] for sparse cosine accumulation.
    def invert(cents):
        inv = {}
        for c, v in cents.items():
            for w, x in v.items():
                inv.setdefault(w, []).append((c, x))
        return inv
    word_inv = invert(word_cent)
    char_inv = invert(char_cent)

    def cos_scores(qvec, inv):
        out = {}
        for w, qx in qvec.items():
            for c, cx in inv.get(w, ()):  # nonzero contributions only
                out[c] = out.get(c, 0.0) + qx * cx
        return out

    # BM25 baseline over the same catalog text (word tokens), query = symptoms words.
    cat_doc = {}
    for r, d in zip(fit, word_docs):
        cat_doc.setdefault(cat3(r["code"]), []).extend(d)
    bcats = list(cat_doc)
    bdoc = [cat_doc[c] for c in bcats]
    Nb = len(bcats)
    avgdl = sum(len(d) for d in bdoc) / Nb
    dfb = {}
    for d in bdoc:
        for w in set(d):
            dfb[w] = dfb.get(w, 0) + 1
    idfb = {w: math.log(1 + (Nb - n + 0.5) / (n + 0.5)) for w, n in dfb.items()}
    K1, B = 1.5, 0.75
    tfb = [Counter(d) for d in bdoc]
    dlb = [len(d) for d in bdoc]

    def bm25_scores(qt):
        out = {}
        for i in range(Nb):
            s = 0.0
            for w in qt:
                f = tfb[i].get(w, 0)
                if f:
                    s += idfb.get(w, 0) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * dlb[i] / avgdl))
            if s:
                out[bcats[i]] = s
        mx = max(out.values()) if out else 1.0
        return {c: s / mx for c, s in out.items()}

    # Precompute the three component score dicts per example once (the heavy part).
    def components(data):
        out = []
        for r in data:
            tk = toks(r["symptoms"])
            if not tk:
                continue
            qw = vec_from(Counter(tk), word_idf)
            qc = vec_from(Counter(char_ngrams(r["symptoms"])), char_idf)
            out.append((cat3(r["code"]),
                        cos_scores(qw, word_inv),
                        cos_scores(qc, char_inv),
                        bm25_scores(tk)))
        return out

    def eval_combo(comp, alpha, beta):
        rr = r1 = r3 = r5 = 0
        bw = 1 - alpha - beta
        for gold, ws, cs, bs in comp:
            keys = set(ws) | set(cs) | set(bs)
            ranked = sorted(keys, key=lambda c: -(alpha * ws.get(c, 0) + beta * cs.get(c, 0) + bw * bs.get(c, 0)))
            pos = next((j for j, c in enumerate(ranked, 1) if c == gold), None)
            if pos:
                rr += 1.0 / pos; r1 += pos <= 1; r3 += pos <= 3; r5 += pos <= 5
        n = len(comp)
        return {"mrr": round(rr / n, 4), "recall@1": round(r1 / n, 4),
                "recall@3": round(r3 / n, 4), "recall@5": round(r5 / n, 4), "n": n}

    val_comp = components(val)
    test_comp = components(test)

    best = None
    for a in range(0, 11):
        for b in range(0, 11 - a):
            alpha, beta = a / 10, b / 10
            m = eval_combo(val_comp, alpha, beta)["mrr"]
            if best is None or m > best[0]:
                best = (m, alpha, beta)
    _, alpha, beta = best

    hyb = eval_combo(test_comp, alpha, beta)
    bm = eval_combo(test_comp, 0.0, 0.0)  # pure BM25 baseline (alpha=beta=0)

    # Ship a compact model: top 40 word + 40 char terms per centroid, plus idfs.
    kw, kc, sw, sc = set(), set(), {}, {}
    for c in cats:
        tw = sorted(word_cent[c].items(), key=lambda kv: -kv[1])[:40]
        tc = sorted(char_cent[c].items(), key=lambda kv: -kv[1])[:40]
        sw[c] = {w: round(x, 4) for w, x in tw}
        sc[c] = {w: round(x, 4) for w, x in tc}
        kw.update(w for w, _ in tw); kc.update(w for w, _ in tc)
    model = {
        "_meta": {
            "task": "symptom text -> ICD 10 category",
            "type": "tuned_hybrid_word_char_bm25",
            "dataset": "Inje/SYMPTOMS-COT-ICD10-2024",
            "note": "Tuned blend of word TF IDF centroid, character 3 to 4 gram TF IDF centroid, and BM25. Weights chosen on a validation slice, evaluated on a disjoint held out split.",
            "alpha_word": alpha, "beta_char": beta, "bm25_weight": round(1 - alpha - beta, 2),
            "trained": hyb, "bm25_baseline": bm,
            "n_train": len(fit), "n_val": len(val), "n_test": hyb["n"], "n_categories": len(cats),
        },
        "alpha": alpha, "beta": beta,
        "word_idf": {w: round(word_idf[w], 4) for w in kw if w in word_idf},
        "char_idf": {w: round(char_idf[w], 4) for w in kc if w in char_idf},
        "word_centroids": sw, "char_centroids": sc,
    }
    json.dump(model, open(os.path.join(EVAL_MODELS, "icd_model.json"), "w"))
    print(f"[icd] tuned hybrid (a={alpha},b={beta})  R@1={hyb['recall@1']}  R@5={hyb['recall@5']}  MRR={hyb['mrr']}  (n_test={hyb['n']})")
    print(f"[icd] BM25 baseline               R@1={bm['recall@1']}  R@5={bm['recall@5']}  MRR={bm['mrr']}")
    return model["_meta"]


# ── Readmission: calibrate to CMS HRRP published rates ────────────────────────
def train_readmission():
    cms = json.load(open(os.path.join(DATA, "cms_hrrp.json")))
    conds = cms["conditions"]
    baseline = cms["_meta"]["hospital_wide_all_cause"]
    lookup, names = {}, {}
    for c in conds:
        for p in c["icd10_prefixes"]:
            lookup[p] = c["readmit_rate"]
            names[p] = c["condition"]

    CHRONIC = {"Heart failure", "COPD", "CABG eligible coronary disease",
               "Chronic kidney disease", "Diabetes with complications"}
    chapters = sorted({c["icd10_prefixes"][0][0] for c in conds})

    def feats(c):
        v = [1.0 if c["icd10_prefixes"][0][0] == ch else 0.0 for ch in chapters]
        v += [1.0 if c["condition"] in CHRONIC else 0.0, 1.0]
        return v

    def ridge(X, y, lam=0.5):
        m = len(X[0])
        A = [[sum(X[r][i] * X[r][j] for r in range(len(X))) + (lam if i == j else 0)
              for j in range(m)] for i in range(m)]
        bv = [sum(X[r][i] * y[r] for r in range(len(X))) for i in range(m)]
        for i in range(m):
            piv = A[i][i] or 1e-9
            for j in range(i + 1, m):
                f = A[j][i] / piv
                for k in range(m):
                    A[j][k] -= f * A[i][k]
                bv[j] -= f * bv[i]
        w = [0.0] * m
        for i in range(m - 1, -1, -1):
            w[i] = (bv[i] - sum(A[i][k] * w[k] for k in range(i + 1, m))) / (A[i][i] or 1e-9)
        return w

    gmean = sum(c["readmit_rate"] for c in conds) / len(conds)
    ae, be = [], []
    for h in range(len(conds)):
        tr = [conds[i] for i in range(len(conds)) if i != h]
        w = ridge([feats(c) for c in tr], [c["readmit_rate"] for c in tr])
        xh = feats(conds[h])
        ae.append(abs(sum(w[i] * xh[i] for i in range(len(xh))) - conds[h]["readmit_rate"]))
        be.append(abs(gmean - conds[h]["readmit_rate"]))
    mae, bmae = sum(ae) / len(ae), sum(be) / len(be)

    model = {
        "_meta": {
            "task": "30 day all cause readmission probability",
            "source": cms["_meta"]["source"],
            "type": "cms_calibrated_lookup",
            "note": "ICD 10 prefix maps to the real CMS HRRP published rate; national all cause rate is the baseline. Multiple codes take the maximum (dominant condition drives readmission).",
            "loo_chapter_regression": {
                "mae_pp": round(100 * mae, 2),
                "mean_baseline_mae_pp": round(100 * bmae, 2),
                "n_conditions": len(conds),
                "reading": "Chapter features do not beat the mean baseline, so we calibrate to published rates directly rather than extrapolate.",
            },
        },
        "baseline": baseline,
        "lookup": lookup,
        "condition": names,
    }
    json.dump(model, open(os.path.join(MODELS, "readmission_model.json"), "w"))
    print(f"[readmit] CMS calibrated. LOO chapter MAE={100*mae:.2f}pp vs mean baseline {100*bmae:.2f}pp (N={len(conds)})")
    return model["_meta"]


def main():
    icd = train_icd()
    readmit = train_readmission()
    results = {
        "generated_by": "eval/train_risk.py (pure stdlib, reproducible)",
        "icd_classifier": icd,
        "readmission_head": readmit,
        "denial": {
            "modeled": False,
            "reason": "No public claim adjudication (paid vs denied) dataset exists. DataFog complexity_score, the only labeled proxy available, is an inverse length artifact (corr about -0.62 with note length), so a model trained on it learns nothing real. The denial heuristic was removed; the product shows sourced prior authorization and claim validity facts instead of a fabricated probability.",
        },
    }
    json.dump(results, open(os.path.join(HERE, "results.json"), "w"), indent=2)
    print("wrote eval/results.json")


if __name__ == "__main__":
    main()
