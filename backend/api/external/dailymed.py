"""
DailyMed API client — FDA drug label data (dosing, warnings, indications).
Used by the patient portal to surface medication guides.

API docs: https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm
"""

from __future__ import annotations

from typing import TypedDict

import httpx

_BASE = "https://dailymed.nlm.nih.gov/dailymed/services/v2"


class DrugLabel(TypedDict):
    set_id: str
    name: str
    published: str
    url: str


class DrugDetails(TypedDict):
    set_id: str
    name: str
    indications: str
    dosage: str
    warnings: str
    url: str


async def search_drug(name: str, page_size: int = 5) -> list[DrugLabel]:
    """
    Search DailyMed for drug labels by name.
    Returns the top matching labels with set_id for detail lookup.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{_BASE}/drugnames.json",
            params={"drug_name": name, "pagesize": page_size},
        )
        resp.raise_for_status()
        data = resp.json()

    results: list[DrugLabel] = []
    for item in data.get("data", []):
        set_id = item.get("setid", "")
        label_name = item.get("drug_name", name)
        results.append(
            DrugLabel(
                set_id=set_id,
                name=label_name,
                published=item.get("published", ""),
                url=f"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={set_id}",
            )
        )
    return results


async def get_drug_details(set_id: str) -> DrugDetails | None:
    """
    Fetch full SPL label for a given set_id.
    Extracts indications, dosage, and warnings sections.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{_BASE}/spls/{set_id}.json")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()

    spl = data.get("data", [{}])[0] if data.get("data") else {}
    sections: dict[str, str] = {}
    for section in spl.get("sections", []):
        code = section.get("loinc_code", "")
        text = section.get("text", "")
        sections[code] = text

    # LOINC section codes
    INDICATIONS = "34067-9"
    DOSAGE      = "34068-7"
    WARNINGS    = "34071-1"

    return DrugDetails(
        set_id=set_id,
        name=spl.get("title", ""),
        indications=sections.get(INDICATIONS, ""),
        dosage=sections.get(DOSAGE, ""),
        warnings=sections.get(WARNINGS, ""),
        url=f"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={set_id}",
    )


async def get_medication_guide(drug_name: str) -> DrugDetails | None:
    """
    Convenience: search by name and return details for the first match.
    """
    labels = await search_drug(drug_name, page_size=1)
    if not labels:
        return None
    return await get_drug_details(labels[0]["set_id"])
