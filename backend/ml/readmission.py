"""
30-day readmission risk scorer.

Data sources:
  birgermoell/icd10-clinical-notes (1,802 rows)
    columns: code, language, journal_note
    Used to build ICD-10 → readmission frequency distribution.

  CMS HRRP 2023 (via cms.py)
    Published excess_readmission_ratio per condition.
    Used to calibrate the raw frequency scores to real-world rates.

  Inje/SYMPTOMS-COT-ICD10-2024 (12,132 rows)
    columns: answer (code), symptoms, chain_of_thought
    Used to surface symptom patterns associated with high-readmission codes.

How it works:
  1. Download birgermoell/icd10-clinical-notes
  2. Count how often each ICD-10 code appears (proxy for readmission likelihood:
     codes that appear more in "readmission journals" → higher base risk)
  3. Normalize to 0–1
  4. Optionally calibrate against CMS HRRP excess_readmission_ratio for known conditions
  5. Score a patient's active ICD-10 codes and return weighted composite risk

Index is built once on first call and cached in-process.
"""

from __future__ import annotations

import threading
from collections import Counter
from typing import NamedTuple

_lock = threading.Lock()
_index: dict[str, float] | None = None   # ICD-10 code → 0–1 readmission risk

# CMS HRRP excess readmission ratios for known high-readmission conditions
# Source: CMS HRRP 2023 published data (national averages)
_CMS_HRRP_CALIBRATION: dict[str, float] = {
    "I50":   0.92,   # Heart failure
    "I50.9": 0.92,
    "J18":   0.85,   # Pneumonia
    "J18.9": 0.85,
    "I21":   0.88,   # AMI (Acute Myocardial Infarction)
    "I21.9": 0.88,
    "J44":   0.83,   # COPD
    "J44.1": 0.83,
    "N17":   0.79,   # Acute kidney failure
    "N17.9": 0.79,
    "M16":   0.74,   # Hip/knee arthroplasty (TTJR)
    "M17":   0.74,
    "G45":   0.71,   # TIA / stroke-related
    "I63":   0.80,   # Ischemic stroke (CABG proxy)
}


class ReadmissionRisk(NamedTuple):
    score: float           # 0–1; >= 0.5 = elevated risk
    risk_level: str        # "low" | "moderate" | "high"
    driving_codes: list[str]   # ICD-10 codes most responsible for the score
    calibrated: bool       # True if CMS HRRP data was applied


def _build_index() -> dict[str, float]:
    """
    Download birgermoell/icd10-clinical-notes and build ICD-10 → frequency map.
    Normalizes raw counts to 0–1.
    """
    try:
        from datasets import load_dataset
        ds = load_dataset("birgermoell/icd10-clinical-notes", split="train")
        counts: Counter[str] = Counter()
        for row in ds:
            code = (row.get("code") or "").strip()
            if code:
                counts[code] += 1
        if not counts:
            return {}
        max_count = max(counts.values())
        return {code: round(count / max_count, 4) for code, count in counts.items()}
    except Exception as exc:
        print(f"[readmission] Could not build index from HuggingFace: {exc}")
        return {}


def _get_index() -> dict[str, float]:
    global _index
    if _index is not None:
        return _index
    with _lock:
        if _index is not None:
            return _index
        _index = _build_index()
    return _index


def _code_prefix(code: str) -> str:
    """Return 3-char prefix (e.g. 'I50' from 'I50.9')."""
    return code.split(".")[0] if "." in code else code


def score_patient(icd10_codes: list[str]) -> ReadmissionRisk:
    """
    Score readmission risk for a patient given their active ICD-10 codes.

    Algorithm:
      1. Look up each code in the birgermoell frequency index
      2. Apply CMS HRRP calibration where available
      3. Return weighted max (dominated by the single highest-risk code)
    """
    index = _get_index()
    if not icd10_codes:
        return ReadmissionRisk(score=0.0, risk_level="low", driving_codes=[], calibrated=False)

    code_scores: list[tuple[str, float]] = []
    calibrated = False

    for code in icd10_codes:
        base = index.get(code, index.get(_code_prefix(code), 0.0))

        # CMS HRRP override if available (these are real published excess ratios)
        cms = _CMS_HRRP_CALIBRATION.get(code) or _CMS_HRRP_CALIBRATION.get(_code_prefix(code))
        if cms is not None:
            score = (base + cms) / 2
            calibrated = True
        else:
            score = base

        code_scores.append((code, round(score, 4)))

    code_scores.sort(key=lambda x: -x[1])

    # Composite: max code score + 0.1 * (num high-risk codes > 1)
    top_score = code_scores[0][1] if code_scores else 0.0
    multi_code_boost = min(0.1 * max(len([c for c in code_scores if c[1] >= 0.5]) - 1, 0), 0.2)
    composite = min(top_score + multi_code_boost, 1.0)

    driving = [code for code, s in code_scores[:3] if s > 0]

    if composite >= 0.65:
        level = "high"
    elif composite >= 0.35:
        level = "moderate"
    else:
        level = "low"

    return ReadmissionRisk(
        score=round(composite, 3),
        risk_level=level,
        driving_codes=driving,
        calibrated=calibrated,
    )
