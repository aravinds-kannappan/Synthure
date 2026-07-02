# Synthure ML harness

Synthure-owned models trained and evaluated here, then exported to JSON and run
in-process by the product (frontend/lib/models/). Claude is NOT a runtime
decision-maker; it is used only for synthetic-note augmentation, weak labeling,
adversarial cases, and rubric-based explanation of results.

## Models
| Model | Type | Purpose |
|---|---|---|
| note_type | TF-IDF + logistic regression | classify SOAP / discharge / referral / ER / radiology / intake / progress |
| sections | rule-based parser | detect and span clinical sections |
| reranker | logistic regression | rank ICD candidates from the official index |
| missing | per-field logistic regression | detect missing documentation fields |
| readiness | gradient boosted trees + isotonic calibration | claim / prior-auth readiness with calibrated confidence |

The OpenMed backbone (de-identification, biomedical NER, embeddings) is used as
provided and evaluated with onnxruntime in openmed_eval.py.

## Reproduce
```bash
python3 -m venv .venv && .venv/bin/pip install numpy scikit-learn onnxruntime tokenizers
.venv/bin/python generate.py 2400   # synthetic labeled corpus (gold labels)
.venv/bin/python train.py           # train + export models to frontend/lib/models/
.venv/bin/python evaluate.py        # full metric suite -> frontend/data/evals.json
```

## Honest framing
Absolute metrics reflect a controlled SYNTHETIC distribution (notes built from
curated conditions with real ICD 10 CM codes, so labels are exact gold). Numbers
will be lower on real clinical text. This is a research/prototype-grade system
with auditable outputs, human review, and measurable evals, not a production
medical device.
