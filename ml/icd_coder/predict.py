"""Inference: code a note (or a list of extracted mentions) to ICD-10-CM.

This mirrors how Synthure would call the trained coder in the pipeline: the note
is already de-identified and its clinical mentions are known, so the natural
entry point is code_mentions(). code_note() is the convenience path that splits a
free-text note into sentences first.

  python predict.py --note "pt w/ htn and type 2 dm, foot ulcer" --top 8
  echo "chest pain, troponin elevated" | python predict.py --top 5

Every returned code carries its official FY2026 description and billable flag, so
nothing opaque leaves the model.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModel, AutoModelForSequenceClassification, AutoTokenizer

from config import Config, repo_path
from model import BiEncoder, CrossEncoder

_SENT = re.compile(r"(?<=[.\n;])\s+")


class Coder:
    def __init__(self, config: Config):
        self.config = config
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        out = Path(config.out_dir)

        idx = np.load(out / "code_index.npz", allow_pickle=True)
        self.codes = list(idx["codes"])
        self.emb = torch.tensor(idx["emb"], device=self.device)

        self.bi = BiEncoder.__new__(BiEncoder)
        torch.nn.Module.__init__(self.bi)
        self.bi.encoder = AutoModel.from_pretrained(out / "retriever").to(self.device).eval()
        self.bi.tok = AutoTokenizer.from_pretrained(out / "retriever")

        self.ce = CrossEncoder.__new__(CrossEncoder)
        torch.nn.Module.__init__(self.ce)
        self.ce.model = AutoModelForSequenceClassification.from_pretrained(out / "reranker").to(self.device).eval()
        self.ce.tok = AutoTokenizer.from_pretrained(out / "reranker")

        with gzip.open(repo_path(config.icd_tabular_gz), "rt") as f:
            tab = json.load(f)
        self.code2desc = {c: v[1] for c, v in tab.items()}
        self.billable = {c for c, v in tab.items() if v[0] == 1}

    @torch.no_grad()
    def _retrieve(self, mentions: list[str], k: int) -> dict[str, str]:
        enc = self.bi.tokenize(mentions, self.config.max_phrase_len, self.device)
        q = self.bi.encode(enc["input_ids"], enc["attention_mask"])
        sims = q @ self.emb.t()
        top = sims.topk(min(k, sims.size(1)), dim=1).indices.cpu().tolist()
        best_q: dict[str, str] = {}
        for mi, row in enumerate(top):
            for j in row:
                best_q.setdefault(self.codes[j], mentions[mi])
        return best_q

    @torch.no_grad()
    def code_mentions(self, mentions: list[str], top: int = 8) -> list[dict]:
        mentions = [m.strip() for m in mentions if m.strip()]
        if not mentions:
            return []
        best_q = self._retrieve(mentions, self.config.candidates_per_query)
        cand = list(best_q.keys())
        scores: list[float] = []
        for i in range(0, len(cand), 128):
            chunk = cand[i:i + 128]
            q = [best_q[c] for c in chunk]
            desc = [self.code2desc.get(c, c) for c in chunk]
            enc = self.ce.tokenize(q, desc, self.config.max_pair_len, self.device)
            s = torch.sigmoid(self.ce(**enc))
            scores.extend(s.float().cpu().tolist())
        order = np.argsort(scores)[::-1][:top]
        return [{
            "code": cand[i],
            "description": self.code2desc.get(cand[i], ""),
            "billable": cand[i] in self.billable,
            "score": round(float(scores[i]), 4),
            "mention": best_q[cand[i]],
        } for i in order]

    def code_note(self, note: str, top: int = 8) -> list[dict]:
        sents = [s.strip() for s in _SENT.split(note) if len(s.strip()) > 2] or [note]
        return self.code_mentions(sents, top)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--note", default=None)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--config", default=None)
    args = ap.parse_args()
    cfg = Config.load(args.config) if args.config else Config()
    note = args.note or sys.stdin.read()
    coder = Coder(cfg)
    print(json.dumps(coder.code_note(note, args.top), indent=2))
