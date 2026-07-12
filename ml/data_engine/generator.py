"""A small, owned, trained note generator.

This is the piece that replaces hand-written templates. It is a compact
byte-level decoder-only transformer (nanoGPT style) trained from scratch on real
open-license clinical notes. Generation is conditioned on a note type via a
control token prepended to the sequence, so a sampled note's type label is gold
by construction while its text is sampled from a distribution learned from real
notes, never assembled from fixed phrases.

Byte-level (vocab 256 + one control token per note type + one EOS) keeps the model
fully self-contained: no external tokenizer or vocabulary file to ship or drift.

Full training runs in Colab on a GPU (build.py drives it). The same code trains on
CPU for a few steps in data_engine/smoke_test.py to prove the loop end to end.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path

import torch
import torch.nn as nn
from torch.nn import functional as F

from schema import NOTE_TYPES

N_BYTES = 256
CTRL = {t: N_BYTES + i for i, t in enumerate(NOTE_TYPES)}  # note-type control token ids
EOS = N_BYTES + len(NOTE_TYPES)
VOCAB = N_BYTES + len(NOTE_TYPES) + 1
PAD = -1  # ignore index in the loss for padded positions


@dataclass
class GPTConfig:
    vocab_size: int = VOCAB
    block_size: int = 256
    n_layer: int = 4
    n_head: int = 4
    n_embd: int = 128
    dropout: float = 0.1


class Block(nn.Module):
    def __init__(self, cfg: GPTConfig):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.n_embd)
        self.attn = nn.MultiheadAttention(cfg.n_embd, cfg.n_head, dropout=cfg.dropout, batch_first=True)
        self.ln2 = nn.LayerNorm(cfg.n_embd)
        self.mlp = nn.Sequential(
            nn.Linear(cfg.n_embd, 4 * cfg.n_embd),
            nn.GELU(),
            nn.Linear(4 * cfg.n_embd, cfg.n_embd),
            nn.Dropout(cfg.dropout),
        )

    def forward(self, x, attn_mask):
        h = self.ln1(x)
        a, _ = self.attn(h, h, h, attn_mask=attn_mask, need_weights=False)
        x = x + a
        x = x + self.mlp(self.ln2(x))
        return x


class GPT(nn.Module):
    def __init__(self, cfg: GPTConfig):
        super().__init__()
        self.cfg = cfg
        self.tok = nn.Embedding(cfg.vocab_size, cfg.n_embd)
        self.pos = nn.Embedding(cfg.block_size, cfg.n_embd)
        self.drop = nn.Dropout(cfg.dropout)
        self.blocks = nn.ModuleList([Block(cfg) for _ in range(cfg.n_layer)])
        self.ln_f = nn.LayerNorm(cfg.n_embd)
        self.head = nn.Linear(cfg.n_embd, cfg.vocab_size, bias=False)
        self.apply(self._init)

    def _init(self, m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, mean=0.0, std=0.02)
            if isinstance(m, nn.Linear) and m.bias is not None:
                nn.init.zeros_(m.bias)

    def forward(self, idx, targets=None):
        b, t = idx.shape
        pos = torch.arange(t, device=idx.device)
        x = self.drop(self.tok(idx) + self.pos(pos)[None, :, :])
        causal = torch.triu(torch.full((t, t), float("-inf"), device=idx.device), diagonal=1)
        for blk in self.blocks:
            x = blk(x, causal)
        logits = self.head(self.ln_f(x))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), targets.reshape(-1), ignore_index=PAD)
        return logits, loss

    @torch.no_grad()
    def generate(self, note_type: str, max_new_tokens: int = 400, temperature: float = 0.9, top_k: int = 40, device="cpu") -> str:
        self.eval()
        idx = torch.tensor([[CTRL[note_type]]], dtype=torch.long, device=device)
        out_bytes: list[int] = []
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.cfg.block_size :]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :] / max(1e-5, temperature)
            if top_k:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = float("-inf")
            probs = F.softmax(logits, dim=-1)
            nxt = int(torch.multinomial(probs, 1).item())
            if nxt == EOS:
                break
            if nxt < N_BYTES:  # a real byte; control tokens never emit into text
                out_bytes.append(nxt)
            idx = torch.cat([idx, torch.tensor([[nxt]], device=device)], dim=1)
        return bytes(out_bytes).decode("utf-8", errors="ignore")


# ── Data prep ─────────────────────────────────────────────────────────────────
def encode(note_type: str, text: str, block_size: int) -> list[int]:
    """[control token] + utf-8 bytes + [EOS], truncated to block_size."""
    body = list(text.encode("utf-8"))[: block_size - 2]
    return [CTRL[note_type]] + body + [EOS]


def _batch(records, cfg: GPTConfig, bs: int, device: str):
    import random

    xs, ys = [], []
    for _ in range(bs):
        r = random.choice(records)
        seq = encode(r.note_type, r.note, cfg.block_size)
        # pad to block_size + 1 so we can shift for next-token targets
        seq = seq[: cfg.block_size + 1]
        pad = (cfg.block_size + 1) - len(seq)
        x = seq[:-1] + [0] * max(0, pad)
        y = seq[1:] + [PAD] * max(0, pad)
        x = x[: cfg.block_size]
        y = y[: cfg.block_size]
        xs.append(x)
        ys.append(y)
    return (
        torch.tensor(xs, dtype=torch.long, device=device),
        torch.tensor(ys, dtype=torch.long, device=device),
    )


def train_generator(records, cfg: GPTConfig, steps: int = 3000, batch_size: int = 32, lr: float = 3e-4, device: str = "cpu", log_every: int = 200):
    """Train the generator on a list of NoteRecords. Returns the trained model."""
    torch.manual_seed(0)
    model = GPT(cfg).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    model.train()
    for step in range(1, steps + 1):
        x, y = _batch(records, cfg, batch_size, device)
        _, loss = model(x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if log_every and (step % log_every == 0 or step == 1):
            print(f"  step {step}/{steps}  loss {loss.item():.3f}  ppl {math.exp(min(20, loss.item())):.1f}")
    return model


def save(model: GPT, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), path)
    (path.with_suffix(".config.json")).write_text(json.dumps(asdict(model.cfg)))


def load(path: Path, device: str = "cpu") -> GPT:
    cfg = GPTConfig(**json.loads((path.with_suffix(".config.json")).read_text()))
    model = GPT(cfg).to(device)
    model.load_state_dict(torch.load(path, map_location=device))
    model.eval()
    return model
