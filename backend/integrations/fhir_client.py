"""Epic FHIR R4 sandbox integration."""
import os
import httpx
from typing import Optional

FHIR_BASE = os.environ.get("EPIC_FHIR_BASE", "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4")


async def fetch_patient(patient_id: str, access_token: str) -> Optional[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{FHIR_BASE}/Patient/{patient_id}",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/fhir+json"},
            timeout=15,
        )
        if resp.status_code == 200:
            return resp.json()
    return None


async def fetch_encounter_documents(patient_id: str, access_token: str) -> list:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{FHIR_BASE}/DocumentReference?patient={patient_id}&type=34748-4",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/fhir+json"},
            timeout=15,
        )
        if resp.status_code == 200:
            bundle = resp.json()
            return [e["resource"] for e in bundle.get("entry", [])]
    return []
