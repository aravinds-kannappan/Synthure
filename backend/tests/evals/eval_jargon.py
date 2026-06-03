"""
Nightly eval harness — jargon decoder.
Scores Claude output against gold-standard examples.
Run via Supabase pg_cron or manually.
"""
import json
from pathlib import Path

GOLD_PATH = Path(__file__).parent / "datasets" / "jargon_gold.json"


def run_eval(client=None) -> dict:
    if not GOLD_PATH.exists():
        return {"skipped": True, "reason": "gold dataset not found"}

    with open(GOLD_PATH) as f:
        gold = json.load(f)

    correct = 0
    for example in gold:
        notes = example["notes"]
        expected_codes = set(example.get("expected_icd10_codes", []))
        if client:
            from backend.agents import orchestrator
            result = orchestrator.run_jargon_pipeline(notes, client)
            found_codes = {c.get("source_doc_id", "").replace("icd10_", "") for c in result.data.get("conditions", [])}
            if expected_codes & found_codes:  # at least one expected code found
                correct += 1

    total = len(gold)
    accuracy = correct / total if total else 0
    return {"total": total, "correct": correct, "accuracy": round(accuracy, 3)}


if __name__ == "__main__":
    print(json.dumps(run_eval(), indent=2))
