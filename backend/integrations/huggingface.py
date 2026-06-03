"""HuggingFace Inference API — embeddings + OpenMed NER."""
from __future__ import annotations
import os
import httpx
from typing import Optional

HF_API_URL = "https://api-inference.huggingface.co"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
NER_MODELS = {
    "disease":  "allenai/scibert_scivocab_uncased",
    "pharma":   "allenai/scibert_scivocab_uncased",
    "anatomy":  "allenai/scibert_scivocab_uncased",
}


def _headers() -> dict:
    token = os.environ.get("HUGGINGFACE_API_KEY", "")
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def get_embedding(text: str) -> list[float] | None:
    """
    Call HuggingFace Inference API for sentence embeddings.
    Returns 768-dim float list or None on failure.
    """
    try:
        url = f"{HF_API_URL}/pipeline/feature-extraction/{EMBEDDING_MODEL}"
        response = httpx.post(url, json={"inputs": text[:512]}, headers=_headers(), timeout=30)
        response.raise_for_status()
        result = response.json()
        if isinstance(result, list) and isinstance(result[0], list):
            # Mean pool over token embeddings
            import numpy as np
            return list(np.mean(result[0], axis=0))
        return result if isinstance(result, list) else None
    except Exception:
        return None


def extract_medical_entities(text: str) -> list[dict]:
    """
    Run OpenMed NER via HuggingFace Inference API.
    Returns list of {word, entity_group, score} dicts.
    Falls back to empty list on failure.
    """
    try:
        url = f"{HF_API_URL}/pipeline/ner/{NER_MODELS['disease']}"
        response = httpx.post(url, json={"inputs": text[:512]}, headers=_headers(), timeout=30)
        response.raise_for_status()
        return response.json() if isinstance(response.json(), list) else []
    except Exception:
        return []
