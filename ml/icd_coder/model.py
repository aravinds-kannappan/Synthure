"""PyTorch models for the two ICD-coder stages.

BiEncoder   maps a short clinical phrase and an ICD-10-CM description into one
            shared unit-norm space, so retrieval is a cosine nearest neighbor.
CrossEncoder scores a (query, candidate-description) pair jointly for reranking.

Both wrap a Hugging Face encoder so any biomed/clinical backbone drops in.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModel, AutoModelForSequenceClassification, AutoTokenizer


def _mean_pool(last_hidden: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    m = mask.unsqueeze(-1).float()
    summed = (last_hidden * m).sum(dim=1)
    counts = m.sum(dim=1).clamp(min=1e-9)
    return summed / counts


class BiEncoder(nn.Module):
    """Shared-weight encoder for phrases and code descriptions (SapBERT-style)."""

    def __init__(self, backbone: str):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(backbone)
        self.tok = AutoTokenizer.from_pretrained(backbone)

    def encode(self, input_ids, attention_mask) -> torch.Tensor:
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        emb = _mean_pool(out.last_hidden_state, attention_mask)
        return F.normalize(emb, dim=-1)

    def tokenize(self, texts: list[str], max_len: int, device=None):
        enc = self.tok(texts, padding=True, truncation=True, max_length=max_len, return_tensors="pt")
        if device is not None:
            enc = {k: v.to(device) for k, v in enc.items()}
        return enc


def info_nce(anchor: torch.Tensor, positive: torch.Tensor, codes: torch.Tensor, temperature: float) -> torch.Tensor:
    """Symmetric in-batch InfoNCE.

    anchor[i] and positive[i] are the phrase and its code's description. Any j!=i
    with the same code is masked out so a true synonym is never punished as a
    negative (in-batch collisions are common in a 98k-code space).
    """
    logits = anchor @ positive.t() / temperature           # (B, B)
    same = codes.unsqueeze(0) == codes.unsqueeze(1)         # (B, B) same code
    eye = torch.eye(logits.size(0), dtype=torch.bool, device=logits.device)
    mask = same & ~eye
    logits = logits.masked_fill(mask, float("-inf"))
    target = torch.arange(logits.size(0), device=logits.device)
    return 0.5 * (F.cross_entropy(logits, target) + F.cross_entropy(logits.t(), target))


class CrossEncoder(nn.Module):
    """Joint (query, candidate) relevance scorer for reranking retriever hits."""

    def __init__(self, backbone: str):
        super().__init__()
        self.model = AutoModelForSequenceClassification.from_pretrained(backbone, num_labels=1)
        self.tok = AutoTokenizer.from_pretrained(backbone)

    def forward(self, input_ids, attention_mask, token_type_ids=None) -> torch.Tensor:
        kw = {"input_ids": input_ids, "attention_mask": attention_mask}
        if token_type_ids is not None:
            kw["token_type_ids"] = token_type_ids
        return self.model(**kw).logits.squeeze(-1)          # (B,)

    def tokenize(self, queries: list[str], candidates: list[str], max_len: int, device=None):
        enc = self.tok(queries, candidates, padding=True, truncation=True,
                       max_length=max_len, return_tensors="pt")
        if device is not None:
            enc = {k: v.to(device) for k, v in enc.items()}
        return enc
