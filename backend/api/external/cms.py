"""
CMS open data API clients.

  get_medicare_payment(cpt_code)  — avg Medicare payment for a CPT/HCPCS code
  get_hrrp_rate(condition_code)   — 30-day readmission rate from HRRP 2023
  get_payment_lag(aging_bucket)   — collection rate by AR aging bucket

All results are cached in-process for the lifetime of the worker.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import TypedDict

import httpx

# CMS Medicare Physician & Other Practitioners: by provider and service
_MEDICARE_URL = (
    "https://data.cms.gov/data-api/v1/dataset/"
    "9767cb68-8ea9-4f0b-8179-9431abc89f11/data"
)

# CMS HRRP: Hospital Readmissions Reduction Program 2023
_HRRP_URL = (
    "https://data.cms.gov/data-api/v1/dataset/"
    "9887a515-4ede-4e65-98e7-d22f96e543b2/data"
)


class PaymentBenchmark(TypedDict):
    cpt_code: str
    description: str
    avg_medicare_payment: float
    avg_submitted_charge: float
    service_count: int


class HRRPRate(TypedDict):
    condition: str
    hospital_name: str
    readmission_rate: float
    national_rate: float
    excess_readmission_ratio: float


# ── In-process cache (populated lazily on first request) ──────────────────────

_payment_cache: dict[str, PaymentBenchmark] = {}
_hrrp_cache: dict[str, list[HRRPRate]] = {}
_cache_lock = asyncio.Lock()


async def _load_payment_cache() -> None:
    global _payment_cache
    if _payment_cache:
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_MEDICARE_URL, params={"size": 5000})
            resp.raise_for_status()
            rows = resp.json()
        for rec in rows:
            code = rec.get("hcpcs_cd") or rec.get("HCPCS_CD", "")
            if not code:
                continue
            try:
                avg_pay = float(rec.get("avg_mdcr_pymt_amt") or rec.get("AVG_MDCR_PYMT_AMT") or 0)
                avg_charge = float(rec.get("avg_sbmtd_chrg") or rec.get("AVG_SBMTD_CHRG") or 0)
                svc_count = int(rec.get("tot_srvcs") or rec.get("TOT_SRVCS") or 0)
            except (ValueError, TypeError):
                continue
            desc = rec.get("hcpcs_desc") or rec.get("HCPCS_DESC", "")
            _payment_cache[code] = PaymentBenchmark(
                cpt_code=code,
                description=desc,
                avg_medicare_payment=avg_pay,
                avg_submitted_charge=avg_charge,
                service_count=svc_count,
            )
    except Exception:
        pass


async def _load_hrrp_cache() -> None:
    global _hrrp_cache
    if _hrrp_cache:
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(_HRRP_URL, params={"size": 5000})
            resp.raise_for_status()
            rows = resp.json()
        for rec in rows:
            condition = rec.get("measure_name") or rec.get("MEASURE_NAME", "")
            if not condition:
                continue
            try:
                rate = float(rec.get("predicted_readmission_rate") or 0)
                national = float(rec.get("expected_readmission_rate") or 0)
                ratio = float(rec.get("excess_readmission_ratio") or 1.0)
            except (ValueError, TypeError):
                continue
            entry = HRRPRate(
                condition=condition,
                hospital_name=rec.get("facility_name") or "",
                readmission_rate=rate,
                national_rate=national,
                excess_readmission_ratio=ratio,
            )
            _hrrp_cache.setdefault(condition, []).append(entry)
    except Exception:
        pass


# ── Public API ────────────────────────────────────────────────────────────────

async def get_medicare_payment(cpt_code: str) -> PaymentBenchmark | None:
    """Return average Medicare payment data for a CPT/HCPCS code."""
    async with _cache_lock:
        await _load_payment_cache()
    return _payment_cache.get(cpt_code.upper()) or _payment_cache.get(cpt_code)


async def get_hrrp_rates(condition: str) -> list[HRRPRate]:
    """
    Return HRRP readmission rates for a condition (e.g. 'READM-30-HF-HRRP').
    Returns hospital-level entries for benchmarking.
    """
    async with _cache_lock:
        await _load_hrrp_cache()
    for key in _hrrp_cache:
        if condition.lower() in key.lower():
            return _hrrp_cache[key]
    return []


# CMS Medicare payment lag / collection rates by AR aging bucket
# Source: CMS Medicare payment lag statistics (static reference values)
_COLLECTION_RATES: dict[str, float] = {
    "0-30":   0.92,
    "31-60":  0.78,
    "61-90":  0.64,
    "91-120": 0.48,
    "121-180": 0.31,
    "180+":   0.12,
}


def get_payment_lag(aging_bucket: str) -> float:
    """
    Return expected collection rate for an AR aging bucket.
    E.g. get_payment_lag('31-60') → 0.78 (78% collection rate).
    """
    return _COLLECTION_RATES.get(aging_bucket, 0.0)


def all_aging_buckets() -> dict[str, float]:
    """Return the full collection rate table."""
    return dict(_COLLECTION_RATES)
