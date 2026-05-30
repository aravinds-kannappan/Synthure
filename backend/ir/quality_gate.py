"""
Data quality gate: schema validation, ICD-10/CPT format checks,
deduplication, and entity confidence scoring.
Non-blocking by default — flags issues in the IR but continues the pipeline.
"""

import re
import time
from backend.ir.schemas import ClinicalNoteIR, ClaimIR, InsuranceProfileIR, QualityGateResult

# ── Code format validators ────────────────────────────────────────────────────

# ICD-10-CM: Letter + 2 digits, optional decimal + 1-4 alphanumeric
_ICD10 = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$")

# CPT: 5 digits (Category I/II/III) or 5 digits + optional letter
_CPT = re.compile(r"^[0-9]{4}[0-9A-Z]$")

# ── In-memory dedup cache ─────────────────────────────────────────────────────

_dedup_cache: dict[str, float] = {}
_DEDUP_TTL = 300  # seconds


def _check_dedup(hash_val: str) -> bool:
    """Returns True if this hash was seen within the TTL window; registers it otherwise."""
    now = time.time()
    stale = [k for k, t in _dedup_cache.items() if now - t > _DEDUP_TTL]
    for k in stale:
        del _dedup_cache[k]
    if hash_val in _dedup_cache:
        return True
    _dedup_cache[hash_val] = now
    return False


# ── Validators ────────────────────────────────────────────────────────────────

def validate_clinical_note(ir: ClinicalNoteIR) -> QualityGateResult:
    issues: list[str] = []
    confidence = 1.0

    if not ir.raw_text or not ir.raw_text.strip():
        return QualityGateResult(passed=False, confidence=0.0, issues=["Empty clinical note — nothing to process"])

    if ir.char_count < 30:
        issues.append(f"Note is very short ({ir.char_count} chars) — entity extraction may be limited")
        confidence -= 0.25

    dedup_hit = _check_dedup(ir.dedup_hash)
    if dedup_hit:
        issues.append("Identical note submitted within the last 5 minutes — returning cached pipeline result")
        confidence -= 0.05

    ir.quality_passed = True
    ir.quality_issues = issues
    return QualityGateResult(passed=True, confidence=max(confidence, 0.0), issues=issues, dedup_hit=dedup_hit)


def validate_claim(ir: ClaimIR) -> QualityGateResult:
    issues: list[str] = []
    confidence = 1.0
    hard_fail = False

    # Procedure code format
    if not _CPT.match(ir.procedure_code):
        issues.append(
            f"Procedure code '{ir.procedure_code}' does not match CPT format (expected 5 digits, e.g. 99213)"
        )
        confidence -= 0.30
        hard_fail = True

    # Diagnosis code formats
    invalid = [c for c in ir.diagnosis_codes if not _ICD10.match(c.strip())]
    if invalid:
        issues.append(
            f"Invalid ICD-10 format: {invalid} — expected e.g. I10, E11.9, M17.11"
        )
        confidence -= 0.20 * len(invalid)
        hard_fail = True

    # Implausible amount
    if ir.amount > 2_000_000:
        issues.append(f"Claim amount ${ir.amount:,.0f} exceeds plausible maximum — verify for data entry error")
        confidence -= 0.15

    # Dedup
    dedup_hit = _check_dedup(ir.dedup_hash)
    if dedup_hit:
        issues.append("Duplicate claim detected within 5-minute window — possible double submission")
        confidence -= 0.10

    passed = not hard_fail
    ir.quality_passed = passed
    ir.quality_issues = issues
    return QualityGateResult(
        passed=passed,
        confidence=max(confidence, 0.0),
        issues=issues,
        dedup_hit=dedup_hit,
    )


def validate_insurance_profile(ir: InsuranceProfileIR) -> QualityGateResult:
    issues: list[str] = []
    confidence = 1.0

    if not (0 < ir.age < 130):
        return QualityGateResult(
            passed=False,
            confidence=0.0,
            issues=[f"Age {ir.age} is outside valid range (1–129)"],
        )

    if ir.annual_income < 0:
        return QualityGateResult(
            passed=False,
            confidence=0.0,
            issues=["Annual income cannot be negative"],
        )

    if ir.annual_income > 5_000_000:
        issues.append(f"Annual income ${ir.annual_income:,} appears unusually high — verify input")
        confidence -= 0.05

    dedup_hit = _check_dedup(ir.dedup_hash)
    if dedup_hit:
        issues.append("Identical profile submitted within the last 5 minutes")

    ir.quality_passed = True
    ir.quality_issues = issues
    return QualityGateResult(
        passed=True,
        confidence=max(confidence, 0.0),
        issues=issues,
        dedup_hit=dedup_hit,
    )
