"""
MedlinePlus Connect API — returns patient education content for ICD-10 codes.
Used by the patient portal to surface plain-English condition summaries and links.

API docs: https://medlineplus.gov/connect/service.html
"""

from __future__ import annotations

from typing import TypedDict

import httpx

_BASE = "https://connect.medlineplus.gov/application"
_ICD10_SYSTEM = "2.16.840.1.113883.6.90"


class MedlineTopic(TypedDict):
    title: str
    url: str
    summary: str


async def get_topics_for_code(icd10_code: str) -> list[MedlineTopic]:
    """
    Fetch MedlinePlus health topics for an ICD-10-CM code.
    Returns a list of topics with title, URL, and plain-English summary.
    """
    params = {
        "mainSearchCriteria.v.cs": _ICD10_SYSTEM,
        "mainSearchCriteria.v.c": icd10_code,
        "knowledgeResponseType": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()

    topics: list[MedlineTopic] = []
    for entry in data.get("feed", {}).get("entry", []):
        title = entry.get("title", {}).get("_value", "")
        url = ""
        for link in entry.get("link", []):
            if link.get("rel") == "alternate":
                url = link.get("href", "")
                break
        summary = entry.get("summary", {}).get("_value", "")
        if title and url:
            topics.append(MedlineTopic(title=title, url=url, summary=summary))

    return topics


async def get_drug_info(drug_name: str) -> list[MedlineTopic]:
    """
    Fetch MedlinePlus topics for a drug name (free-text search).
    """
    params = {
        "mainSearchCriteria.v.dn": drug_name,
        "knowledgeResponseType": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_BASE, params=params)
        resp.raise_for_status()
        data = resp.json()

    topics: list[MedlineTopic] = []
    for entry in data.get("feed", {}).get("entry", []):
        title = entry.get("title", {}).get("_value", "")
        url = ""
        for link in entry.get("link", []):
            if link.get("rel") == "alternate":
                url = link.get("href", "")
                break
        summary = entry.get("summary", {}).get("_value", "")
        if title and url:
            topics.append(MedlineTopic(title=title, url=url, summary=summary))

    return topics
