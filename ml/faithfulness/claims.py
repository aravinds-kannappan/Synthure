"""Torch-free helpers for turning a report + extraction into scorable claims.

Kept separate from score.py so the text shaping is unit testable without loading
a model, and reusable by both training-data tooling and the serving path.
"""

from __future__ import annotations

import re

_SENT = re.compile(r"(?<=[.!?])\s+")


def build_evidence(note: str, extraction: dict | None) -> str:
    """Note text plus a serialized extraction, matching the training format."""
    ev = (note or "").strip()
    if not extraction:
        return ev
    ents = extraction.get("entities") or []
    dx = [e["text"] for e in ents if str(e.get("type", "")).upper() == "DIAGNOSIS"]
    meds = [e["text"] for e in ents if str(e.get("type", "")).upper() == "MEDICATION"]
    icd = [f"{c.get('code')} {c.get('label', '')}".strip() for c in (extraction.get("icd10") or [])]
    lines = []
    if dx:
        lines.append("diagnoses [" + ", ".join(dx) + "]")
    if meds:
        lines.append("medications [" + ", ".join(meds) + "]")
    if icd:
        lines.append("ICD-10 [" + "; ".join(icd) + "]")
    return ev + ("\nStructured extraction: " + "; ".join(lines) + "." if lines else "")


def claims_from_report(report: dict) -> list[tuple[str, str]]:
    """Yield (source_field, sentence) for every sentence the writer produced."""
    out: list[tuple[str, str]] = []

    def add(field: str, text) -> None:
        if not text:
            return
        for s in _SENT.split(str(text)):
            s = s.strip()
            if len(s) > 3:
                out.append((field, s))

    add("headline", report.get("headline"))
    add("summary", report.get("summary"))
    for sec in report.get("sections", []) or []:
        add(f"section:{sec.get('title', '')}", sec.get("body"))
    for a in report.get("actions", []) or []:
        add("action", a)
    return out


if __name__ == "__main__":
    rep = {
        "headline": "You are managing high blood pressure.",
        "summary": "Your doctor started lisinopril. Keep taking it daily.",
        "sections": [{"title": "Medications", "body": "Lisinopril 10 mg once daily. Metformin was added."}],
        "actions": ["Schedule a follow up in 4 weeks."],
    }
    cl = claims_from_report(rep)
    print("claims extracted:", len(cl))
    for f, s in cl:
        print("  ", f, "->", s)
    ev = build_evidence("Patient with HTN.", {
        "entities": [{"text": "hypertension", "type": "DIAGNOSIS"}, {"text": "lisinopril", "type": "MEDICATION"}],
        "icd10": [{"code": "I10", "label": "Essential hypertension"}],
    })
    print("\nevidence:\n", ev)
    assert len(cl) == 6, cl
    assert "diagnoses [hypertension]" in ev and "ICD-10 [I10 Essential hypertension]" in ev
    print("\nclaims.py ok")
