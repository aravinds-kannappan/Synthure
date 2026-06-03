"""
HuggingFace Inference API — embeddings + medical NER.

NER models (both verified to exist and have medical entity labels):
  Primary:   d4data/biomedical-ner-all       — 107 biomedical entities, 121k downloads/month
                                                trained on MACCROBAT case reports
  Secondary: blaze999/Medical-NER            — 41 medical entities, 43k downloads/month
                                                DeBERTa v3-base fine-tuned on PubMED

Previous code used allenai/scibert_scivocab_uncased which is a plain pretrained LM
with no NER head and no entity labels — it would have returned nothing useful.
"""
from __future__ import annotations
import os
import httpx
from typing import Optional

HF_API_URL = "https://api-inference.huggingface.co"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Primary: 107 biomedical entities trained on MACCROBAT clinical case reports
NER_MODEL_PRIMARY = "d4data/biomedical-ner-all"
# Secondary fallback: 41 medical entities, DeBERTa v3-base, fine-tuned on PubMED
NER_MODEL_SECONDARY = "blaze999/Medical-NER"

# Entity labels in d4data/biomedical-ner-all that map to our categories
# (from MACCROBAT dataset schema)
DISEASE_LABELS = {
    "Disease_disorder", "Sign_symptom", "Biological_structure",
    "Detailed_description",
}
MEDICATION_LABELS = {
    "Medication", "Therapeutic_procedure", "Dosage", "Route", "Frequency",
}
ANATOMY_LABELS = {
    "Biological_structure", "Anatomical_site",
}


def _headers() -> dict:
    token = os.environ.get("HUGGINGFACE_API_KEY", "")
    return {"Authorization": f"Bearer {token}"} if token else {}


def get_embedding(text: str) -> list[float] | None:
    """
    Embed text via HuggingFace all-MiniLM-L6-v2 (768 dims, ~80ms).
    Returns None if service unavailable.
    """
    try:
        url = f"{HF_API_URL}/pipeline/feature-extraction/{EMBEDDING_MODEL}"
        response = httpx.post(
            url,
            json={"inputs": text[:512]},
            headers=_headers(),
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()
        # Response is [[token_embeddings...]] — mean-pool over tokens
        if isinstance(result, list) and result and isinstance(result[0], list):
            import numpy as np
            return list(np.mean(result[0], axis=0).astype(float))
        return result if isinstance(result, list) else None
    except Exception:
        return None


def extract_medical_entities(text: str) -> list[dict]:
    """
    Run biomedical NER via HuggingFace Inference API.
    Tries d4data/biomedical-ner-all first (107 entities, MACCROBAT-trained);
    falls back to blaze999/Medical-NER (41 entities, PubMED-trained).

    Returns list of dicts: {word, entity_group, score, category}
    where category is 'disease' | 'medication' | 'anatomy' | 'other'.
    """
    for model in (NER_MODEL_PRIMARY, NER_MODEL_SECONDARY):
        try:
            url = f"{HF_API_URL}/pipeline/token-classification/{model}"
            response = httpx.post(
                url,
                json={"inputs": text[:512], "parameters": {"aggregation_strategy": "simple"}},
                headers=_headers(),
                timeout=30,
            )
            response.raise_for_status()
            raw = response.json()
            if not isinstance(raw, list):
                continue
            # Enrich each entity with a simplified category
            entities = []
            for ent in raw:
                group = ent.get("entity_group", ent.get("entity", ""))
                category = (
                    "disease" if group in DISEASE_LABELS else
                    "medication" if group in MEDICATION_LABELS else
                    "anatomy" if group in ANATOMY_LABELS else
                    "other"
                )
                entities.append({
                    "word": ent.get("word", ""),
                    "entity_group": group,
                    "score": round(float(ent.get("score", 0)), 4),
                    "category": category,
                    "model": model,
                })
            return entities
        except Exception:
            continue
    return []
