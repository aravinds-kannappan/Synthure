"""HuggingFace sentence embedding wrapper with local fallback."""
from __future__ import annotations
from typing import Optional

from backend.integrations.huggingface import get_embedding


def embed(text: str) -> Optional[list[float]]:
    """
    Embed text using HuggingFace all-MiniLM-L6-v2 (768 dims).
    Returns None if embedding service is unavailable.
    """
    return get_embedding(text)


def embed_batch(texts: list[str]) -> list[Optional[list[float]]]:
    return [embed(t) for t in texts]
