"""Coding suggestions — ICD-10 and CPT codes from clinical note via RAG + Claude."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.config import settings
from backend.rag import retriever as rag

router = APIRouter()


class CodingRequest(BaseModel):
    notes: str
    procedure_hint: str = ""


@router.post("/coding/suggest")
async def suggest_codes(
    body: CodingRequest,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    """
    Suggest ICD-10 + CPT codes from clinical note.
    Uses RAG retrieval from ICD-10 corpus + Claude few-shot.
    Non-mandatory — shown as suggestions to the coder.
    """
    notes = body.notes.strip()
    if not notes:
        raise HTTPException(status_code=400, detail="'notes' is required")

    # Retrieve relevant ICD-10 descriptions
    retrieved = rag.retrieve(notes[:300], top_k=5, doc_type="medical_code")

    suggestions = [
        {"code": d.id.replace("icd10_", ""), "description": d.content[:120], "confidence": round(d.relevance, 2)}
        for d in retrieved
    ]

    if settings.anthropic_api_key and notes:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            context = "\n".join(f"{s['code']}: {s['description']}" for s in suggestions[:3])
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                messages=[{
                    "role": "user",
                    "content": (
                        f"Given this clinical note and candidate ICD-10 codes, suggest the best 2-3 codes.\n"
                        f"Note: {notes[:500]}\n\nCandidates:\n{context}\n\n"
                        f"Reply with a JSON array: [{{\"code\": \"X00.0\", \"description\": \"...\", \"rationale\": \"...\"}}]"
                    ),
                }],
            )
            import json, re
            m = re.search(r'\[.*?\]', response.content[0].text, re.DOTALL)
            if m:
                ai_suggestions = json.loads(m.group())
                return {"suggestions": ai_suggestions, "source": "claude-haiku", "non_mandatory": True}
        except Exception:
            pass

    return {"suggestions": suggestions, "source": "rag", "non_mandatory": True}
