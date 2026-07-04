"""Stage 2: fine-tune the cross-encoder reranker on CodiEsp, then evaluate.

The retriever proposes candidate ICD-10-CM codes; the reranker scores each
(clinical mention, candidate description) pair. Training uses CodiEsp evidence
spans as positives with retriever-mined hard negatives. Evaluation is document
level MAP (the official CodiEsp-D metric) plus precision at k.

  python train_reranker.py                 # needs a trained retriever in out_dir
  python train_reranker.py --smoke         # synthetic data + tiny backbone, CPU ok
"""

from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup

from config import Config
from data import codiesp_docs, synthetic_codiesp, synthetic_pairs, mine_pairs
from model import BiEncoder, CrossEncoder

_SENT = re.compile(r"(?<=[.\n])\s+")


def sentences(text: str, max_sents: int = 60) -> list[str]:
    out = [s.strip() for s in _SENT.split(text) if len(s.strip()) > 3]
    return out[:max_sents]


# ── retriever wrapper for candidate generation ─────────────────────────────────
class Retriever:
    def __init__(self, out_dir: Path, config: Config, device: str):
        idx = np.load(out_dir / "code_index.npz", allow_pickle=True)
        self.codes = list(idx["codes"])
        self.emb = torch.tensor(idx["emb"], device=device)                # (C, d)
        self.model = BiEncoder.__new__(BiEncoder)
        torch.nn.Module.__init__(self.model)
        self.model.encoder = AutoModel.from_pretrained(out_dir / "retriever").to(device).eval()
        self.model.tok = AutoTokenizer.from_pretrained(out_dir / "retriever")
        self.config = config
        self.device = device

    @torch.no_grad()
    def topk(self, queries: list[str], k: int) -> list[list[int]]:
        enc = self.model.tokenize(queries, self.config.max_phrase_len, self.device)
        q = self.model.encode(enc["input_ids"], enc["attention_mask"])    # (B, d)
        sims = q @ self.emb.t()
        idx = sims.topk(min(k, sims.size(1)), dim=1).indices
        return idx.cpu().tolist()


class TinyRetriever:
    """In-memory retriever for --smoke: exact match on synthetic descriptions."""

    def __init__(self, codes, code2desc):
        self.codes = codes
        self.code2desc = code2desc

    def topk(self, queries, k):
        res = []
        for q in queries:
            scored = sorted(range(len(self.codes)),
                            key=lambda j: -_overlap(q, self.code2desc[self.codes[j]]))
            res.append(scored[:k])
        return res


def _overlap(a: str, b: str) -> int:
    return len(set(a.lower().split()) & set(b.lower().split()))


# ── build reranker training pairs from CodiEsp ─────────────────────────────────
class RerankSet(Dataset):
    def __init__(self, examples):
        self.ex = examples  # list of (query, cand_desc, label)

    def __len__(self):
        return len(self.ex)

    def __getitem__(self, i):
        return self.ex[i]


def build_examples(docs, retriever, code2desc, config, rng) -> list[tuple[str, str, int]]:
    ex = []
    code_set = set(retriever.codes)
    for d in docs:
        gold = [c for c in d["codes"] if c in code_set]
        if not gold:
            continue
        # query per gold code: prefer the evidence span text, else the doc lead
        span_by_code = {s["code"]: s["text"] for s in d.get("spans", []) if s.get("text")}
        for gc in gold:
            query = span_by_code.get(gc) or " ".join(sentences(d["text"], 3))
            ex.append((query, code2desc.get(gc, gc), 1))
            cand = retriever.topk([query], config.candidates_per_query)[0]
            negs = [retriever.codes[j] for j in cand if retriever.codes[j] not in gold]
            for nc in rng.sample(negs, min(config.negatives_per_pos, len(negs))):
                ex.append((query, code2desc.get(nc, nc), 0))
    rng.shuffle(ex)
    return ex


# ── document-level MAP / P@k evaluation ────────────────────────────────────────
def average_precision(ranked: list[str], gold: set[str]) -> float:
    if not gold:
        return 0.0
    hits, score = 0, 0.0
    for i, c in enumerate(ranked, 1):
        if c in gold:
            hits += 1
            score += hits / i
    return score / len(gold)


@torch.no_grad()
def evaluate(docs, retriever, reranker: CrossEncoder, code2desc, config, device) -> dict:
    reranker.eval()
    aps, p5, p8, p15 = [], [], [], []
    code_set = set(retriever.codes)
    for d in docs:
        gold = {c for c in d["codes"] if c in code_set}
        if not gold:
            continue
        sents = sentences(d["text"]) or [d["text"][:400]]
        cand_lists = retriever.topk(sents, config.candidates_per_query)
        # union candidate codes, remembering the sentence that surfaced each best
        best_q: dict[str, str] = {}
        for si, cl in enumerate(cand_lists):
            for j in cl:
                c = retriever.codes[j]
                best_q.setdefault(c, sents[si])
        cand_codes = list(best_q.keys())
        if not cand_codes:
            continue
        # score each candidate with its surfacing sentence as the query
        scores = []
        for i in range(0, len(cand_codes), 128):
            chunk = cand_codes[i:i + 128]
            q = [best_q[c] for c in chunk]
            desc = [code2desc.get(c, c) for c in chunk]
            enc = reranker.tokenize(q, desc, config.max_pair_len, device)
            s = reranker(**enc)
            scores.extend(s.float().cpu().tolist() if s.dim() else [float(s)])
        order = np.argsort(scores)[::-1]
        ranked = [cand_codes[i] for i in order]
        aps.append(average_precision(ranked, gold))
        p5.append(len(set(ranked[:5]) & gold) / 5)
        p8.append(len(set(ranked[:8]) & gold) / 8)
        p15.append(len(set(ranked[:15]) & gold) / 15)
    return {"MAP": round(float(np.mean(aps)), 4), "P@5": round(float(np.mean(p5)), 4),
            "P@8": round(float(np.mean(p8)), 4), "P@15": round(float(np.mean(p15)), 4),
            "docs": len(aps)}


def train(config: Config, smoke: bool):
    torch.manual_seed(config.seed)
    rng = random.Random(config.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    out = Path(config.out_dir)

    if smoke:
        config.reranker_backbone = "prajjwal1/bert-tiny"
        config.reranker_epochs = 1
        config.reranker_batch = 16
        pairs = synthetic_pairs()
        code2desc, codes = pairs["code2desc"], pairs["codes"]
        retriever = TinyRetriever(codes, code2desc)
        train_docs = synthetic_codiesp(n=40, seed=1)
        test_docs = synthetic_codiesp(n=20, seed=2)
    else:
        icd = mine_pairs(config)
        code2desc = icd["code2desc"]
        retriever = Retriever(out, config, device)
        train_docs = codiesp_docs(config, "train") + codiesp_docs(config, "dev")
        test_docs = codiesp_docs(config, "test")

    print(f"train docs={len(train_docs)} test docs={len(test_docs)} device={device}")
    examples = build_examples(train_docs, retriever, code2desc, config, rng)
    print(f"reranker training examples={len(examples)} "
          f"(pos={sum(1 for e in examples if e[2] == 1)})")

    reranker = CrossEncoder(config.reranker_backbone).to(device)
    ds = RerankSet(examples)

    def collate(batch):
        q = [b[0] for b in batch]
        c = [b[1] for b in batch]
        y = torch.tensor([float(b[2]) for b in batch])
        return q, c, y

    loader = DataLoader(ds, batch_size=config.reranker_batch, shuffle=True, collate_fn=collate, drop_last=True)
    steps = max(1, len(loader) * config.reranker_epochs)
    opt = torch.optim.AdamW(reranker.parameters(), lr=config.reranker_lr, weight_decay=config.weight_decay)
    sched = get_linear_schedule_with_warmup(opt, int(steps * config.warmup_ratio), steps)
    scaler = torch.cuda.amp.GradScaler(enabled=config.fp16 and device == "cuda")
    bce = torch.nn.BCEWithLogitsLoss()

    reranker.train()
    step = 0
    max_steps = 8 if smoke else steps
    for epoch in range(config.reranker_epochs):
        for q, c, y in loader:
            y = y.to(device)
            enc = reranker.tokenize(q, c, config.max_pair_len, device)
            with torch.cuda.amp.autocast(enabled=config.fp16 and device == "cuda"):
                logits = reranker(**enc)
                loss = bce(logits, y)
            opt.zero_grad()
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            step += 1
            if step % 50 == 0 or smoke:
                print(f"  epoch {epoch} step {step}/{steps} loss {loss.item():.4f}")
            if step >= max_steps:
                break
        if step >= max_steps:
            break

    (out / "reranker").mkdir(parents=True, exist_ok=True)
    reranker.model.save_pretrained(out / "reranker")
    reranker.tok.save_pretrained(out / "reranker")

    metrics = evaluate(test_docs, retriever, reranker, code2desc, config, device)
    print("\n=== CodiEsp-D reranked, held-out test ===")
    print(metrics)
    (out / "reranker_eval.json").write_text(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--config", default=None)
    args = ap.parse_args()
    cfg = Config.load(args.config) if args.config else Config()
    cfg.resolved()
    train(cfg, smoke=args.smoke)
