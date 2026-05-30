"""
BM25 retrieval engine — pure Python, no external ML dependencies.
Indexes the medical knowledge base and retrieves top-k relevant documents.
"""

import math
import re
from dataclasses import dataclass
from collections import defaultdict
from typing import Optional

from .knowledge_base import CORPUS, get_document


@dataclass
class RetrievedDoc:
    id: str
    doc_type: str
    title: str
    content: str    # formatted context block for LLM injection
    relevance: float  # normalized BM25 score 0–1


def _tokenize(text: str) -> list[str]:
    """Lowercase + split on non-alphanumeric. Includes ICD/CPT codes as tokens."""
    return re.findall(r"[a-z0-9]+", text.lower())


def _format_for_context(doc: dict) -> str:
    """Format a KB document as a numbered context block for LLM injection."""
    lines = [f"[{doc['id']}] {doc['title']}"]
    skip = {"id", "type", "title", "_text", "keywords"}
    for k, v in doc.items():
        if k in skip:
            continue
        if isinstance(v, str) and v:
            lines.append(f"  {k.replace('_', ' ')}: {v}")
        elif isinstance(v, list) and v:
            lines.append(f"  {k.replace('_', ' ')}: {', '.join(str(x) for x in v)}")
    return "\n".join(lines)


class BM25Retriever:
    """
    Okapi BM25 retrieval over the medical knowledge base corpus.

    BM25 score for document D and query Q:
        score(D,Q) = Σ IDF(t) * (tf * (k1+1)) / (tf + k1*(1 - b + b*|D|/avgdl))
    where:
        IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
    """

    def __init__(self, documents: list[dict], k1: float = 1.5, b: float = 0.75):
        self.docs = documents
        self.k1 = k1
        self.b = b
        self._build_index()

    def _build_index(self) -> None:
        self.tokenized = [_tokenize(d["_text"]) for d in self.docs]
        lengths = [len(t) for t in self.tokenized]
        self.avgdl = sum(lengths) / len(lengths) if lengths else 1.0
        self.N = len(self.docs)

        df: dict[str, int] = defaultdict(int)
        for tokens in self.tokenized:
            for term in set(tokens):
                df[term] += 1

        self.idf: dict[str, float] = {
            term: math.log((self.N - freq + 0.5) / (freq + 0.5) + 1)
            for term, freq in df.items()
        }

    def _score(self, query_tokens: list[str], doc_idx: int) -> float:
        tokens = self.tokenized[doc_idx]
        doc_len = len(tokens)
        tf: dict[str, int] = defaultdict(int)
        for t in tokens:
            tf[t] += 1

        score = 0.0
        for t in query_tokens:
            if t not in self.idf:
                continue
            f = tf[t]
            score += (
                self.idf[t]
                * (f * (self.k1 + 1))
                / (f + self.k1 * (1.0 - self.b + self.b * doc_len / self.avgdl))
            )
        return score

    def retrieve(
        self,
        query: str,
        top_k: int = 4,
        doc_type: Optional[str] = None,
    ) -> list[RetrievedDoc]:
        """
        Retrieve top_k documents for the query.
        Optionally filter to a specific doc_type: "medical_code", "denial_pattern", "insurance_policy".
        """
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        candidate_indices = (
            range(len(self.docs))
            if doc_type is None
            else [i for i, d in enumerate(self.docs) if d.get("type") == doc_type]
        )

        scored = [(i, self._score(query_tokens, i)) for i in candidate_indices]
        scored.sort(key=lambda x: -x[1])

        top = [(i, s) for i, s in scored[:top_k] if s > 0]
        if not top:
            return []

        max_score = top[0][1]

        return [
            RetrievedDoc(
                id=self.docs[i]["id"],
                doc_type=self.docs[i]["type"],
                title=self.docs[i]["title"],
                content=_format_for_context(self.docs[i]),
                relevance=round(score / max_score, 3),
            )
            for i, score in top
        ]


# Module-level singleton — built once on import
_retriever: BM25Retriever | None = None


def get_retriever() -> BM25Retriever:
    global _retriever
    if _retriever is None:
        _retriever = BM25Retriever(CORPUS)
    return _retriever


def retrieve(query: str, top_k: int = 4, doc_type: Optional[str] = None) -> list[RetrievedDoc]:
    """Convenience function for module-level retrieval."""
    return get_retriever().retrieve(query, top_k=top_k, doc_type=doc_type)
