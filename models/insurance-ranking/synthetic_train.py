#!/usr/bin/env python3
"""Reproduce the explicitly SYNTHETIC insurance demo model, offline.

This is separate from train.py's verified-data research path. Labels come from
the authored policy below, not patients, clinicians, insurers, or real outcomes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from pathlib import Path

SEED = 20261116
PRIORITIES = ["balanced", "lowest_premium", "predictable_cost"]
BASE_FEATURES = ["annual_cost_over_10000", "annual_premium_over_4000", "annual_exposure_over_12000", "sample_network_count_over_2", "accessible_sample_network_count_over_2"]
FEATURES = [f"{priority}:{feature}" for priority in PRIORITIES for feature in BASE_FEATURES]
PLANS = [
    {"id": "sample-balanced", "premium": 210, "deductible": 1500, "oop_max": 6500, "coinsurance": .2, "providers": [0, 1]},
    {"id": "sample-lowpremium", "premium": 100, "deductible": 3200, "oop_max": 7000, "coinsurance": .2, "providers": [1]},
    {"id": "sample-predictable", "premium": 285, "deductible": 500, "oop_max": 3500, "coinsurance": .1, "providers": [0]},
]
RATES = {
    "knee-osteoarthritis": {"allowed": [140, 130, 125], "copays": [35, None, 20]},
    "hypertension-followup": {"allowed": [110, 100, 105], "copays": [25, None, 15]},
    "diabetes-followup": {"allowed": [180, 160, 170], "copays": [45, None, 25]},
}
# Higher utility means preferred in this authored simulation. Negative weights
# penalize spending; positive weights favor fictional provider accessibility.
POLICY = {
    "balanced": [-.55, -.10, -.20, .10, .15],
    "lowest_premium": [-.20, -.65, -.05, .05, .05],
    "predictable_cost": [-.10, -.05, -.65, .05, .15],
}


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def candidates(case):
    rates = RATES[case["scenarioId"]]
    results = []
    for index, plan in enumerate(PLANS):
        allowed = rates["allowed"][index] * case["expectedVisits"]
        copay = rates["copays"][index]
        paid = min(plan["deductible"], allowed)
        care = min(plan["oop_max"], paid + max(0, allowed - paid) * plan["coinsurance"] if copay is None else copay * case["expectedVisits"])
        accessible = sum(([3, 8][p] <= case["maxTravelMiles"] and (case["preferredLanguage"] == "English" or p == 0)) for p in plan["providers"])
        base = [(plan["premium"] * 12 + care) / 10000, plan["premium"] * 12 / 4000, (plan["premium"] * 12 + plan["oop_max"]) / 12000, len(plan["providers"]) / 2, accessible / 2]
        vector = [value if p == case["priority"] else 0. for p in PRIORITIES for value in base]
        results.append({"plan_id": plan["id"], "features": vector, "authored_utility": dot(base, POLICY[case["priority"]]), "budget_fit": plan["premium"] <= case["monthlyBudget"]})
    return results


def make_cases(count=1500):
    rng = random.Random(SEED)
    seen = set()
    cases = []
    while len(cases) < count:
        case = {"scenarioId": rng.choice(list(RATES)), "priority": rng.choice(PRIORITIES), "expectedVisits": rng.randrange(37), "monthlyBudget": rng.choice(list(range(0, 601, 25))), "maxTravelMiles": rng.choice([1, 3, 5, 8, 10, 15, 25]), "preferredLanguage": rng.choice(["English", "Spanish"]), "selectedPlanId": None}
        key = json.dumps(case, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        cases.append({"case_id": f"synthetic-{len(cases):04d}", "input": case, "candidates": candidates(case)})
    rng.shuffle(cases)
    return cases


def preference_pairs(cases):
    out = []
    for case in cases:
        choices = case["candidates"]
        for i, a in enumerate(choices):
            for b in choices[i + 1:]:
                if abs(a["authored_utility"] - b["authored_utility"]) < 1e-10:
                    continue
                winner, loser = (a, b) if a["authored_utility"] > b["authored_utility"] else (b, a)
                out.append([x - y for x, y in zip(winner["features"], loser["features"])])
    return out


def rank(choices, weights=None):
    return sorted(choices, key=lambda p: (not p["budget_fit"], -(dot(p["features"], weights) if weights is not None else p["authored_utility"]), p["plan_id"]))


def train(epochs=800):
    cases = make_cases()
    training, heldout = cases[:1200], cases[1200:]
    pairs = preference_pairs(training)
    weights = [0.] * len(FEATURES)
    # Pairwise logistic regression with fixed hyperparameters, no holdout tuning.
    for _ in range(epochs):
        gradient = [0.] * len(weights)
        for difference in pairs:
            margin = max(-35., min(35., dot(weights, difference)))
            error = -1. / (1. + math.exp(margin))
            for i, value in enumerate(difference):
                gradient[i] += error * value
        weights = [w - .4 * (g / len(pairs) + .0001 * w) for w, g in zip(weights, gradient)]
    test_pairs = preference_pairs(heldout)
    pair_correct = sum(1 if dot(weights, diff) > 1e-10 else .5 if abs(dot(weights, diff)) <= 1e-10 else 0 for diff in test_pairs)
    top_correct = sum(rank(case["candidates"], weights)[0]["plan_id"] == rank(case["candidates"])[0]["plan_id"] for case in heldout)
    evaluation = {
        "heldoutCases": len(heldout), "heldoutRows": len(heldout) * 3, "heldoutPairs": len(test_pairs),
        "top1PolicyAgreement": top_correct / len(heldout),
        "pairwisePolicyAgreement": pair_correct / len(test_pairs),
        "top1Definition": "Learned ranker plus the same deterministic budget-first rule, compared with the authored synthetic policy; distinct heldout input combinations.",
        "pairwiseDefinition": "Learned pair ordering versus authored synthetic utility, excluding utility ties; no budget constraint in this metric.",
        "interpretation": "Synthetic-policy fidelity only. Not real insurance accuracy, clinical validity, eligibility verification, savings, or suitability evidence.",
    }
    model = {
        "schemaVersion": 1, "modelType": "pairwise_linear_ranker", "status": "trained_synthetic_only", "productionReady": False,
        "seed": SEED, "features": FEATURES, "weights": weights,
        "training": {"cases": len(training), "rows": len(training) * 3, "pairs": len(pairs), "epochs": epochs, "split": "1200 training / 300 heldout distinct synthetic input configurations; all three plans for a case stay in one split", "learningRate": .4, "l2": .0001},
        "evaluation": evaluation, "authoredPolicy": POLICY,
        "costAndNetworkEngine": "Deterministic authored fictional rates and exact sample-plan directory mappings; never predicted by the model.",
        "limitations": ["All labels were generated from an authored preference policy.", "No real patient, insurance carrier, plan offer, clinical outcome or provider contract was used.", "The synthetic split shares the same policy and plan catalog; it does not test real-world generalization.", "Budget feasibility is enforced separately; a rank is not an eligibility or enrollment decision.", "Controls outside the supported finite demo ranges are clamped."],
        "verificationCases": [{"input": case["input"], "modelTopPlanId": rank(case["candidates"], weights)[0]["plan_id"]} for case in heldout[:12]],
    }
    rows = []
    train_ids = {case["case_id"] for case in training}
    for case in cases:
        for candidate in case["candidates"]:
            rows.append({"case_id": case["case_id"], "synthetic": True, "split": "train" if case["case_id"] in train_ids else "holdout", "input": case["input"], **candidate})
    text = "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in rows)
    model["datasetSha256"] = hashlib.sha256(text.encode()).hexdigest()
    return model, text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=800)
    args = parser.parse_args()
    if not 1 <= args.epochs <= 10000:
        parser.error("epochs must be 1..10000")
    model, dataset = train(args.epochs)
    root = Path(__file__).resolve().parents[2]
    out = Path(__file__).resolve().parent / "synthetic-artifacts"
    out.mkdir(exist_ok=True)
    (out / "dataset.jsonl").write_text(dataset)
    (out / "evaluation.json").write_text(json.dumps(model["evaluation"], indent=2) + "\n")
    (out / "model.json").write_text(json.dumps(model, indent=2) + "\n")
    (root / "frontend/lib/insurance-demo-model.json").write_text(json.dumps(model, indent=2) + "\n")
    print(json.dumps({"status": model["status"], "training": model["training"], "evaluation": model["evaluation"], "datasetSha256": model["datasetSha256"]}, indent=2))


if __name__ == "__main__":
    main()
