"""Deterministic feature extraction shared by training, evaluation, and the TS
runtime. The TS side (frontend/lib/models/features.ts) mirrors these exactly so
a model trained here behaves identically in the browser.
"""

import re

NOTE_TYPES = ["soap", "discharge_summary", "referral", "er_note", "radiology", "intake_form", "progress_note"]
MISSING_FIELDS = ["laterality", "acuity", "supporting_diagnosis", "tobacco_status", "medication_dose"]

DX_SECTION_WORDS = ["assessment", "diagnosis", "impression", "problem", "decision"]


def note_type_tokens(note):
    """Word 1 and 2 grams, lowercased, used by the note-type TF-IDF model."""
    words = [w for w in re.sub(r"[^a-z0-9]+", " ", note.lower()).split() if w]
    grams = list(words)
    grams += [f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)]
    return grams


def structural_features(note, note_type, n_dx, n_proc):
    """Features for the missing-info and readiness models. Pure functions of the
    note text and a few counts, so they are trivially reproducible in TS."""
    low = note.lower()
    has = lambda *ws: 1.0 if any(w in low for w in ws) else 0.0
    dose = 1.0 if re.search(r"\d+\s?mg", low) else 0.0
    has_dx_section = 1.0 if any(w in low for w in DX_SECTION_WORDS) else 0.0
    resp = 1.0 if re.search(r"\b(copd|asthma|pneumonia|bronchitis|dyspnea|respiratory|lung)\b", low) else 0.0
    lat_cond = 1.0 if re.search(r"\b(knee|hip|arm|leg|ear|eye|hand|foot|shoulder)\b", low) else 0.0
    return {
        "n_dx": float(n_dx),
        "n_proc": float(n_proc),
        "has_laterality_word": has("right", "left", "bilateral"),
        "has_acuity_word": has("acute", "chronic"),
        "has_dose": dose,
        "has_dx_section": has_dx_section,
        "is_respiratory": resp,
        "lateralizable": lat_cond,
        "has_tobacco_word": has("tobacco", "smok", "nicotine"),
        "len_norm": min(len(note) / 600.0, 3.0),
        **{f"nt_{t}": (1.0 if note_type == t else 0.0) for t in NOTE_TYPES},
    }


STRUCT_KEYS = [
    "n_dx", "n_proc", "has_laterality_word", "has_acuity_word", "has_dose",
    "has_dx_section", "is_respiratory", "lateralizable", "has_tobacco_word", "len_norm",
] + [f"nt_{t}" for t in NOTE_TYPES]


def struct_vector(feats):
    return [feats[k] for k in STRUCT_KEYS]
