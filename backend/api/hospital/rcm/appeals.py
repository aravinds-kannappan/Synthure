"""Appeal generation — Claude writes appeal letters from denial context."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.multitenancy import org_get, org_insert, org_update
from backend.core.config import settings

router = APIRouter()


@router.post("/denials/{denial_id}/appeal", status_code=201)
async def generate_appeal(
    denial_id: str,
    user: dict = Depends(require_role("hospital_admin")),
):
    """
    Generate and file an appeal letter for a denial.
    Claude generates the letter with clinical context (Phase 7 wires full denial prevention).
    """
    org_id = user.get("org_id", "")
    denial = org_get("denial_events", org_id, denial_id)
    if not denial:
        raise HTTPException(status_code=404, detail="Denial not found")

    letter = _generate_letter(denial)

    import time
    appeal = org_insert("appeals", org_id, {
        "denial_id": denial_id,
        "claim_id": denial["claim_id"],
        "letter_text": letter,
        "filed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "outcome": "pending",
    })

    # Mark denial as filed
    org_update("denial_events", org_id, denial_id, {"appeal_status": "filed"})

    return {"appeal": appeal, "ai_generated": True}


@router.patch("/appeals/{appeal_id}/outcome")
async def record_outcome(
    appeal_id: str,
    outcome: str,
    outcome_amount: Optional[float] = None,
    user: dict = Depends(require_role("hospital_admin")),
):
    if outcome not in ("won", "lost", "withdrawn"):
        raise HTTPException(status_code=400, detail="outcome must be won/lost/withdrawn")
    org_id = user.get("org_id", "")
    updates = {"outcome": outcome}
    if outcome_amount is not None:
        updates["outcome_amount"] = outcome_amount
    return org_update("appeals", org_id, appeal_id, updates)


def _generate_letter(denial: dict) -> str:
    if settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": (
                        f"Write a professional insurance appeal letter for the following denial:\n"
                        f"CARC code: {denial.get('carc_code', 'unknown')}\n"
                        f"Denial reason: {denial.get('denial_reason', 'Not specified')}\n"
                        f"Amount at stake: ${denial.get('amount_at_stake', 0):,.2f}\n"
                        f"Appeal deadline: {denial.get('appeal_deadline', 'unknown')}\n\n"
                        f"The letter should be formal, cite medical necessity, reference relevant policies, "
                        f"and request expedited review. Keep it under 400 words."
                    ),
                }],
            )
            return response.content[0].text
        except Exception:
            pass
    return (
        f"Re: Appeal for Claim Denial\n\n"
        f"This letter constitutes a formal Level 1 appeal for the denial referenced above.\n"
        f"CARC code: {denial.get('carc_code', 'N/A')}\n"
        f"Amount: ${denial.get('amount_at_stake', 0):,.2f}\n\n"
        f"The services rendered were medically necessary and covered under the patient's policy. "
        f"We request immediate reconsideration and reversal of this denial.\n\n"
        f"Supporting documentation is attached. Please respond within 30 days per CMS regulations."
    )
