#!/usr/bin/env python3
"""Real BM25 retrieval benchmark: clinical symptoms -> ICD 10 code.

A lexical (BM25) baseline over a catalog of ICD 10 code descriptions. For each
query (a symptom list) it ranks the catalog and checks whether the gold code is
retrieved. Stdlib only; reads the committed real data sample. This is the honest
baseline that the planned semantic (embedding) retriever is meant to beat.

Run:  python3 eval/retrieval_bm25.py
"""
import json, re, math, random, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(HERE, 'data', 'icd10_sample.json')))

tok = lambda t: re.findall(r'[a-z0-9]+', t.lower())
cat = lambda c: c.replace('.', '')[:3].upper()
exact = lambda c: c.replace('.', '').upper()

# Catalog: one description per unique ICD 10 code.
corpus = {}
for r in rows:
    corpus.setdefault(r['code'], r['description'])
codes = list(corpus)
doc_toks = [tok(corpus[c]) for c in codes]
N = len(codes)
avgdl = sum(len(d) for d in doc_toks) / N

df = {}
for dt in doc_toks:
    for w in set(dt):
        df[w] = df.get(w, 0) + 1
idf = {w: math.log(1 + (N - n + 0.5) / (n + 0.5)) for w, n in df.items()}
K1, B = 1.5, 0.75


def bm25(qt, dt):
    tf = Counter(dt); dl = len(dt); s = 0.0
    for w in qt:
        f = tf.get(w, 0)
        if f:
            s += idf.get(w, 0) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * dl / avgdl))
    return s


random.seed(1)
sample = random.sample(rows, min(200, len(rows)))
mrr = r5 = r10 = ex10 = 0
for r in sample:
    qt = tok(r['symptoms'])
    ranked = sorted(range(N), key=lambda i: bm25(qt, doc_toks[i]), reverse=True)[:10]
    gcat, gex = cat(r['code']), exact(r['code'])
    rank = next((j for j, i in enumerate(ranked, 1) if cat(codes[i]) == gcat), None)
    if rank:
        mrr += 1 / rank
    cats = [cat(codes[i]) for i in ranked]
    exs = [exact(codes[i]) for i in ranked]
    r5 += gcat in cats[:5]
    r10 += gcat in cats[:10]
    ex10 += gex in exs[:10]

n = len(sample)
print(f"corpus (unique ICD 10 codes): {N}")
print(f"queries (symptoms -> code):   {n}")
print(f"BM25 MRR@10 (category)    = {mrr / n:.3f}")
print(f"BM25 recall@5 (category)  = {100 * r5 / n:.1f}%")
print(f"BM25 recall@10 (category) = {100 * r10 / n:.1f}%")
print(f"BM25 recall@10 (exact)    = {100 * ex10 / n:.1f}%")
