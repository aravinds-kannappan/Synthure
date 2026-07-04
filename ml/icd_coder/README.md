# Synthure ICD coder (open data, A100)

A trained, two stage ICD-10-CM coder that replaces the lexical index lookup plus
Claude "pick a code" step in the current pipeline. No MIMIC, no PhysioNet, no
credentialing: it trains on the ICD-10-CM ontology already in this repo and on
CodiEsp, a public CC-BY dataset of real clinical cases.

## Why this design

Fully open, English, document level ICD-10-CM datasets do not exist outside
MIMIC, which is credentialed. Training a from-scratch document multi-label coder
on the only open option (CodiEsp, 500 train docs, 3400+ codes) would be data
starved. So the coder is split so each stage is trained on data that actually
exists in the open:

| Stage | Model | Trained on | Signal size |
|---|---|---|---|
| 1. retriever | bi-encoder (SapBERT-style) | `phrase -> code` pairs mined from the FY2026 ICD-10-CM index + tabular in `frontend/data/` | ~269k pairs, 98k codes |
| 2. reranker | cross-encoder | CodiEsp evidence spans (real clinical cases) with retriever-mined hard negatives | 500 + 250 docs |

The retriever learns the ontology (every code, in the coders' own index
language). The reranker learns to choose among candidates from real clinical
narrative. Neither stage invents a code: the label space is exactly the codes
Synthure already ships descriptions for.

## Honest framing

- The retriever is trained on the ontology, not on patient notes, so it is a
  learned lexical/semantic matcher, not evidence of clinical reasoning.
- The reranker is trained on CodiEsp, which is Spanish clinical cases machine
  translated to English and coded in the Spanish ICD-10 modification. Absolute
  numbers will differ on US ICD-10-CM discharge notes. Report CodiEsp MAP as a
  CodiEsp number, not a universal accuracy claim.
- This replaces an LLM decision (Claude picking a code) with a trained model
  whose candidates come from the official index, which matches the product's
  stated position that Claude is not a runtime decision maker.

## Run on Colab (A100)

```bash
pip install "torch" "transformers>=4.44" "datasets>=2.20" "accelerate>=0.33" scikit-learn

cd ml/icd_coder

# stage 1: retriever + code index (downloads a biomed backbone, ~10-20 min A100)
python train_retriever.py

# get CodiEsp (public, CC-BY 4.0) and point config.codiesp_root at it
#   https://zenodo.org/record/3837305
# stage 2: reranker fine-tune + CodiEsp-D eval (MAP, P@k)
python train_reranker.py

# inference
python predict.py --note "pt w/ htn, type 2 dm with foot ulcer" --top 8
```

Smoke test the whole flow with no downloads and no GPU:

```bash
python metrics.py                    # metric math
python data.py                       # mines the 269k real pairs from the repo
python train_retriever.py --smoke    # tiny backbone, few steps, writes an index
python train_reranker.py --smoke     # synthetic CodiEsp, prints MAP/P@k
```

## Outputs (under `config.out_dir`)

```
retriever/            HF encoder + tokenizer
code_index.npz        codes[] and unit-norm embeddings (the searchable index)
reranker/             HF cross-encoder + tokenizer
reranker_eval.json    CodiEsp-D MAP, P@5/8/15
retriever_meta.json   backbone, dim, counts
```

## Wiring back into the product

The trained coder runs server side (it is a multi-hundred-candidate reranker, not
an on-device model). Two integration options, in order of effort:

1. Serve `predict.Coder` behind a small FastAPI (there is already a `backend/`)
   or a Hugging Face Space, and have the Next.js route call it in place of the
   `icdCandidates()` + Claude selection step in
   `frontend/lib/knowledge.server.ts`.
2. For a fully static deploy, precompute the code index and export the retriever
   to ONNX/transformers.js for on-device candidate retrieval, then keep the
   cross-encoder rerank server side. Heavier; do this only after the metrics
   justify it.

Do the wiring only after a real training run produces a checkpoint whose CodiEsp
MAP beats the current lexical retriever on the same held-out docs.
