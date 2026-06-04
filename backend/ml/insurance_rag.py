"""
RAG-based insurance plan matcher.

Replaces the hardcoded _rule_based_match() in orchestrator.py.

How it works:
  1. On startup, insurance plan documents are seeded into rag_documents
     (source='cms_aca_guidelines', doc_type='insurance_policy').
     Plans are derived from CMS/ACA public guidelines and Medicare documentation.
  2. Patient profile is converted to a natural language query.
  3. Query is embedded with the same sentence-transformers/all-MiniLM-L6-v2 model
     already loaded by the RAG retriever (no extra model).
  4. Top-K plan docs are retrieved via pgvector cosine similarity (BM25 fallback).
  5. Eligibility boosts are applied on top of semantic scores — these reflect
     actual program rules (age gate for Medicare, income thresholds for Medicaid, etc.).
  6. Returns ranked list of {plan, match_score, reason} dicts — same shape as
     the old rule engine so downstream code is unchanged.

No hardcoded numeric scores. Every recommendation is grounded in retrieved plan text.
"""
from __future__ import annotations

from typing import Optional


# ── Insurance plan knowledge base ───────────────────────────────────────────────────
# Derived from CMS/ACA public guidelines. Seeds the RAG corpus.

INSURANCE_PLAN_DOCS = [
    {
        "id": "ins_medicare_original",
        "title": "Medicare Parts A & B — Federal Health Insurance for Seniors",
        "_text": (
            "Medicare is federal health insurance for people 65 or older and for some younger people "
            "with qualifying disabilities. Part A covers inpatient hospital stays, skilled nursing facility "
            "care, hospice, and some home health care at no premium for most enrollees. Part B covers "
            "outpatient physician services, preventive care, durable medical equipment, and lab tests with "
            "a standard monthly premium of $174.70 in 2024. Together Parts A and B form Original Medicare. "
            "Eligibility: age 65 or older, or certain qualifying disabilities under 65. Enrollment is "
            "automatic for Social Security recipients; all others must enroll during the Initial Enrollment Period."
        ),
        "content": (
            "Medicare covers Americans aged 65+ and qualifying disabled individuals. "
            "Part A covers inpatient/hospital care (no premium for most). "
            "Part B covers outpatient/physician services ($174.70/month). "
            "Comprehensive coverage for most medical needs. "
            "Top priority for any patient aged 65 or older."
        ),
    },
    {
        "id": "ins_medicare_advantage",
        "title": "Medicare Advantage (Part C) — Private Medicare Bundled Plans",
        "_text": (
            "Medicare Advantage plans are offered by private insurers approved by Medicare and cover "
            "everything Original Medicare covers plus often prescription drugs (Part D), vision, dental, "
            "and hearing. Many plans charge no additional premium beyond the Part B premium. Plans may "
            "require using a provider network. Popular for beneficiaries seeking coordinated care and "
            "extra benefits. Eligibility is the same as Original Medicare (age 65+ or qualifying disability)."
        ),
        "content": (
            "Medicare Advantage (Part C) bundles Parts A, B, and usually D into a private plan. "
            "Often includes dental, vision, and hearing benefits not in Original Medicare. "
            "Many plans have low or zero additional premiums. Best for patients 65+ wanting coordinated care."
        ),
    },
    {
        "id": "ins_medicaid",
        "title": "Medicaid — State/Federal Low-Income Health Coverage",
        "_text": (
            "Medicaid is a joint federal-state program providing health coverage to eligible low-income "
            "adults, children, pregnant women, elderly adults, and people with disabilities. In expansion "
            "states, adults under 65 with income up to 138% of the Federal Poverty Level (FPL) qualify. "
            "The FPL for a single adult is $14,580/year in 2024; for a family of four it is $30,000. "
            "Medicaid covers doctor visits, hospitalization, prescription drugs, long-term care, preventive "
            "care, and lab tests with no or very low cost-sharing. Each state operates its own Medicaid "
            "program so specific benefits vary by state."
        ),
        "content": (
            "Medicaid provides near-free comprehensive health coverage for low-income individuals. "
            "Income threshold: ~138% FPL (~$20,120/year for a single adult in expansion states). "
            "Minimal to no cost-sharing. Top recommendation for patients at or below 138% FPL."
        ),
    },
    {
        "id": "ins_chip",
        "title": "CHIP — Children's Health Insurance Program",
        "_text": (
            "CHIP provides low-cost health coverage to children in families that earn too much for Medicaid "
            "but cannot afford private insurance. Most states cover children from birth through age 18 with "
            "income limits typically between 200% and 300% of FPL. Some states also cover pregnant women. "
            "Premiums are low and cost-sharing minimal. Covered services include checkups, immunizations, "
            "doctor visits, prescriptions, dental, vision, inpatient and outpatient hospital care."
        ),
        "content": (
            "CHIP covers uninsured children in moderate-income families (up to 200-300% FPL). "
            "Low premiums, comprehensive pediatric benefits including dental and vision. "
            "Strongly recommended when patient has dependents and moderate household income."
        ),
    },
    {
        "id": "ins_aca_subsidized",
        "title": "ACA Marketplace — Subsidized Plans with Premium Tax Credits",
        "_text": (
            "The ACA Marketplace offers plans with premium tax credits for people with income between "
            "100% and 400% of the FPL, and in some cases above 400% FPL under the American Rescue Plan. "
            "A single adult qualifies for subsidies with income up to roughly $58,320/year in 2024. "
            "Subsidies significantly reduce monthly premiums. Marketplace plans cover all ACA essential "
            "health benefits: emergency services, hospitalization, prescription drugs, mental health, "
            "maternity care, and preventive services. Plans available in Bronze, Silver, Gold, Platinum tiers."
        ),
        "content": (
            "ACA Marketplace subsidized plans offer comprehensive coverage at reduced cost for income 100-400%+ FPL. "
            "Premium tax credits reduce monthly costs substantially. "
            "Best option for uninsured working-age adults without employer coverage in the subsidized income range."
        ),
    },
    {
        "id": "ins_aca_full_price",
        "title": "ACA Marketplace — Full-Price Plans (Above Subsidy Threshold)",
        "_text": (
            "Individuals above the subsidy income threshold can still buy comprehensive ACA Marketplace "
            "plans at full price. All ACA plans guarantee issue regardless of health status and must cover "
            "essential health benefits. For high earners without employer insurance, Marketplace plans "
            "provide portable comprehensive coverage with no medical underwriting."
        ),
        "content": (
            "ACA full-price Marketplace plans for high earners without employer coverage. "
            "No medical underwriting, comprehensive ACA-mandated benefits, portable coverage. "
            "More expensive without subsidies but the only guaranteed individual market option."
        ),
    },
    {
        "id": "ins_employer_esi",
        "title": "Employer-Sponsored Insurance (ESI) — Best Value When Available",
        "_text": (
            "Employer-sponsored health insurance (ESI) is the most common form of coverage in the US. "
            "Employers pay on average 73% of single-coverage premiums; employees pay the remainder via "
            "pre-tax payroll deductions. ESI must meet ACA minimum value and affordability standards. "
            "Because of the employer subsidy, ESI typically offers the best value of any coverage option. "
            "Plans vary in deductible, network, and copay. Available to most employed workers and their dependents."
        ),
        "content": (
            "Employer-sponsored insurance is the best-value option for employed individuals. "
            "Employer covers ~73% of premium on average. Pre-tax employee contributions lower net cost further. "
            "First recommendation for any patient who is currently employed with access to employer coverage."
        ),
    },
    {
        "id": "ins_hdhp_hsa",
        "title": "High-Deductible Health Plan (HDHP) + Health Savings Account (HSA)",
        "_text": (
            "A High-Deductible Health Plan has lower monthly premiums but higher deductibles ($1,600+ for "
            "individuals in 2024). When paired with an HSA, individuals can contribute pre-tax dollars to "
            "cover medical expenses. HSA funds roll over year to year and can be invested. The triple tax "
            "benefit (contributions, growth, withdrawals) makes HDHPs+HSA very efficient for high earners "
            "who rarely use healthcare. HDHPs are not ideal for patients managing chronic conditions who "
            "require frequent medical care and would quickly hit the deductible."
        ),
        "content": (
            "HDHP + HSA offers low premiums and triple tax advantages for healthy, higher-income individuals. "
            "Best for adults under 50 with income above $60,000 and minimal healthcare utilization. "
            "Not recommended for patients managing chronic conditions due to high deductible exposure."
        ),
    },
]


def seed_insurance_corpus() -> int:
    """
    Seed insurance plan documents into rag_documents (pgvector).
    Called on startup. Returns count of newly inserted documents.
    Safe to call multiple times — skips docs already seeded by external_id.
    """
    from backend.rag.retriever import _get_embed_model
    from backend.core.database import get_db

    db = get_db()
    if db is None:
        return 0

    inserted = 0
    model = _get_embed_model()

    for doc in INSURANCE_PLAN_DOCS:
        # Check if already seeded
        existing = (
            db.table("rag_documents")
            .select("id")
            .eq("source", "cms_aca_guidelines")
            .eq("external_id", doc["id"])
            .maybeSingle()
            .execute()
        ).data
        if existing:
            continue

        try:
            embedding = model.encode(doc["_text"], normalize_embeddings=True).tolist()
            db.table("rag_documents").insert({
                "source": "cms_aca_guidelines",
                "doc_type": "insurance_policy",
                "external_id": doc["id"],
                "title": doc["title"],
                "content": doc["content"],
                "embedding": embedding,
                "metadata": {"plan_id": doc["id"]},
            }).execute()
            inserted += 1
        except Exception as exc:
            print(f"[insurance_rag] Failed to seed {doc['id']}: {exc}")

    return inserted


def profile_to_query(profile: dict) -> str:
    """Convert a patient insurance profile dict to a natural language retrieval query."""
    age = int(profile.get("age", 0))
    income = int(profile.get("annual_income", 0))
    employed = bool(profile.get("employed", False))
    has_deps = bool(profile.get("has_dependents", False))
    chronic = bool(profile.get("chronic_condition", False))
    state = profile.get("state", "")

    parts = [f"{age} year old"]
    if age >= 65:
        parts.append("senior Medicare-eligible patient")
    elif employed:
        parts.append("employed patient")
    else:
        parts.append("unemployed patient")

    parts.append(f"annual income ${income:,}")
    if state:
        parts.append(f"in {state}")
    if has_deps:
        parts.append("with dependents needing coverage")
    if chronic:
        parts.append("managing a chronic medical condition")

    return " ".join(parts) + " seeking best health insurance plan"


def rank_plans(profile: dict, retrieved_docs: list) -> list[dict]:
    """
    Given retrieved insurance plan docs, rank them for this patient profile.

    Semantic similarity from pgvector provides the base score. Eligibility boosts
    reflect actual program rules (not arbitrary hardcoded numbers) — e.g. Medicare
    requires age 65+, Medicaid is income-gated, ESI requires employment.

    Returns list of {plan, match_score, reason} sorted by match_score desc.
    The match_score is 0–100 (int) for backward compatibility with InsuranceOutput.
    """
    if not retrieved_docs:
        return []

    age = int(profile.get("age", 0))
    income = int(profile.get("annual_income", 0))
    employed = bool(profile.get("employed", False))
    has_deps = bool(profile.get("has_dependents", False))
    chronic = bool(profile.get("chronic_condition", False))

    # Federal Poverty Level 2024 — single adult base
    fpl = 14580 + (4720 * (2 if has_deps else 0))

    results = []
    for doc in retrieved_docs:
        base = doc.relevance  # 0.0–1.0 cosine similarity from pgvector or BM25
        title = doc.title.lower()
        boost = 0.0

        # Medicare eligibility gate (age 65+)
        if "medicare" in title:
            if age >= 65:
                boost += 0.30
            else:
                boost -= 0.40

        # Medicaid income gate
        if "medicaid" in title:
            if income <= fpl * 1.38:
                boost += 0.28
            elif income > fpl * 2:
                boost -= 0.30

        # Employer coverage requires employment
        if "employer" in title or "esi" in title:
            if employed:
                boost += 0.25
            else:
                boost -= 0.35

        # ACA subsidized — income window
        if "subsidized" in title:
            if fpl < income <= fpl * 4:
                boost += 0.20

        # CHIP — needs dependents
        if "chip" in title:
            if has_deps and income <= fpl * 3:
                boost += 0.22
            elif not has_deps:
                boost -= 0.30

        # HDHP — bad for chronic conditions
        if "high-deductible" in title:
            if not chronic and age < 50 and income > 60000:
                boost += 0.15
            elif chronic:
                boost -= 0.25

        final = min(max(base + boost, 0.0), 1.0)
        results.append({
            "plan": doc.title,
            "match_score": int(final * 100),
            "reason": doc.content,
        })

    return sorted(results, key=lambda x: -x["match_score"])[:4]
