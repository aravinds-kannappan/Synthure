# Synthure evaluation suite

Honest, reproducible evaluation of Synthure's components. Every number here was
actually run on real public data with a committed, pure standard library script.
Where a claim cannot be measured honestly, it is marked as such, with the reason.

This suite is also the source of truth for the risk numbers the product shows.
The previous hand tuned risk heuristics have been removed; what replaces them is
either trained from data or looked up from a published source, and benchmarked
here.

## Measured results

| Component | Task | Result | Notes |
|---|---|---|---|
| **NER** (Claude Haiku) | diagnosis prose, ICD 10 | **60.4%** category recall, **23.5%** exact (N = 149) | vs **0.0%** for the regex baseline on the same prose |
| **Retrieval** (trained hybrid) | symptoms, ICD 10 category | **MRR 0.340**, recall@5 **44.2%** (held out N = 781) | edges the **BM25 0.330 / 43.5%** baseline on the same split |
| **Readmission** (CMS calibrated) | ICD 10, 30 day readmission | published CMS HRRP rates; **LOO MAE 5.27pp** vs 4.29pp mean baseline (N = 10) | calibration, not extrapolation |
| **De-identification** | redact PHI in clinical text | **8 / 8** PHI spans on the demo note | demonstrated; P/R needs a gold corpus (see below) |

The retriever result is the honest one to read carefully: a tuned blend of a word
TF IDF centroid, a character n gram centroid, and BM25 (weights chosen on a
validation slice, scored on a disjoint test split) only **edges** BM25. Lexical
methods plateau here, which is the measured motivation for a dense retriever.

## Run it

```bash
# Train the retriever + readmission calibration, write models + eval/results.json
python3 eval/train_risk.py            # pure stdlib, offline, reproducible

# Lexical retrieval baseline (stdlib, no key, no network)
python3 eval/retrieval_bm25.py

# De-identification (stdlib; redacts a demo note, or pipe your own)
python3 eval/deid.py

# NER (needs an Anthropic key + the product engine compiled, see git history)
ANTHROPIC_API_KEY=... node eval/ner_benchmark.js
```

`eval/train_risk.py` reads the committed real data samples
(`eval/data/icd10_train.json` from `Inje/SYMPTOMS-COT-ICD10-2024`,
`eval/data/cms_hrrp.json`) and writes:

- `frontend/lib/models/readmission_model.json` (shipped, ~2 KB): ICD 10 prefix to
  CMS HRRP published rate, used at runtime.
- `eval/models/icd_model.json` (benchmark artifact, ~2 MB, **not bundled** into
  the app): the trained hybrid retriever.
- `eval/results.json`: the benchmark numbers the product trust page cites.

To refetch the raw data: `python3 eval/fetch_icd.py` and
`python3 eval/fetch_complexity.py` (both shell out to curl for the HuggingFace
datasets server).

## What is NOT measured here, and why

We refuse to print numbers we cannot reproduce.

- **Denial prediction. Removed, not modeled.** There is no public dataset of real
  claim adjudication outcomes (paid vs denied); that data is PHI protected. We
  tested the one labeled proxy available, the `DataFog/medical-transcription-instruct`
  `complexity_score`, and found it correlates about **-0.62 with note length**, so
  it is an inverse length artifact (a logistic regression trivially reached AUC
  1.0 by reconstructing length). We therefore removed the denial heuristic and the
  product shows **no denial probability**, only sourced prior authorization and
  claim validity facts. `eval/fetch_complexity.py` reproduces the finding.

- **PHI de-id precision and recall.** Measuring this needs a corpus with gold PHI
  spans (for example i2b2 2014 de-id, access controlled). We ship and demonstrate
  the component; we do not claim a P/R number.

- **NER at scale and end to end latency.** N for NER is 149 on an idealized
  dataset; per stage latency at scale on the deployed pipeline is future work.

**HIPAA / SOC 2 compliance** and **go to market** are not machine learning
problems and have no training data; the de-identification component is the real,
software shaped piece of the compliance work.

> NOTE (2026-07): these evaluations measured the previous pipeline (Claude tool_use NER vs a regex baseline, dictionary knowledge). The shipped pipeline now runs OpenMed ONNX models in the browser for de identification and NER, and links codes through the official ICD 10 CM index with constrained choice (see frontend/lib/openmed.ts and frontend/app/api/synthesize/route.ts). Re benchmarking against the new pipeline is planned; the scripts here are kept as the record of the prior measurement.
