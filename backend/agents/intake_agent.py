"""
Intake agent — normalises any input form into a PatientEncounterIR.
Accepts: typed note, uploaded PDF text, FHIR data dict, or manual form values.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PatientEncounterIR:
    """Canonical intermediate representation for a patient encounter."""
    raw_note: str
    patient_id: Optional[str] = None
    org_id: Optional[str] = None
    physician_name: Optional[str] = None
    age: Optional[int] = None
    annual_income: Optional[int] = None
    employed: bool = False
    state: str = ""
    has_dependents: bool = False
    chronic_condition: bool = False
    # Populated by pipelines
    jargon_output: Optional[dict] = None
    insurance_output: Optional[dict] = None
    claim_output: Optional[dict] = None
    readmission_risk: Optional[float] = None
    action_ids: list[str] = field(default_factory=list)


def from_note(note: str, context: dict | None = None) -> PatientEncounterIR:
    """Build an IR from a plain text clinical note + optional context dict."""
    ctx = context or {}
    return PatientEncounterIR(
        raw_note=note.strip(),
        patient_id=ctx.get("patient_id"),
        org_id=ctx.get("org_id"),
        physician_name=ctx.get("physician_name"),
        age=ctx.get("age"),
        annual_income=ctx.get("annual_income"),
        employed=bool(ctx.get("employed", False)),
        state=ctx.get("state", ""),
        has_dependents=bool(ctx.get("has_dependents", False)),
        chronic_condition=bool(ctx.get("chronic_condition", False)),
    )


def from_fhir(fhir_bundle: dict) -> PatientEncounterIR:
    """Build an IR from a FHIR R4 Bundle (Epic sandbox format)."""
    note = ""
    patient_id = None
    for entry in fhir_bundle.get("entry", []):
        resource = entry.get("resource", {})
        rt = resource.get("resourceType")
        if rt == "DocumentReference":
            for content in resource.get("content", []):
                attachment = content.get("attachment", {})
                if attachment.get("contentType", "").startswith("text"):
                    import base64
                    data = attachment.get("data", "")
                    note = base64.b64decode(data).decode("utf-8", errors="ignore")
        elif rt == "Patient":
            patient_id = resource.get("id")
    return PatientEncounterIR(raw_note=note, patient_id=patient_id)
