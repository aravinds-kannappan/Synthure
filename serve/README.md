---
title: Synthure Models
emoji: 🩺
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# Synthure model service

FastAPI serving the two trained Synthure models so the Vercel Next.js app can
call them over HTTP. Runs on the free Hugging Face CPU Basic tier.

| Endpoint | Input | Output |
|---|---|---|
| `GET /` | — | health + which models loaded |
| `POST /code` | `{mentions: [...], top: 8}` or `{note: "..."}` | ranked ICD-10-CM codes with description, billable flag, score |
| `POST /faithfulness` | `{note, extraction, report}` | per-sentence P(supported) + `flagged` unsupported sentences |

The inference reproduces `ml/icd_coder/predict.py` and `ml/faithfulness/score.py`
exactly (same pooling, tokenizer lengths, sigmoid/softmax). Each half loads only
if its weights are present, so the coder can run before the faithfulness checker
is trained.

## What the Space repo must contain

```
app.py  Dockerfile  requirements.txt  README.md
data/icd10cm.json.gz            # FY2026 tabular (descriptions + billable)
icd_coder_out/                  # from Colab: retriever/, reranker/, code_index.npz
faithfulness_out/               # from Colab: checker/, threshold.json  (optional)
```

`app.py`, `Dockerfile`, `requirements.txt`, and `README.md` come from this repo's
`serve/` folder. `data/icd10cm.json.gz` is `frontend/data/icd10cm.json.gz`. The
two `*_out/` folders are the trained weights. The Colab notebook's "push to Space"
cell assembles all of this and uploads it in one shot.

## Wiring into the app

Set `SYNTHURE_MODEL_API` in Vercel to this Space's URL
(`https://<owner>-<space>.hf.space`). The synthesize route then links diagnoses
with the trained coder (each code revalidated against the CMS tabular) and, if the
checker is loaded, attaches faithfulness flags to each portal report. If the env
var is unset or the Space is unreachable, the app falls back to its existing
lexical linker with no change in behavior.
