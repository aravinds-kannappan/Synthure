#!/usr/bin/env python3
"""Fetch a real labeled sample from DataFog/medical-transcription-instruct.

Pulls (transcription, complexity_score, medical_specialty) rows through the
public HuggingFace datasets server and commits them as a sample so the trainer
runs offline and reproducibly. stdlib only (no datasets library required).

Run:  python3 eval/fetch_complexity.py [N]
"""
import json, os, sys, urllib.parse, time, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "complexity_sample.json")
DATASET = "DataFog/medical-transcription-instruct"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
PAGE = 100


def fetch_page(offset):
    # macOS framework Python often lacks CA roots; curl has them, so shell out.
    q = urllib.parse.urlencode(
        {"dataset": DATASET, "config": "default", "split": "train",
         "offset": offset, "length": PAGE}
    )
    url = f"https://datasets-server.huggingface.co/rows?{q}"
    for attempt in range(4):
        try:
            raw = subprocess.run(
                ["curl", "-sS", "-m", "25", url],
                capture_output=True, text=True, check=True,
            ).stdout
            return json.loads(raw).get("rows", [])
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))


def main():
    out = []
    for offset in range(0, N, PAGE):
        try:
            rows = fetch_page(offset)
        except Exception as exc:
            print(f"  skip offset {offset}: {exc}", flush=True)
            continue
        if not rows:
            continue
        for item in rows:
            row = item["row"]
            t = (row.get("transcription") or "").strip()
            c = row.get("complexity_score")
            if not t or c is None:
                continue
            out.append({
                "transcription": t[:1200],
                "complexity_score": float(c),
                "specialty": (row.get("medical_specialty") or "").strip(),
            })
        if offset % 1000 == 0:
            print(f"  fetched {len(out)} rows (offset {offset})", flush=True)
    with open(OUT, "w") as f:
        json.dump(out, f)
    scores = [r["complexity_score"] for r in out]
    hi = sum(1 for s in scores if s >= 0.5)
    print(f"wrote {len(out)} rows -> {OUT}")
    print(f"complexity>=0.5: {hi} ({100*hi/len(out):.1f}%)  mean={sum(scores)/len(scores):.3f}")


if __name__ == "__main__":
    main()
