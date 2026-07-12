"""Note-type classifier, trained in PyTorch.

Replaces the scikit-learn TF-IDF + logistic-regression note-type model. It trains
over the exact same feature space the browser runtime uses (word 1 and 2 gram
TF-IDF, sublinear term frequency, L2 normalized) and exports the same
`note_type.json` schema ({classes, vocab, idf, coef, intercept}), so
frontend/lib/models/synthure.ts runs it unchanged. The model itself is a genuine
torch nn.Linear trained with Adam and cross-entropy: multinomial logistic
regression, learned rather than fit in closed form.

The point of the rebuild is not a fancier note-type head (the task is easy); it is
that the model now trains on the data-engine corpus (real notes plus generator
samples) instead of a 7-template grammar, and is reported on a frozen real-note
test split, not the synthetic split.
"""

from __future__ import annotations

import math
from collections import Counter

import numpy as np
import torch
import torch.nn as nn

from features import NOTE_TYPES, note_type_tokens


def build_vocab(docs_tokens: list[list[str]], max_features: int = 2000, min_df: int = 2):
    """Vocabulary + smoothed idf, matching the browser's TF-IDF expectations."""
    df: Counter[str] = Counter()
    for toks in docs_tokens:
        for t in set(toks):
            df[t] += 1
    items = [(t, c) for t, c in df.items() if c >= min_df]
    items.sort(key=lambda x: (-x[1], x[0]))
    items = items[:max_features]
    vocab = {t: i for i, (t, _) in enumerate(items)}
    n = max(1, len(docs_tokens))
    idf = [0.0] * len(vocab)
    for t, i in vocab.items():
        idf[i] = math.log((1 + n) / (1 + df[t])) + 1.0  # sklearn-style smooth idf
    return vocab, idf


def vectorize(tokens: list[str], vocab: dict[str, int], idf: list[float]) -> np.ndarray:
    tf = Counter(t for t in tokens if t in vocab)
    vec = np.zeros(len(vocab), dtype=np.float32)
    for t, c in tf.items():
        i = vocab[t]
        vec[i] = (1.0 + math.log(c)) * idf[i]  # sublinear tf, mirrors the TS runtime
    norm = float(np.linalg.norm(vec)) or 1.0
    return vec / norm


def _matrix(records, vocab, idf, toks=None):
    toks = toks if toks is not None else [note_type_tokens(r["note"]) for r in records]
    x = np.stack([vectorize(t, vocab, idf) for t in toks]) if records else np.zeros((0, len(vocab)), np.float32)
    y = np.array([NOTE_TYPES.index(r["note_type"]) for r in records], dtype=np.int64)
    return torch.from_numpy(x), torch.from_numpy(y)


def train_note_type(train, val, test, epochs: int = 400, lr: float = 0.4, weight_decay: float = 1e-4, device: str = "cpu"):
    """Train the linear note-type model in torch. Returns (export_dict, metrics)."""
    torch.manual_seed(0)
    tr_tok = [note_type_tokens(r["note"]) for r in train]
    vocab, idf = build_vocab(tr_tok)
    if not vocab:
        raise SystemExit("empty vocabulary: the training corpus is too small or empty")

    Xtr, ytr = _matrix(train, vocab, idf, tr_tok)
    Xva, yva = _matrix(val, vocab, idf)
    Xte, yte = _matrix(test, vocab, idf)
    Xtr, ytr = Xtr.to(device), ytr.to(device)

    model = nn.Linear(len(vocab), len(NOTE_TYPES)).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    lossf = nn.CrossEntropyLoss()
    for _ in range(epochs):
        model.train()
        opt.zero_grad(set_to_none=True)
        loss = lossf(model(Xtr), ytr)
        loss.backward()
        opt.step()

    model.eval()

    def acc(X, y):
        if X.shape[0] == 0:
            return None
        with torch.no_grad():
            return round(float((model(X.to(device)).argmax(1).cpu() == y).float().mean()), 3)

    metrics = {
        "train_acc": acc(Xtr.cpu(), ytr.cpu()),
        "val_acc": acc(Xva, yva),
        "real_test_acc": acc(Xte, yte),
        "n_train": len(train),
        "n_val": len(val),
        "n_test": len(test),
        "vocab_size": len(vocab),
    }
    export = {
        "classes": NOTE_TYPES,
        "vocab": vocab,
        "idf": idf,
        "coef": model.weight.detach().cpu().numpy().tolist(),  # (n_classes, n_vocab)
        "intercept": model.bias.detach().cpu().numpy().tolist(),  # (n_classes,)
    }
    return export, metrics
