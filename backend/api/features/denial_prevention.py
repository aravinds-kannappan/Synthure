"""
Denial prevention — pre-submission risk score + payer-specific prevention suggestions.
RAG retrieves payer denial patterns; Claude generates prevention actions.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.config import settings
from backend.ml.denial_predictor import predict_denial_risk
from backend.rag import retriever as rag

router = APIRouter()


class DenialPreventionRequest(BaseModel):
    procedure_code: str
    diagnosis_codes: List[str]
    amount: float
    payer_id: Optional[str] = None
    prior_denial: Optional[bool] = False
    out_of_network: Optional[bool] = False
    experimental_treatment: Optional[bool] = False


@router.post("/denial-prevention")
async def denial_prevention(
    body: DenialPreventionRequest,
    user: dict = Depends(require_role("hospital_admin", "physician")),
):
    """
    Pre-submission denial risk assessment.
    Returns denial risk score + payer-specific prevention suggestions.
    Shown as a warning panel before the physician submits.
    """
    claim_data = body.model_dump()
    risk_score = predict_denial_risk(claim_data)

    # RAG retrieval for payer-specific denial patterns
    query = f"{body.procedure_code} {' '.join(body.diagnosis_codes[:3])}"
    if body.prior_denial:
        query += " prior denial"
    if body.out_of_network:
        query += " out of network"
    retrieved = rag.retrieve(query, top_k=3, doc_type="denial_pattern")

    suggestions = []
    if risk_score > 60:
        suggestions.append("Obtain pre-authorization before submitting — high denial risk detected")
        if body.out_of_network:
            suggestions.append("Confirm patient has signed out-of-network cost acknowledgment")
        if body.prior_denial:
            suggestions.append("Attach letter of medical necessity — prior denial on record")
    elif risk_score > 30:
        suggestions.append("Verify eligibility before submission")
        suggestions.append("Confirm diagnosis codes align with procedure documentation")

    # AI-generated suggestions if high risk
    if risk_score > 40 and settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            context = "\n".join(d.content[:100] for d in retrieved)
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{"role": "user", "content": (
                    f"Procedure: {body.procedure_code}, ICD-10: {', '.join(body.diagnosis_codes)}, "
                    f"Denial risk: {risk_score}%.\nKnown patterns:\n{context}\n"
                    f"Give 2-3 specific steps to prevent denial. Be concise."
                )}],
            )
            ai_text = response.content[0].text
            suggestions.append(f"[AI] {ai_text.strip()[:300]}")
        except Exception:
            pass

    return {
        "denial_risk": risk_score,
        "risk_level": "high" if risk_score > 60 else "medium" if risk_score > 30 else "low",
        "prevention_suggestions": suggestions,
        "rag_patterns_found": len(retrieved),
        "ai_enhanced": bool(settings.anthropic_api_key and risk_score > 40),
    }
