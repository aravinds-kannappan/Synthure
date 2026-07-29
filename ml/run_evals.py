"""One command that owns the whole eval story.

  python3 ml/run_evals.py            build the canonical evals.json from whatever
                                     eval artifacts are committed, then check it
  python3 ml/run_evals.py --run      also run the Python suite first (needs the
                                     ML deps and the trained artifacts present)
  python3 ml/run_evals.py --check    only load the committed evals.json and run
                                     the provenance and regression gates (CI)

What it guarantees:

  * frontend/data/evals.json is the single source of truth the UI reads.
  * ml/artifacts/results.json and frontend/data/model_evals.json are folded in,
    never read directly by the product again.
  * every headline number has a backing record or is openly marked deferred
    (provenance gate), and no measured metric has regressed past its committed
    floor (threshold gate). Either failure exits non zero, so CI can gate on it.
  * a flat summary row is appended to ml/artifacts/eval_history.jsonl so metric
    drift over time is visible.

Standard library only unless --run is passed.
"""

import argparse
import json
import sys
from pathlib import Path

import eval_schema as S

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "data"
OUT = ROOT / "ml" / "artifacts"

RESULTS = OUT / "results.json"          # tabular + OpenMed suite
MODEL_EVALS = DATA / "model_evals.json"  # neural coder + data engine
CANONICAL = DATA / "evals.json"          # the one file the UI reads
HISTORY = OUT / "eval_history.jsonl"


def _read(path):
    if path.exists():
        return json.loads(path.read_text())
    return None


def run_python_suite():
    """Invoke ml/evaluate.py to regenerate results.json. Requires numpy, sklearn
    and the trained model artifacts. Returns True on success.
    """
    try:
        import numpy  # noqa: F401
        import sklearn  # noqa: F401
    except ImportError as e:
        print(f"[run_evals] skipping --run: {e}. "
              f"Install ml deps and build the artifacts, or use the committed results.json.")
        return False
    try:
        import evaluate  # noqa: F401
        evaluate.main()
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[run_evals] evaluate.py failed: {e}")
        return False


def build():
    results = _read(RESULTS)
    model_evals = _read(MODEL_EVALS)
    if results is None and model_evals is None:
        print("[run_evals] no eval inputs found; nothing to build.")
        return None
    doc = S.build_canonical(results, model_evals)
    CANONICAL.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"[run_evals] wrote {CANONICAL.relative_to(ROOT)} "
          f"({len(doc['groups'])} groups, {sum(len(g['metrics']) for g in doc['groups'])} metrics)")
    return doc


def append_history(doc):
    row = S.summary_row(doc)
    with HISTORY.open("a") as f:
        f.write(json.dumps(row) + "\n")
    print(f"[run_evals] appended history row to {HISTORY.relative_to(ROOT)}")


def check(doc):
    prov = S.provenance_check(doc)
    thr = S.threshold_check(doc)
    for f in prov:
        print(f"  PROVENANCE  {f}")
    for f in thr:
        print(f"  REGRESSION  {f}")
    if prov or thr:
        print(f"[run_evals] FAIL: {len(prov)} provenance, {len(thr)} regression failures")
        return False
    measured = sum(1 for g in doc["groups"] for m in g["metrics"] if m["kind"] == "measured")
    deferred = sum(1 for g in doc["groups"] for m in g["metrics"] if m["kind"] == "deferred")
    print(f"[run_evals] PASS: {measured} measured, {deferred} deferred, gates green")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true", help="run the Python suite first (needs ML deps)")
    ap.add_argument("--check", action="store_true", help="only gate the committed evals.json")
    args = ap.parse_args()

    if args.check:
        committed = _read(CANONICAL)
        if committed is None:
            print(f"[run_evals] {CANONICAL} missing; run `python3 ml/run_evals.py` first.")
            sys.exit(1)
        # The canonical file must be a deterministic function of the committed
        # eval sources. If it drifts, someone hand edited it or forgot to rebuild.
        fresh = S.build_canonical(_read(RESULTS), _read(MODEL_EVALS))
        if json.dumps(committed, sort_keys=True) != json.dumps(fresh, sort_keys=True):
            print("  SYNC        frontend/data/evals.json is stale; run `python3 ml/run_evals.py` and commit.")
            print("[run_evals] FAIL: canonical file out of sync with eval sources")
            sys.exit(1)
        sys.exit(0 if check(committed) else 1)

    if args.run:
        run_python_suite()

    doc = build()
    if doc is None:
        sys.exit(1)
    append_history(doc)
    ok = check(doc)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
