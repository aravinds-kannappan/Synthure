"""Score a portal report for faithfulness and flag unsupported sentences.

This is the serving path. It takes the de-identified note, the structured
extraction, and one stakeholder report, splits the report into sentence-level
claims, and scores each claim against the evidence. Sentences whose
P(supported) falls below the trained threshold are flagged for human review.

  # from a JSON payload {note, extraction, report}
  python score.py --input case.json

  # quick check of loose claims against a note
  python score.py --note "Patient on lisinopril 10 mg for hypertension." \
      --claim "The patient takes metformin." --claim "The patient has hypertension."
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from config import Config
from model import p_supported
from claims import build_evidence, claims_from_report


class Checker:
    def __init__(self, config: Config):
        self.config = config
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        out = Path(config.out_dir)
        self.model = AutoModelForSequenceClassification.from_pretrained(out / "checker").to(self.device).eval()
        self.tok = AutoTokenizer.from_pretrained(out / "checker")
        thr = json.loads((out / "threshold.json").read_text())["flag_threshold"] \
            if (out / "threshold.json").exists() else config.flag_threshold
        self.threshold = float(thr)

    def score(self, note: str, extraction: dict | None, report: dict) -> dict:
        evidence = build_evidence(note, extraction)
        claims = claims_from_report(report)
        if not claims:
            return {"threshold": self.threshold, "sentences": [], "flagged": []}
        p = p_supported(self.model, self.tok, [evidence] * len(claims),
                        [c for _, c in claims], self.config.max_len, self.device)
        sentences = [{
            "field": field,
            "sentence": text,
            "p_supported": round(float(p[i]), 4),
            "flag": bool(p[i] < self.threshold),
        } for i, (field, text) in enumerate(claims)]
        return {
            "threshold": self.threshold,
            "sentences": sentences,
            "flagged": [s for s in sentences if s["flag"]],
        }

    def score_claims(self, note: str, claims: list[str]) -> list[dict]:
        p = p_supported(self.model, self.tok, [note] * len(claims), claims,
                        self.config.max_len, self.device)
        return [{"claim": c, "p_supported": round(float(p[i]), 4), "flag": bool(p[i] < self.threshold)}
                for i, c in enumerate(claims)]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=None, help="JSON with {note, extraction, report}")
    ap.add_argument("--note", default=None)
    ap.add_argument("--claim", action="append", default=[], help="repeatable")
    ap.add_argument("--config", default=None)
    args = ap.parse_args()
    cfg = Config.load(args.config) if args.config else Config()
    checker = Checker(cfg)

    if args.input:
        payload = json.loads(Path(args.input).read_text())
        print(json.dumps(checker.score(payload["note"], payload.get("extraction"), payload["report"]), indent=2))
    elif args.note and args.claim:
        print(json.dumps(checker.score_claims(args.note, args.claim), indent=2))
    else:
        ap.error("provide --input, or --note with one or more --claim")
