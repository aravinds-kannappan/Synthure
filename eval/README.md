# Synthure evaluation suite

Honest, reproducible evaluation of Synthure's components. Every number here was
actually run on real public data. Where a claim cannot be measured honestly in
this environment, it is marked as such, with the reason.

## Measured results

| Component | Task | Result | Notes |
|---|---|---|---|
| **NER** (Claude Haiku) | diagnosis prose → ICD 10 | **60.4%** category recall, **23.5%** exact (N = 149) | vs **0.0%** for the regex baseline on the same prose |
| **Retrieval** (BM25) | symptoms → ICD 10 | **MRR@10 0.095**, recall@10 **20.0%** (600 code catalog) | lexical baseline; ~0.07 on a 1,500 code catalog. This is the floor the planned semantic retriever should beat |
| **De-identification** | redact PHI in clinical text | **8 / 8** PHI spans on the demo note | demonstrated; precision and recall need a gold labelled corpus (see below) |

The headline finding for NER is the gap: the deterministic extractor recovers
**no** diagnoses from prose (prose contains no literal codes), while the Claude
NER path recovers the correct ICD 10 chapter most of the time. The retrieval
result honestly shows that lexical matching is weak on symptom → diagnosis,
which is the motivation for a semantic retriever.

## Run it

```bash
# Retrieval (stdlib Python, no key, no network)
python3 eval/retrieval_bm25.py

# De-identification (stdlib Python; redacts a demo note, or pipe your own)
python3 eval/deid.py
cat some_note.txt | python3 eval/deid.py

# NER (needs an Anthropic key + the product engine compiled)
cd frontend && npx tsc lib/synthure.ts lib/knowledge.ts lib/engine.ts \
  --rootDir lib --outDir ../eval/_build --module commonjs --target es2019 \
  --moduleResolution node --skipLibCheck --esModuleInterop && cd ..
ANTHROPIC_API_KEY=... node eval/ner_benchmark.js
```

`eval/data/icd10_sample.json` is a 600 row sample of the public dataset
`Inje/SYMPTOMS-COT-ICD10-2024` (each row: ICD 10 code, description, symptoms),
committed so the benchmarks run offline.

## What is NOT measured here, and why

We refuse to print numbers we cannot reproduce. The following are described in
the paper as heuristics or future work rather than as results:

- **Denial prediction.** There is no public dataset of real claim adjudication
  outcomes (paid vs denied); that data is PHI protected. The product uses a
  transparent heuristic. A real model needs a labelled claims corpus. Until
  then, no AUC is claimed.
- **PHI de-id precision and recall.** Measuring this needs a corpus with gold
  PHI spans (for example i2b2 2014 de-id, which is access controlled). We ship
  the working component and demonstrate it; we do not claim a P/R number.
- **Readmission calibration.** Plan: calibrate against published CMS HRRP rates
  and report mean absolute error.
- **End to end latency at scale.** Plan: instrument the deployed pipeline and
  report p50/p95/p99 per stage over real traffic.

Two of the original scaling items are not machine learning problems at all and
have no training data: **HIPAA / SOC 2 compliance** (an organizational and audit
process) and **go to market** (a business function). The de-identification
component above is the real, software shaped piece of the compliance work; the
rest is not something a model is trained for.
