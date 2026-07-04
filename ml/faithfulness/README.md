# Synthure faithfulness checker (open data, A100)

A trained model that reads each sentence the four portal writers produce and
flags the ones not supported by the note and extraction. The writers are Claude
(free generation, so they can hallucinate a dose, an unstated diagnosis, a
flipped negation); this is the trained safety net over them.

## Why this exists

Claude cannot be fine-tuned on your A100 (closed weights), and distilling the
writers into a small open model would make them *more* hallucination-prone, not
less. So instead of replacing the writers, this trains the piece that directly
attacks writer hallucination: a cross-encoder that scores `(evidence, claim)` and
returns P(supported). Sentences below a tuned threshold are flagged for review.
It complements the existing Verifier and constitution critic in
`frontend/app/api/synthesize/route.ts` with a measurable, benchmarkable model.

## How it is trained (fully open)

| Signal | Source | Label |
|---|---|---|
| clinical corruptions | Synthure's own synthetic notes + extractions (`data.py`) | supported claim = 1; entity-swapped / dose-changed / negation-flipped / added-diagnosis = 0 |
| open warm-up (optional) | FEVER, VitaminC via HuggingFace `datasets` | SUPPORTS = 1; REFUTES / NEI = 0 |

The corruption generator is FactCC-style: it never needs a download or PHI, and
the negatives are matched minimal edits of the positives, which is what forces
the model to actually check the claim against the evidence rather than pattern
match on topic.

## Honest framing

- This checks *consistency with the provided note and extraction*, not clinical
  correctness. A claim can be faithful to a wrong note and still be marked
  supported.
- Absolute numbers reflect the synthetic corruption distribution; report them as
  such. Real writer hallucinations are more varied, so validate on held-out
  Claude outputs before trusting a threshold in production.
- The output is a *flag for human review*, not an automated block.

## Run on Colab (A100)

```bash
pip install "torch" "transformers>=4.44" "sentencepiece" "scikit-learn" "datasets>=2.20"

cd ml/faithfulness
python train.py --nli            # DeBERTa NLI warm start + synthetic corruptions
# python train.py --nli --open-nli  # also mix in open FEVER/VitaminC
python score.py --note "Patient on lisinopril 10 mg for hypertension." \
    --claim "The patient has hypertension." \
    --claim "The patient takes metformin."   # should flag this one
```

Smoke test with no downloads and no GPU:

```bash
python metrics.py                 # metric math
python data.py                    # corruption generator + leakage check
python claims.py                  # report -> claims + evidence builder
python train.py --smoke           # tiny backbone, few steps, writes a checker
```

## Outputs (under `config.out_dir`)

```
checker/          HF cross-encoder + tokenizer
threshold.json    flag threshold tuned on validation (flag when p_supported < t)
eval.json         held-out test: AUROC, flag precision / recall / F1, balanced acc
```

## Wiring into the product

The checker runs server side, after the writers, before the response streams
back. In `route.ts`, for each `StakeholderReport` call `score.Checker.score(note,
extraction, report)` (via a small Python service or HF Space), then attach the
flagged sentences to the report so a portal can surface a "needs review" marker,
and/or feed them into the existing Verifier stage. Wire it only after a run
produces a checker whose flag recall on held-out Claude outputs is high enough to
be worth the review load.
