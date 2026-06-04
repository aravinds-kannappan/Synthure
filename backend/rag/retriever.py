"""
Semantic retrieval via Supabase pgvector (all-MiniLM-L6-v2, 384-dim).
Falls back to BM25 over the seed corpus when the DB is unavailable.
"""

from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional


@dataclass
class RetrievedDoc:
    id: str
    doc_type: str
    title: str
    content: str
    relevance: float


# ── Embedding model (lazy-loaded to avoid cold-start cost) ────────────────────

_embed_model = None


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        _embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _embed_model


def _embed(text: str) -> list[float]:
    return _get_embed_model().encode(text, normalize_embeddings=True).tolist()


# ── pgvector semantic retrieval ───────────────────────────────────────────────

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
    try:
        embedding = _embed(query)
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


# ── BM25 fallback (offline / no DB) ──────────────────────────────────────────

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


# ── Public API ────────────────────────────────────────────────────────────────

def retrieve(
    query: str,
    top_k: int = 5,
    source: Optional[str] = None,
    doc_type: Optional[str] = None,
) -> list[RetrievedDoc]:
    """
    Retrieve top_k documents semantically relevant to query.
    Uses pgvector when Supabase is connected, BM25 seed corpus otherwise.
    """
    docs = _pgvector_retrieve(query, top_k, source, doc_type)
    if docs:
        return docs
    return _bm25_retrieve(query, top_k, doc_type)


class BM25Retriever:
    """Backwards-compatible wrapper — routes to pgvector with BM25 fallback."""

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        doc_type: Optional[str] = None,
    ) -> list[RetrievedDoc]:
        return retrieve(query, top_k=top_k, doc_type=doc_type)


def get_retriever() -> BM25Retriever:
    return BM25Retriever()
