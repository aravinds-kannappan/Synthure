"""Synthure model service (FastAPI, CPU).

Serves the two trained models behind plain HTTP so the Vercel Next.js app can
call them:

  POST /code          diagnosis mentions -> ranked ICD-10-CM codes
  POST /faithfulness   note + extraction + report -> flagged unsupported sentences
  GET  /               health + which models loaded

Self-contained on purpose: the inference is reproduced here exactly as in
ml/icd_coder/predict.py and ml/faithfulness/score.py (same pooling, tokenizer
lengths, and sigmoid/softmax), so there is no cross-import of the training code
and no name collision between the two subsystems.

Weights are expected next to this file (uploaded from Colab):
  ./icd_coder_out/{retriever,reranker,code_index.npz}
  ./faithfulness_out/{checker,threshold.json}
  ./data/icd10cm.json.gz   (FY2026 tabular for descriptions + billable flags)
Each half loads only if its weights are present, so the coder can ship before
the faithfulness checker is trained.
"""

from __future__ import annotations

import gzip
import json
import os
import re
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import AutoModel, AutoModelForSequenceClassification, AutoTokenizer

HERE = Path(__file__).resolve().parent
ICD_DIR = Path(os.environ.get("ICD_DIR", HERE / "icd_coder_out"))
FAITH_DIR = Path(os.environ.get("FAITH_DIR", HERE / "faithfulness_out"))
ICD_TABULAR = Path(os.environ.get("ICD_TABULAR", HERE / "data" / "icd10cm.json.gz"))

# inference constants (must match training/config in ml/)
MAX_PHRASE_LEN = 32
CANDIDATES_PER_QUERY = 50
MAX_PAIR_LEN = 192
FAITH_MAX_LEN = 320

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_SENT = re.compile(r"(?<=[.!?])\s+")


def _mean_pool(last_hidden, mask):
    m = mask.unsqueeze(-1).float()
    return (last_hidden * m).sum(1) / m.sum(1).clamp(min=1e-9)


class Coder:
    """bi-encoder retrieval + cross-encoder rerank over the FY2026 ICD-10-CM index."""

    def __init__(self):
        idx = np.load(ICD_DIR / "code_index.npz", allow_pickle=True)
        self.codes = list(idx["codes"])
        # weights + index ship as fp16 to fit the free 1 GB Space; upcast to fp32
        # so CPU inference is exact (fp16 matmul is slow/unsupported on CPU).
        self.emb = torch.tensor(np.asarray(idx["emb"], dtype=np.float32), device=DEVICE)
        self.enc = AutoModel.from_pretrained(ICD_DIR / "retriever", torch_dtype=torch.float32).to(DEVICE).eval()
        self.enc_tok = AutoTokenizer.from_pretrained(ICD_DIR / "retriever")
        self.ce = AutoModelForSequenceClassification.from_pretrained(ICD_DIR / "reranker", torch_dtype=torch.float32).to(DEVICE).eval()
        self.ce_tok = AutoTokenizer.from_pretrained(ICD_DIR / "reranker")
        with gzip.open(ICD_TABULAR, "rt") as f:
            tab = json.load(f)
        self.code2desc = {c: v[1] for c, v in tab.items()}
        self.billable = {c for c, v in tab.items() if v[0] == 1}

        def dotted(c):
            return c if "." in c or len(c) <= 3 else c[:3] + "." + c[3:]

        self.dotted = dotted

    @torch.no_grad()
    def code_mentions(self, mentions, top=8):
        mentions = [m.strip() for m in mentions if m and m.strip()]
        if not mentions:
            return []
        enc = self.enc_tok(mentions, padding=True, truncation=True, max_length=MAX_PHRASE_LEN, return_tensors="pt").to(DEVICE)
        out = self.enc(input_ids=enc["input_ids"], attention_mask=enc["attention_mask"])
        q = torch.nn.functional.normalize(_mean_pool(out.last_hidden_state, enc["attention_mask"]), dim=-1)
        sims = q @ self.emb.t()
        top_idx = sims.topk(min(CANDIDATES_PER_QUERY, sims.size(1)), dim=1).indices.cpu().tolist()
        best_q = {}
        for mi, row in enumerate(top_idx):
            for j in row:
                best_q.setdefault(self.codes[j], mentions[mi])
        cand = list(best_q.keys())
        scores = []
        for i in range(0, len(cand), 128):
            chunk = cand[i:i + 128]
            qs = [best_q[c] for c in chunk]
            desc = [self.code2desc.get(c, c) for c in chunk]
            enc2 = self.ce_tok(qs, desc, padding=True, truncation=True, max_length=MAX_PAIR_LEN, return_tensors="pt").to(DEVICE)
            logits = self.ce(input_ids=enc2["input_ids"], attention_mask=enc2["attention_mask"]).logits.squeeze(-1)
            scores.extend(torch.sigmoid(logits).float().cpu().tolist())
        order = np.argsort(scores)[::-1][:top]
        return [{
            "code": self.dotted(cand[i]),
            "code_raw": cand[i],
            "description": self.code2desc.get(cand[i], ""),
            "billable": cand[i] in self.billable,
            "score": round(float(scores[i]), 4),
            "mention": best_q[cand[i]],
        } for i in order]


class Checker:
    """cross-encoder faithfulness: P(claim supported by evidence)."""

    def __init__(self):
        self.model = AutoModelForSequenceClassification.from_pretrained(FAITH_DIR / "checker", torch_dtype=torch.float32).to(DEVICE).eval()
        self.tok = AutoTokenizer.from_pretrained(FAITH_DIR / "checker")
        thr = FAITH_DIR / "threshold.json"
        self.threshold = json.loads(thr.read_text())["flag_threshold"] if thr.exists() else 0.5

    @staticmethod
    def build_evidence(note, extraction):
        ev = (note or "").strip()
        if not extraction:
            return ev
        ents = extraction.get("entities") or []
        dx = [e["text"] for e in ents if str(e.get("type", "")).upper() == "DIAGNOSIS"]
        meds = [e["text"] for e in ents if str(e.get("type", "")).upper() == "MEDICATION"]
        icd = [f"{c.get('code')} {c.get('label', '')}".strip() for c in (extraction.get("icd10") or [])]
        parts = []
        if dx:
            parts.append("diagnoses [" + ", ".join(dx) + "]")
        if meds:
            parts.append("medications [" + ", ".join(meds) + "]")
        if icd:
            parts.append("ICD-10 [" + "; ".join(icd) + "]")
        return ev + ("\nStructured extraction: " + "; ".join(parts) + "." if parts else "")

    @staticmethod
    def claims(report):
        out = []

        def add(field, text):
            if not text:
                return
            for s in _SENT.split(str(text)):
                s = s.strip()
                if len(s) > 3:
                    out.append((field, s))

        add("headline", report.get("headline"))
        add("summary", report.get("summary"))
        for sec in report.get("sections", []) or []:
            add(f"section:{sec.get('heading', '')}", sec.get("body"))
            for b in sec.get("bullets", []) or []:
                add(f"section:{sec.get('heading', '')}", b)
        for a in report.get("actions", []) or []:
            add("action", a)
        return out

    @torch.no_grad()
    def score(self, note, extraction, report):
        evidence = self.build_evidence(note, extraction)
        claims = self.claims(report)
        if not claims:
            return {"threshold": self.threshold, "sentences": [], "flagged": []}
        texts = [c for _, c in claims]
        p = []
        for i in range(0, len(texts), 64):
            enc = self.tok([evidence] * len(texts[i:i + 64]), texts[i:i + 64], padding=True,
                           truncation="only_first", max_length=FAITH_MAX_LEN, return_tensors="pt").to(DEVICE)
            logits = self.model(**enc).logits
            p.extend(torch.softmax(logits, dim=-1)[:, 1].float().cpu().tolist())
        sents = [{
            "field": f, "sentence": t, "p_supported": round(float(p[i]), 4),
            "flag": bool(p[i] < self.threshold),
        } for i, (f, t) in enumerate(claims)]
        return {"threshold": self.threshold, "sentences": sents, "flagged": [s for s in sents if s["flag"]]}


app = FastAPI(title="Synthure model service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_coder = None
_checker = None


@app.on_event("startup")
def _load():
    global _coder, _checker
    if (ICD_DIR / "code_index.npz").exists():
        print("loading ICD coder ...")
        _coder = Coder()
        print(f"  coder ready: {len(_coder.codes)} codes on {DEVICE}")
    if (FAITH_DIR / "checker").exists():
        print("loading faithfulness checker ...")
        _checker = Checker()
        print(f"  checker ready: threshold {_checker.threshold} on {DEVICE}")


class CodeReq(BaseModel):
    mentions: list[str] | None = None
    note: str | None = None
    top: int = 8


class FaithReq(BaseModel):
    note: str
    extraction: dict | None = None
    report: dict


@app.get("/")
def health():
    return {"status": "ok", "device": DEVICE, "coder": _coder is not None, "faithfulness": _checker is not None}


@app.post("/code")
def code(req: CodeReq):
    if _coder is None:
        return {"error": "coder weights not loaded", "codes": []}
    mentions = req.mentions if req.mentions else _coder_note_split(req.note or "")
    return {"codes": _coder.code_mentions(mentions, req.top)}


def _coder_note_split(note):
    return [s.strip() for s in re.split(r"(?<=[.\n;])\s+", note) if len(s.strip()) > 2] or ([note] if note else [])


@app.post("/faithfulness")
def faithfulness(req: FaithReq):
    if _checker is None:
        return {"error": "faithfulness weights not loaded", "flagged": [], "sentences": []}
    return _checker.score(req.note, req.extraction, req.report)
