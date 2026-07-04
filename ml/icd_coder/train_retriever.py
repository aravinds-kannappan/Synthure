"""Stage 1: train the ICD-10-CM retriever (bi-encoder) on the A100.

Trains on (phrase -> code) pairs mined from the ontology already in the repo,
then embeds every code description into an index matrix for cosine retrieval.

  python train_retriever.py                 # full run (downloads a biomed backbone)
  python train_retriever.py --smoke         # tiny backbone, few steps, CPU ok

Outputs under config.out_dir:
  retriever/                encoder weights + tokenizer (HF format)
  code_index.npz            codes[] and their unit-norm embeddings
  retriever_meta.json       backbone, dim, pair/label counts
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import get_linear_schedule_with_warmup

from config import Config
from data import mine_pairs, synthetic_pairs
from model import BiEncoder, info_nce


class PairSet(Dataset):
    def __init__(self, pairs, code2id):
        self.pairs = pairs
        self.code2id = code2id

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, i):
        phrase, code = self.pairs[i]
        return phrase, code, self.code2id[code]


def build_index(model: BiEncoder, codes, code2desc, max_len, device, batch=512) -> np.ndarray:
    model.eval()
    embs = []
    with torch.no_grad():
        for i in range(0, len(codes), batch):
            chunk = codes[i:i + batch]
            texts = [code2desc.get(c, c) for c in chunk]
            enc = model.tokenize(texts, max_len, device)
            e = model.encode(enc["input_ids"], enc["attention_mask"])
            embs.append(e.float().cpu().numpy())
    return np.vstack(embs).astype("float32")


def train(config: Config, smoke: bool):
    torch.manual_seed(config.seed)
    random.seed(config.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    if smoke:
        data = synthetic_pairs(n=400)
        config.retriever_backbone = "prajjwal1/bert-tiny"
        config.retriever_batch = 32
        config.retriever_epochs = 1
    else:
        data = mine_pairs(config)

    pairs, code2desc, codes = data["pairs"], data["code2desc"], data["codes"]
    code2id = {c: i for i, c in enumerate(codes)}
    print(f"pairs={len(pairs):,} codes={len(codes):,} device={device} backbone={config.retriever_backbone}")

    model = BiEncoder(config.retriever_backbone).to(device)
    ds = PairSet(pairs, code2id)

    def collate(batch):
        phrases = [b[0] for b in batch]
        pos_texts = [code2desc.get(b[1], b[1]) for b in batch]
        code_ids = torch.tensor([b[2] for b in batch], dtype=torch.long)
        return phrases, pos_texts, code_ids

    loader = DataLoader(ds, batch_size=config.retriever_batch, shuffle=True,
                        collate_fn=collate, drop_last=True, num_workers=2)

    steps = len(loader) * config.retriever_epochs
    opt = torch.optim.AdamW(model.parameters(), lr=config.retriever_lr, weight_decay=config.weight_decay)
    sched = get_linear_schedule_with_warmup(opt, int(steps * config.warmup_ratio), steps)
    scaler = torch.cuda.amp.GradScaler(enabled=config.fp16 and device == "cuda")

    max_steps = 5 if smoke else steps
    model.train()
    step = 0
    for epoch in range(config.retriever_epochs):
        for phrases, pos_texts, code_ids in loader:
            code_ids = code_ids.to(device)
            a = model.tokenize(phrases, config.max_phrase_len, device)
            p = model.tokenize(pos_texts, config.max_phrase_len, device)
            with torch.cuda.amp.autocast(enabled=config.fp16 and device == "cuda"):
                ae = model.encode(a["input_ids"], a["attention_mask"])
                pe = model.encode(p["input_ids"], p["attention_mask"])
                loss = info_nce(ae, pe, code_ids, config.temperature)
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

    out = Path(config.out_dir)
    (out / "retriever").mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(out / "retriever")
    model.tok.save_pretrained(out / "retriever")
    emb = build_index(model, codes, code2desc, config.max_phrase_len, device)
    np.savez_compressed(out / "code_index.npz", codes=np.array(codes), emb=emb)
    (out / "retriever_meta.json").write_text(json.dumps({
        "backbone": config.retriever_backbone,
        "dim": int(emb.shape[1]),
        "num_codes": len(codes),
        "num_pairs": len(pairs),
        "smoke": smoke,
    }, indent=2))
    print(f"saved retriever + index ({emb.shape}) to {out}")

    # Sanity retrieval so a run never silently produces a dead index.
    _demo_retrieval(model, codes, code2desc, emb, config, device)


def _demo_retrieval(model, codes, code2desc, emb, config, device, queries=None):
    queries = queries or ["high blood pressure", "sugar diabetes type 2", "broken arm", "trouble breathing"]
    enc = model.tokenize(queries, config.max_phrase_len, device)
    with torch.no_grad():
        q = model.encode(enc["input_ids"], enc["attention_mask"]).float().cpu().numpy()
    sims = q @ emb.T
    print("\nsanity retrieval:")
    for i, query in enumerate(queries):
        top = sims[i].argsort()[::-1][:3]
        hits = ", ".join(f"{codes[j]} ({code2desc.get(codes[j], '')[:28]})" for j in top)
        print(f"  {query!r:34s} -> {hits}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="tiny backbone, few steps, CPU ok")
    ap.add_argument("--config", default=None, help="path to a saved Config json")
    args = ap.parse_args()
    cfg = Config.load(args.config) if args.config else Config()
    cfg.resolved()
    train(cfg, smoke=args.smoke)
