"""Cross-encoder for claim faithfulness (PyTorch).

Two labels: 0 = UNSUPPORTED, 1 = SUPPORTED. Input is the pair
(evidence, claim). A DeBERTa NLI checkpoint is a good warm start because it
already encodes entailment; we swap in a fresh 2-label head (the encoder
transfers, the classifier is retrained), so `warm_start_nli` and a plain
backbone both work through the same path.
"""

from __future__ import annotations

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

ID2LABEL = {0: "unsupported", 1: "supported"}
LABEL2ID = {v: k for k, v in ID2LABEL.items()}


def build_model(config):
    src = config.warm_start_nli or config.backbone
    model = AutoModelForSequenceClassification.from_pretrained(
        src, num_labels=2, id2label=ID2LABEL, label2id=LABEL2ID,
        ignore_mismatched_sizes=True,   # retrain the head when coming from a 3-class NLI model
    )
    tok = AutoTokenizer.from_pretrained(src)
    return model, tok


def tokenize_pairs(tok, evidences, claims, max_len, device=None):
    enc = tok(evidences, claims, padding=True, truncation="only_first",
              max_length=max_len, return_tensors="pt")
    if device is not None:
        enc = {k: v.to(device) for k, v in enc.items()}
    return enc


@torch.no_grad()
def p_supported(model, tok, evidences, claims, max_len, device, batch=64):
    """Probability that each claim is supported by its evidence."""
    model.eval()
    out = []
    for i in range(0, len(claims), batch):
        enc = tokenize_pairs(tok, evidences[i:i + batch], claims[i:i + batch], max_len, device)
        logits = model(**enc).logits
        out.append(torch.softmax(logits, dim=-1)[:, LABEL2ID["supported"]].float().cpu())
    return torch.cat(out).numpy() if out else torch.empty(0).numpy()
