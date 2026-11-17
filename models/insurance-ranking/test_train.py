"""Utility tests use generated fixtures only; they export no model or metrics."""
import importlib.util
import json
import random
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("plan_rank_training", Path(__file__).with_name("train.py"))
training = importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)


def fixture_rows():
    rows = []
    for group in range(10):
        for visit in range(2):
            for plan in range(2):
                rows.append({
                    "case_id": f"fixture-{group}-{visit}", "group_id": f"group-{group}",
                    "plan_id": f"plan-{plan}", "plan_year": 2026,
                    "eligibility_verified": True, "availability_verified": True,
                    "synthetic": True, "training_permission": "verified",
                    "source_refs": ["test-fixture-only"], "reviewer_ref": "test-fixture-only",
                    "preference_grade": plan,
                    "features": {"annual_premium": 1000 + group * 100 + plan * 200,
                                 "estimated_annual_oop": 800 - plan * 200,
                                 "annual_oop_limit": 6000 - plan * 1000,
                                 "preferred_provider_coverage": plan,
                                 "required_medication_coverage": 1.0},
                })
    return rows


class TrainingUtilityTests(unittest.TestCase):
    def test_fictional_rows_are_refused_at_ingestion(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixtures.jsonl"
            path.write_text("\n".join(json.dumps(r) for r in fixture_rows()))
            with self.assertRaisesRegex(ValueError, "fictional fixtures are refused"):
                training.load_rows(path)

    def test_unverified_eligibility_is_refused(self):
        row = fixture_rows()[0]
        row["eligibility_verified"] = False
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.jsonl"
            path.write_text(json.dumps(row))
            with self.assertRaisesRegex(ValueError, "unverified eligibility"):
                training.load_rows(path)

    def test_normalization_excludes_entire_heldout_households(self):
        # Exercise the numerical function directly without passing the real-data
        # ingestion gate, exporting a checkpoint, or claiming test-fixture results.
        rows = fixture_rows()
        groups = sorted({r["group_id"] for r in rows})
        random.Random(42).shuffle(groups)
        heldout = set(groups[:2])
        for r in rows:
            if r["group_id"] in heldout:
                r["features"]["annual_premium"] = 1_000_000
        model = training.train(rows, seed=42, epochs=2)
        expected = sum(r["features"]["annual_premium"] for r in rows if r["group_id"] not in heldout) / sum(r["group_id"] not in heldout for r in rows)
        self.assertAlmostEqual(model["training_means"][0], expected)
        self.assertEqual(model["metrics"]["heldout_groups"], 2)
        self.assertEqual(model["metrics"]["heldout_cases"], 4)
        self.assertFalse(model["production_ready"])

    def test_tied_scores_do_not_use_input_order_as_evidence(self):
        rows = fixture_rows()
        for r in rows:
            r["features"] = dict.fromkeys(training.FEATURES, 1.)
        model = training.train(rows, epochs=2)
        self.assertEqual(model["metrics"]["heldout_preference_top1_accuracy"], .5)
        self.assertEqual(model["metrics"]["heldout_pairwise_preference_accuracy"], .5)


if __name__ == "__main__":
    unittest.main()
