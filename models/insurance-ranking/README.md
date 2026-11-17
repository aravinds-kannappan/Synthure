# Insurance preference models

There are two deliberately separate paths:

- **Synthetic demonstration: trained and active at `/insurance`.** `synthetic_train.py` generates reproducible fictional cases, trains a pairwise linear ranker on an authored preference policy, and exports weights that the browser loads. Cost arithmetic and exact fictional provider-network mapping remain deterministic. This model does not interpret clinical notes or verify a real plan.
- **Verified-data research path: not trained.** `train.py`, `schema.json`, and `model-status.json` retain the stricter real-data requirements below. No verified real-world training dataset or performance result has been supplied. The main `/demo` journey also retains its transparent sample rules; real pasted notes receive no fictional plan/provider recommendations.

## Reproduce the synthetic demo

```sh
python3 -B synthetic_train.py
```

Seed `20261116` generates 1,500 distinct input combinations across three synthetic scenarios, three preferences, 0–36 annual visits, example budgets, language choices, and travel preferences. All three plan candidates for a case stay together: 1,200 cases (3,600 rows) train the ranker; 300 cases (900 rows) are held out. The script uses Python's standard library and no network.

Fifteen interaction features represent the selected preference combined with annual cost, premium, annual financial exposure, sample-network size, and accessible sample-network size. Pairwise logistic training learns the authored ordering policy. The ranking pipeline first places plans within the entered premium budget before over-budget options, then uses the learned score. No score is a probability of insurance coverage or patient suitability.

The executed default run reproduces the authored policy's top choice on 98.0% of held-out synthetic cases and its raw pair ordering on 96.56% of held-out synthetic pairs. The first metric includes the deterministic budget rule; the second does not. These are **synthetic-policy fidelity results**, not real insurance accuracy. The held-out set shares the same policy and plan catalog; it cannot establish real-world generalization, actual savings, appropriate coverage, or clinical benefit.

Generated files:

- `synthetic-artifacts/dataset.jsonl`: all 4,500 fictional candidate rows and split labels.
- `synthetic-artifacts/model.json` and `evaluation.json`: weights, actual run metrics, seed, policy, limitations, and dataset digest.
- `../../frontend/lib/insurance-demo-model.json`: the identical runtime model, loaded by `insurance-demo.ts`.

`insurance-demo.harness.ts` checks runtime inference against held-out Python reference cases, exact sample-network IDs, budget constraints, changing preferences, missing matches, and benefit arithmetic. Re-running with different epochs updates the artifacts; read the generated evaluation instead of treating the above default-run numbers as fixed guarantees.

## Verified-data research path

The offline utility learns a linear pairwise ranking of **human plan preferences**. It does not learn coverage, eligibility, claim approvals, medical outcomes, or a universally “best” plan. Those require different data and validation. The minimum ten-household check is a tooling floor, not sufficient evidence for deployment.

## Dataset

Supply JSONL matching `schema.json`, with one candidate plan per case. Each case must have at least two candidates with different reviewed preference grades. Record the exact plan/year, verified availability and eligibility, documented permitted training use, evidence references, and a reviewer reference. Use pseudonymous household group IDs so repeated cases from the same household cannot appear in both training and evaluation. Do not place names, member IDs, notes, documents, or credentials in this directory.

Features must come from the actual offered plan, verified provider/formulary data, and an explicit annual-use scenario. Unknown eligibility, network, or formulary facts must not silently become zero or one. Exclude unresolved cases until reviewed. The labels represent a person's reviewed preference: do not turn an enrollment click, commission, or lower employer cost into a label of patient suitability.

## Train and evaluate locally

Python 3.10+; no third-party packages and no network access:

```sh
python3 train.py /path/to/verified-plan-preferences.jsonl --out /path/to/local/research-artifacts
```

The utility validates each row, refuses synthetic/unverified records, assigns complete households to a seeded 80/20 split, fits feature scaling on training rows only, and trains pairwise logistic ranking with L2 regularization. It writes `research-model.json` and `evaluation.json` with a dataset digest and the actual run's results. It never changes `model-status.json` or activates itself in the app.

Held-out metrics are top-ranked preference agreement and pairwise preference agreement. Ties receive fractional credit. Report sample counts beside any metric. Before product use, use an untouched later-period holdout, review subgroup errors and accessibility, compare against the existing transparent baseline, validate source freshness and plan eligibility, audit cost estimates against actual outcomes, and test with patients and benefits specialists. A learned preference score must never bypass eligibility or network constraints.

## What remains

Real plan ingestion, policy-version handling, source verification, permissioned real labels, temporal validation, calibration if probabilities are ever needed, and prospective outcome evaluation are not claimed as complete. No real-world numerical performance is claimed. The fixture notes and sample plans are accepted only by the separately labelled synthetic demonstration path and are intentionally refused by the verified-data training pipeline.
