"""Rule-based clinical section parser. Detects section headers (SOAP letters,
named headers like "Impression" or "Discharge diagnosis") and assigns each line
to a section. Deterministic and mirrored in TS (frontend/lib/models/sections.ts).
This is a rule-based component, honestly labeled as such, not a trained model.
"""

import re

HEADER_MAP = {
    "s": "subjective", "subjective": "subjective",
    "o": "objective", "objective": "objective",
    "a": "assessment", "assessment": "assessment", "impression": "impression",
    "p": "plan", "plan": "plan",
    "hpi": "hpi", "chief complaint": "chief_complaint",
    "discharge diagnosis": "diagnosis", "diagnosis": "diagnosis",
    "hospital course": "hospital_course", "disposition": "disposition",
    "discharge medications": "medications", "current medications": "medications", "medications": "medications",
    "reason for referral": "reason", "request": "request", "history": "history",
    "medical decision making": "mdm", "technique": "technique", "findings": "findings",
    "problem list": "problems", "symptoms": "symptoms", "interval history": "interval",
}

HEADER_RE = re.compile(r"(^|\n)\s*([A-Za-z][A-Za-z /]{0,34}?):\s", re.MULTILINE)


def parse_sections(note):
    """Return list of {name, label, start, end} for detected sections."""
    heads = []
    for m in HEADER_RE.finditer(note):
        raw = m.group(2).strip().lower()
        name = HEADER_MAP.get(raw)
        if name:
            heads.append((m.end(), m.group(2).strip(), name))
    out = []
    for i, (start, label, name) in enumerate(heads):
        end = heads[i + 1][0] - len(heads[i + 1][1]) - 2 if i + 1 < len(heads) else len(note)
        # trim back to before the next header token
        end = heads[i + 1][0] if i + 1 < len(heads) else len(note)
        if i + 1 < len(heads):
            # end at the char before the next header label begins
            nxt = heads[i + 1]
            hpos = note.rfind(nxt[1] + ":", start, nxt[0])
            end = hpos if hpos > start else nxt[0]
        out.append({"name": name, "label": label, "start": start, "end": max(start, end)})
    return out
