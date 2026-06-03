"""Tier classification for the autonomous action engine."""
from __future__ import annotations
from enum import Enum


class Tier(str, Enum):
    ONE = "1"    # Fully autonomous — executes on trigger, no approval
    TWO = "2"    # One-tap clinical communication — physician acknowledges
    THREE = "3"  # Hard stop — never autonomous regardless of consent


_TIER_MAP: dict[str, Tier] = {
    # ── Tier 1 — Clinical ────────────────────────────────────────────────────
    "submit_prior_auth":          Tier.ONE,
    "stage_claim":                Tier.ONE,
    "send_patient_education":     Tier.ONE,
    "send_followup_reminder":     Tier.ONE,
    "send_referral_notification": Tier.ONE,
    "verify_eligibility":         Tier.ONE,
    "send_cost_estimate":         Tier.ONE,
    "search_financial_assistance":Tier.ONE,
    # ── Tier 1 — Hospital ────────────────────────────────────────────────────
    "generate_appeal":            Tier.ONE,
    "reconcile_payment":          Tier.ONE,
    "start_collections_workflow": Tier.ONE,
    "generate_compliance_report": Tier.ONE,
    "alert_contract_renewal":     Tier.ONE,
    "start_credentialing_renewal":Tier.ONE,
    # ── Tier 1 — Employer ───────────────────────────────────────────────────
    "send_enrollment_notice":     Tier.ONE,
    "generate_utilization_report":Tier.ONE,
    "generate_aca_report":        Tier.ONE,
    "run_benefits_optimizer":     Tier.ONE,
    "send_cobra_notice":          Tier.ONE,
    # ── Tier 2 — Clinical communications (physician one-tap) ─────────────────
    "send_referral_letter":       Tier.TWO,
    "send_discharge_summary":     Tier.TWO,
    "send_care_coordination":     Tier.TWO,
    # ── Tier 3 — Hard stops ─────────────────────────────────────────────────
    "prescribe_medication":       Tier.THREE,
    "modify_treatment_plan":      Tier.THREE,
    "differential_diagnosis":     Tier.THREE,
    "sign_legal_medical_document":Tier.THREE,
}


def classify(action_type: str) -> Tier:
    return _TIER_MAP.get(action_type, Tier.THREE)


def is_autonomous(action_type: str) -> bool:
    return classify(action_type) == Tier.ONE


def requires_one_tap(action_type: str) -> bool:
    return classify(action_type) == Tier.TWO
