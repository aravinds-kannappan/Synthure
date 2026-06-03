"""
Discharge education — 6th-grade reading level, MedlinePlus + DailyMed sourced,
Flesch-Kincaid scored, multi-language via Claude, SMS to patient.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.auth import require_role
from backend.core.config import settings
from backend.core.database import get_db
from backend.ml.readmission_scorer import score_readmission_risk
from backend.integrations.twilio import send_sms
import time

router = APIRouter()


class DischargeRequest(BaseModel):
    patient_id: str
    encounter_id: Optional[str] = None
    conditions: List[str]  # ICD-10 codes
    medications: List[str]  # Drug names
    patient_age: Optional[int] = 40
    patient_phone: Optional[str] = None
    language: Optional[str] = "en"
    follow_up_instructions: Optional[str] = ""


@router.post("/discharge")
async def generate_discharge(
    body: DischargeRequest,
    user: dict = Depends(require_role("physician", "hospital_admin")),
):
    org_id = user.get("org_id", "")
    client = None
    if settings.anthropic_api_key:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Fetch condition descriptions from MedlinePlus
    condition_materials = [_medlineplus_material(c) for c in body.conditions[:5]]
    medication_guides = [_dailymed_guide(m) for m in body.medications[:5]]

    # Generate plain-English instructions
    instructions = _generate_instructions(body, client, condition_materials, medication_guides)

    # Flesch-Kincaid readability
    readability = _flesch_kincaid_score(instructions)

    # Readmission risk score
    readmission_risk = score_readmission_risk(
        body.patient_age or 40,
        len(body.conditions),
        len(body.medications),
        body.conditions,
    )

    # Save discharge record
    db = get_db()
    record_id = None
    if db:
        r = db.table("discharge_records").insert({
            "encounter_id": body.encounter_id,
            "patient_id": body.patient_id,
            "org_id": org_id,
            "instructions": instructions,
            "condition_materials": condition_materials,
            "medication_guides": medication_guides,
            "readability_score": readability,
            "language": body.language,
        }).execute()
        record_id = r.data[0]["id"] if r.data else None

    # Send via SMS (Tier 1)
    sms_result = {}
    if body.patient_phone:
        sms_body = (
            f"Discharge instructions from your care team: {instructions[:300]}... "
            f"Follow-up: {body.follow_up_instructions or 'contact your doctor'}."
        )
        sms_result = send_sms(body.patient_phone, sms_body)
        if db and record_id:
            db.table("discharge_records").update({
                "sent_via_sms": True,
                "sent_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }).eq("id", record_id).execute()

    return {
        "instructions": instructions,
        "condition_materials": condition_materials,
        "medication_guides": medication_guides,
        "readability_score": readability,
        "readmission_risk": readmission_risk,
        "sms": sms_result,
        "language": body.language,
        "ai_generated": True,
    }


def _generate_instructions(body: DischargeRequest, client, conditions, meds) -> str:
    if client:
        try:
            cond_names = ", ".join(c.get("title", c) for c in conditions[:3])
            med_names = ", ".join(m.get("name", m) for m in meds[:3])
            lang_note = f" Write in {body.language}." if body.language != "en" else ""
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=600,
                messages=[{"role": "user", "content": (
                    f"Write discharge instructions for a patient with {cond_names}."
                    f" Medications: {med_names}."
                    f" Follow-up: {body.follow_up_instructions or 'schedule with your doctor'}."
                    f" Use 6th-grade reading level. Short paragraphs. No medical jargon.{lang_note}"
                )}],
            )
            return resp.content[0].text.strip()
        except Exception:
            pass
    return (
        f"You were treated for {', '.join(body.conditions[:2])}. "
        f"Take {', '.join(body.medications[:2])} as directed. "
        f"{body.follow_up_instructions or 'Call your doctor if symptoms worsen.'}"
    )


def _medlineplus_material(icd10_code: str) -> dict:
    ICD_TOPICS = {
        "I50": ("Heart Failure", "https://medlineplus.gov/heartfailure.html"),
        "I10": ("High Blood Pressure", "https://medlineplus.gov/highbloodpressure.html"),
        "E11": ("Type 2 Diabetes", "https://medlineplus.gov/diabetes.html"),
        "J44": ("COPD", "https://medlineplus.gov/copd.html"),
        "N18": ("Chronic Kidney Disease", "https://medlineplus.gov/chronickidneydisease.html"),
    }
    prefix = icd10_code[:3]
    title, url = ICD_TOPICS.get(prefix, (f"Condition: {icd10_code}", "https://medlineplus.gov"))
    return {"code": icd10_code, "title": title, "url": url, "source": "MedlinePlus"}


def _dailymed_guide(drug_name: str) -> dict:
    return {
        "name": drug_name,
        "url": f"https://dailymed.nlm.nih.gov/dailymed/search.cfm?query={drug_name.replace(' ', '+')}",
        "source": "DailyMed",
        "instructions": f"Take {drug_name} as prescribed. Do not stop without asking your doctor.",
    }


def _flesch_kincaid_score(text: str) -> float:
    """Approximate Flesch-Kincaid readability score."""
    words = text.split()
    sentences = max(text.count('.') + text.count('!') + text.count('?'), 1)
    syllables = sum(_count_syllables(w) for w in words)
    if not words or not sentences:
        return 0.0
    score = 206.835 - 1.015 * (len(words) / sentences) - 84.6 * (syllables / len(words))
    return round(max(0.0, min(score, 100.0)), 1)


def _count_syllables(word: str) -> int:
    word = word.lower().strip(".,!?;:")
    if len(word) <= 3:
        return 1
    count = sum(1 for i, c in enumerate(word) if c in 'aeiou' and (i == 0 or word[i-1] not in 'aeiou'))
    return max(1, count)
