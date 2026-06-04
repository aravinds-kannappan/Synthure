"""
Semantic retrieval via Supabase pgvector (all-MiniLM-L6-v2, 384-dim).
Embeddings are generated via the HuggingFace Inference API so that PyTorch
does not need to be installed locally — keeping the bundle under Vercel’s
250 MB serverless limit.
Falls back to BM25 over the seed corpus when the DB or HF API is unavailable.
"""
from __future__ import annotations

import math
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

import httpx


@dataclass
class RetrievedDoc:
    id: str
    doc_type: str
    title: str
    content: str
    relevance: float


# ── Embeddings via HF Inference API ────────────────────────────────────────────────────
# Uses the same all-MiniLM-L6-v2 model that was previously loaded locally.
# No PyTorch required.

_HF_TOKEN = os.environ.get("HF_TOKEN", "")
_EMBED_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"


def _embed(text: str) -> list[float]:
    """
    Return a normalised 384-dim embedding for `text` via HF Inference API.
    Returns an empty list if HF_TOKEN is not set or the API call fails;
    callers fall back to BM25 in that case.
    """
    if not _HF_TOKEN:
        return []
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                _EMBED_URL,
                headers={"Authorization": f"Bearer {_HF_TOKEN}"},
                json={"inputs": text[:512], "options": {"wait_for_model": True}},
            )
            if resp.status_code != 200:
                return []
            result = resp.json()

        # Response shape: [[f, f, ...]] for a single input string
        if isinstance(result, list) and result and isinstance(result[0], list):
            vec: list[float] = result[0]
        elif isinstance(result, list) and result and isinstance(result[0], (int, float)):
            vec = [float(x) for x in result]
        else:
            return []

        # L2-normalise so cosine similarity == dot product (matches pgvector <=>)
        norm = math.sqrt(sum(x * x for x in vec))
        return [x / norm for x in vec] if norm > 0 else vec
    except Exception:
        return []


# Backwards-compat alias used by insurance_rag.py seed function
def embed_text(text: str) -> list[float]:
    return _embed(text)


# ── pgvector semantic retrieval ───────────────────────────────────────────────────────────────

def _pgvector_retrieve(
    query: str,
    top_k: int,
    source: Optional[str],
    doc_type: Optional[str],
) -> list[RetrievedDoc]:
    from backend.core.database import get_db
    db = get_db()
    if db is None:
        return []
    embedding = _embed(query)
    if not embedding:
        return []  # no token — BM25 fallback will handle it
    try:
        result = db.rpc(
            "match_rag_documents",
            {
                "query_embedding": embedding,
                "match_count": top_k,
                "filter_source": source,
                "filter_doc_type": doc_type,
            },
        ).execute()
        return [
            RetrievedDoc(
                id=str(row["id"]),
                doc_type=row["doc_type"],
                title=row.get("title") or "",
                content=row["content"],
                relevance=round(float(row["similarity"]), 3),
            )
            for row in (result.data or [])
        ]
    except Exception:
        return []


# ── BM25 fallback (no DB or no HF token) ────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _bm25_retrieve(
    query: str,
    top_k: int,
    doc_type: Optional[str],
) -> list[RetrievedDoc]:
    from backend.rag.knowledge_base import CORPUS
    docs = [d for d in CORPUS if doc_type is None or d.get("type") == doc_type]
    if not docs:
        return []

    tokenized = [_tokenize(d["_text"]) for d in docs]
    N = len(docs)
    avgdl = sum(len(t) for t in tokenized) / max(N, 1)

    df: dict[str, int] = defaultdict(int)
    for tokens in tokenized:
        for term in set(tokens):
            df[term] += 1

    idf = {
        term: math.log((N - freq + 0.5) / (freq + 0.5) + 1)
        for term, freq in df.items()
    }

    k1, b = 1.5, 0.75
    query_tokens = _tokenize(query)

    def bm25_score(idx: int) -> float:
        tokens = tokenized[idx]
        tf: dict[str, int] = defaultdict(int)
        for t in tokens:
            tf[t] += 1
        s = 0.0
        for t in query_tokens:
            if t not in idf:
                continue
            f = tf[t]
            s += idf[t] * (f * (k1 + 1)) / (f + k1 * (1 - b + b * len(tokens) / avgdl))
        return s

    scored = sorted(range(N), key=bm25_score, reverse=True)[:top_k]
    top = [(i, bm25_score(i)) for i in scored if bm25_score(i) > 0]
    if not top:
        return []

    max_s = top[0][1]
    return [
        RetrievedDoc(
            id=docs[i]["id"],
            doc_type=docs[i]["type"],
            title=docs[i].get("title", docs[i].get("code", "")),
            content=docs[i].get("description", docs[i].get("content", "")),
            relevance=round(s / max_s, 3),
        )
        for i, s in top
    ]


# ── Public API ──────────────────────────────────────────────────────────────────────────────

def retrieve(
    query: str,
    top_k: int = 5,
    source: Optional[str] = None,
    doc_type: Optional[str] = None,
) -> list[RetrievedDoc]:
    docs = _pgvector_retrieve(query, top_k, source, doc_type)
    if docs:
        return docs
    return _bm25_retrieve(query, top_k, doc_type)


class BM25Retriever:
    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        doc_type: Optional[str] = None,
    ) -> list[RetrievedDoc]:
        return retrieve(query, top_k=top_k, doc_type=doc_type)


def get_retriever() -> BM25Retriever:
    return BM25Retriever()
