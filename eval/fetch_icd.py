#!/usr/bin/env python3
"""Fetch a real sample from Inje/SYMPTOMS-COT-ICD10-2024 (symptoms + description
-> gold ICD 10 code) for the trained classifier benchmark. stdlib + curl only.

Run:  python3 eval/fetch_icd.py [N]
"""
import json, os, sys, urllib.parse, time, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "icd10_train.json")
DATASET = "Inje/SYMPTOMS-COT-ICD10-2024"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
PAGE = 100


def fetch_page(offset):
    q = urllib.parse.urlencode({"dataset": DATASET, "config": "default",
                                "split": "train", "offset": offset, "length": PAGE})
    url = f"https://datasets-server.huggingface.co/rows?{q}"
    for attempt in range(4):
        try:
            raw = subprocess.run(["curl", "-sS", "-m", "25", url],
                                 capture_output=True, text=True, check=True).stdout
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
        for item in rows:
            r = item["row"]
            code = (r.get("answer") or "").strip()
            sym = (r.get("symptoms") or "").strip()
            desc = (r.get("question") or "").strip()
            if code and (sym or desc):
                out.append({"code": code, "symptoms": sym, "description": desc})
        if offset % 1000 == 0:
            print(f"  fetched {len(out)} rows (offset {offset})", flush=True)
    json.dump(out, open(OUT, "w"))
    codes = {r["code"] for r in out}
    cats = {r["code"].replace(".", "")[:3].upper() for r in out}
    print(f"wrote {len(out)} rows -> {OUT}")
    print(f"distinct exact codes: {len(codes)}  distinct categories: {len(cats)}")


if __name__ == "__main__":
    main()
