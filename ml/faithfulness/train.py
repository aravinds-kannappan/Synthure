"""Train the faithfulness checker on the A100.

  python train.py                # DeBERTa base on synthetic corruptions
  python train.py --nli          # warm start from a DeBERTa NLI checkpoint
  python train.py --open-nli     # also mix in open FEVER/VitaminC (downloads)
  python train.py --smoke        # tiny backbone, few steps, CPU ok

Outputs under config.out_dir:
  checker/            HF cross-encoder + tokenizer
  threshold.json      flag threshold tuned on validation
  eval.json           held-out test metrics (AUROC, flag precision/recall)
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
from data import build_examples, split_by_note, load_open_nli, synthetic_smoke
from model import build_model, tokenize_pairs, p_supported
from metrics import best_threshold, evaluate


class PairSet(Dataset):
    def __init__(self, rows):
        self.rows = rows

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        return r["evidence"], r["claim"], int(r["label"])


def train(config: Config, smoke: bool, use_nli: bool, use_open: bool):
    torch.manual_seed(config.seed)
    random.seed(config.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    if smoke:
        config.backbone = "google/bert_uncased_L-2_H-128_A-2"  # official BERT-tiny (has model_type)
        config.warm_start_nli = ""
        config.epochs = 1
        config.batch_size = 16
        splits = synthetic_smoke()
    else:
        if use_nli and not config.warm_start_nli:
            config.warm_start_nli = "MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli"
        rows = build_examples(config)
        splits = split_by_note(rows, config)
        if use_open:
            config.use_open_nli = True
            open_rows = load_open_nli(config)
            print(f"mixed in {len(open_rows):,} open fact-verification rows")
            splits["train"] = splits["train"] + open_rows
            random.shuffle(splits["train"])

    print(f"train={len(splits['train']):,} val={len(splits['val']):,} test={len(splits['test']):,} "
          f"device={device} backbone={config.warm_start_nli or config.backbone}")

    model, tok = build_model(config)
    model.to(device)

    def collate(batch):
        ev = [b[0] for b in batch]
        cl = [b[1] for b in batch]
        y = torch.tensor([b[2] for b in batch], dtype=torch.long)
        return ev, cl, y

    loader = DataLoader(PairSet(splits["train"]), batch_size=config.batch_size,
                        shuffle=True, collate_fn=collate, drop_last=True, num_workers=2)
    steps = max(1, len(loader) * config.epochs)
    opt = torch.optim.AdamW(model.parameters(), lr=config.lr, weight_decay=config.weight_decay)
    sched = get_linear_schedule_with_warmup(opt, int(steps * config.warmup_ratio), steps)
    use_amp = config.fp16 and device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    loss_fn = torch.nn.CrossEntropyLoss()

    model.train()
    step, max_steps = 0, (8 if smoke else steps)
    for epoch in range(config.epochs):
        for ev, cl, y in loader:
            y = y.to(device)
            enc = tokenize_pairs(tok, ev, cl, config.max_len, device)
            with torch.amp.autocast("cuda", enabled=use_amp):
                logits = model(**enc).logits
                loss = loss_fn(logits, y)
            opt.zero_grad()
            scaler.scale(loss).backward()
            prev = scaler.get_scale()
            scaler.step(opt)
            scaler.update()
            if scaler.get_scale() >= prev:   # optimizer actually stepped (no overflow)
                sched.step()
            step += 1
            if step % 50 == 0 or smoke:
                print(f"  epoch {epoch} step {step}/{steps} loss {loss.item():.4f}")
            if step >= max_steps:
                break
        if step >= max_steps:
            break

    # ── tune the flag threshold on validation, freeze it, report on test ─────────
    def probs(rows):
        return p_supported(model, tok, [r["evidence"] for r in rows],
                           [r["claim"] for r in rows], config.max_len, device)

    val, test = splits["val"], splits["test"]
    yv = np.array([r["label"] for r in val])
    pv = probs(val)
    thr = best_threshold(yv, pv) if len(val) else config.flag_threshold
    yt = np.array([r["label"] for r in test])
    pt = probs(test)
    metrics = evaluate(yt, pt, thr) if len(test) else {}

    out = Path(config.out_dir)
    (out / "checker").mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out / "checker")
    tok.save_pretrained(out / "checker")
    (out / "threshold.json").write_text(json.dumps({"flag_threshold": thr}, indent=2))
    (out / "eval.json").write_text(json.dumps(metrics, indent=2))
    print("\n=== faithfulness checker, held-out test ===")
    print(metrics)
    print(f"flag threshold (p_supported <): {thr:.3f}  saved to {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--nli", action="store_true", help="warm start from a DeBERTa NLI checkpoint")
    ap.add_argument("--open-nli", action="store_true", help="mix in open FEVER/VitaminC")
    ap.add_argument("--config", default=None)
    args = ap.parse_args()
    cfg = Config.load(args.config) if args.config else Config()
    cfg.resolved()
    train(cfg, smoke=args.smoke, use_nli=args.nli, use_open=args.open_nli)
