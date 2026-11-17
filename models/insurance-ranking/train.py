#!/usr/bin/env python3
"""Offline pairwise preference ranker. Python standard library only.

Learns from verified human preference grades; does not predict clinical outcomes,
eligibility, claim approval, or savings. No network access or sample metrics.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

FEATURES = ["annual_premium", "estimated_annual_oop", "annual_oop_limit", "preferred_provider_coverage", "required_medication_coverage"]
REQUIRED = {"case_id", "group_id", "plan_id", "plan_year", "eligibility_verified", "availability_verified", "synthetic", "training_permission", "source_refs", "reviewer_ref", "preference_grade", "features"}


def load_rows(path):
    rows = []
    seen = set()
    case_groups = {}
    for line_number, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        prefix = f"Line {line_number}: "
        if not isinstance(row, dict) or set(row) != REQUIRED:
            raise ValueError(prefix + "fields must match schema.json exactly")
        for key in ("case_id", "group_id", "plan_id", "reviewer_ref"):
            if not isinstance(row[key], str) or not row[key].strip():
                raise ValueError(prefix + f"{key} must be a nonempty string")
        if type(row["plan_year"]) is not int or not 2020 <= row["plan_year"] <= 2100:
            raise ValueError(prefix + "invalid plan_year")
        if row["eligibility_verified"] is not True or row["availability_verified"] is not True:
            raise ValueError(prefix + "unverified eligibility/availability cannot be training candidates")
        if row["synthetic"] is not False or row["training_permission"] != "verified":
            raise ValueError(prefix + "requires real, permitted training records; fictional fixtures are refused")
        if not isinstance(row["source_refs"], list) or not row["source_refs"] or any(not isinstance(v, str) or not v.strip() for v in row["source_refs"]):
            raise ValueError(prefix + "source_refs must contain evidence references")
        if type(row["preference_grade"]) is not int or not 0 <= row["preference_grade"] <= 3:
            raise ValueError(prefix + "preference_grade must be an integer 0..3")
        if not isinstance(row["features"], dict) or set(row["features"]) != set(FEATURES):
            raise ValueError(prefix + "features must exactly match schema.json")
        for name, value in row["features"].items():
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < 0:
                raise ValueError(prefix + f"{name} must be a finite nonnegative number")
            if name.endswith("coverage") and value > 1:
                raise ValueError(prefix + f"{name} must be a fraction from 0 to 1")
        key = (row["case_id"], row["plan_id"])
        if key in seen:
            raise ValueError(prefix + "duplicate case/plan")
        seen.add(key)
        if row["case_id"] in case_groups and case_groups[row["case_id"]] != row["group_id"]:
            raise ValueError(prefix + "a case cannot span multiple household groups")
        case_groups[row["case_id"]] = row["group_id"]
        rows.append(row)
    cases = defaultdict(list)
    for row in rows:
        cases[row["case_id"]].append(row)
    for case, candidates in cases.items():
        if len(candidates) < 2 or len({r["preference_grade"] for r in candidates}) < 2:
            raise ValueError(f"Case {case}: requires >=2 candidates with differing reviewed preference grades")
        if len({r["plan_year"] for r in candidates}) != 1:
            raise ValueError(f"Case {case}: candidate plans must refer to the same year")
    if len(set(case_groups.values())) < 10:
        raise ValueError("At least 10 distinct household groups are required for a minimally useful held-out split; no model was trained")
    return rows


def score(weights, vector):
    return sum(a * b for a, b in zip(weights, vector))


def pairs(rows, vector):
    by_case = defaultdict(list)
    for row in rows:
        by_case[row["case_id"]].append(row)
    out = []
    for candidates in by_case.values():
        for i, a in enumerate(candidates):
            for b in candidates[i + 1:]:
                if a["preference_grade"] == b["preference_grade"]:
                    continue
                preferred, other = (a, b) if a["preference_grade"] > b["preference_grade"] else (b, a)
                out.append([x - y for x, y in zip(vector(preferred), vector(other))])
    return out


def train(rows, seed=42, epochs=500):
    rng = random.Random(seed)
    groups = sorted({r["group_id"] for r in rows})
    rng.shuffle(groups)
    test_groups = set(groups[:max(2, round(len(groups) * .2))])
    train_rows = [r for r in rows if r["group_id"] not in test_groups]
    test_rows = [r for r in rows if r["group_id"] in test_groups]
    means = [sum(r["features"][f] for r in train_rows) / len(train_rows) for f in FEATURES]
    scales = [max(1e-9, math.sqrt(sum((r["features"][f] - means[i]) ** 2 for r in train_rows) / len(train_rows))) for i, f in enumerate(FEATURES)]
    vector = lambda row: [(row["features"][f] - means[i]) / scales[i] for i, f in enumerate(FEATURES)]
    train_pairs = pairs(train_rows, vector)
    weights = [0.] * len(FEATURES)
    for _ in range(epochs):
        gradient = [0.] * len(weights)
        for difference in train_pairs:
            margin = max(-35., min(35., score(weights, difference)))
            error = -1. / (1. + math.exp(margin))
            for i, value in enumerate(difference):
                gradient[i] += error * value
        weights = [w - .05 * (g / len(train_pairs) + .01 * w) for w, g in zip(weights, gradient)]
    by_case = defaultdict(list)
    for row in test_rows:
        by_case[row["case_id"]].append(row)
    # A score tie shares the available credit instead of taking row order as truth.
    case_hits = []
    for candidates in by_case.values():
        values = [score(weights, vector(r)) for r in candidates]
        best = max(values)
        tied = [r for r, v in zip(candidates, values) if abs(v - best) < 1e-10]
        target = max(r["preference_grade"] for r in candidates)
        case_hits.append(sum(r["preference_grade"] == target for r in tied) / len(tied))
    test_pairs = pairs(test_rows, vector)
    margins = [score(weights, p) for p in test_pairs]
    metrics = {
        "heldout_preference_top1_accuracy": sum(case_hits) / len(case_hits),
        "heldout_pairwise_preference_accuracy": sum(1 if m > 1e-10 else .5 if abs(m) <= 1e-10 else 0 for m in margins) / len(margins),
        "heldout_cases": len(by_case), "heldout_pairs": len(test_pairs),
        "training_cases": len({r["case_id"] for r in train_rows}),
        "training_groups": len(groups) - len(test_groups), "heldout_groups": len(test_groups),
        "interpretation": "Agreement with held-out human preference labels; not evidence of coverage, savings, clinical benefit, or universal plan suitability.",
    }
    model = {"status": "trained_research_only", "production_ready": False, "features": FEATURES, "weights": weights, "training_means": means, "training_scales": scales, "seed": seed, "epochs": epochs, "regularization": .01, "split": "household-group-disjoint 80/20; scaling fit on training only", "metrics": metrics}
    return model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path, help="Verified JSONL rows matching schema.json")
    parser.add_argument("--out", type=Path, required=True, help="Local output directory")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=int, default=500)
    args = parser.parse_args()
    if args.epochs < 1 or args.epochs > 10000:
        parser.error("epochs must be 1..10000")
    try:
        rows = load_rows(args.dataset)
        model = train(rows, seed=args.seed, epochs=args.epochs)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(1, f"Training refused: {exc}\n")
    model["dataset_sha256"] = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    model["trained_at"] = datetime.now(timezone.utc).isoformat()
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "research-model.json").write_text(json.dumps(model, indent=2) + "\n")
    (args.out / "evaluation.json").write_text(json.dumps(model["metrics"], indent=2) + "\n")
    print(json.dumps({"status": model["status"], "rows": len(rows), "output": str(args.out), "metrics": model["metrics"]}, indent=2))


if __name__ == "__main__":
    main()
