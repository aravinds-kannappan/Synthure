"""
RAG-based insurance plan matcher.

Replaces the hardcoded rule engine. Embeddings use the HF Inference API
(same all-MiniLM-L6-v2 model, no local PyTorch required).
"""
from __future__ import annotations
from typing import Optional


# ── Insurance plan knowledge base (CMS/ACA public guidelines) ───────────────────────

INSURANCE_PLAN_DOCS = [
    {
        "id": "ins_medicare_original",
        "title": "Medicare Parts A & B — Federal Health Insurance for Seniors",
        "_text": (
            "Medicare is federal health insurance for people 65 or older and for some younger people "
            "with qualifying disabilities. Part A covers inpatient hospital stays, skilled nursing facility "
            "care, hospice, and some home health care at no premium for most enrollees. Part B covers "
            "outpatient physician services, preventive care, durable medical equipment, and lab tests with "
            "a standard monthly premium. Eligibility: age 65 or older, or certain qualifying disabilities."
        ),
        "content": (
            "Medicare covers Americans aged 65+ and qualifying disabled individuals. "
            "Part A covers inpatient/hospital care (no premium for most). "
            "Part B covers outpatient/physician services. "
            "Top priority for any patient aged 65 or older."
        ),
    },
    {
        "id": "ins_medicare_advantage",
        "title": "Medicare Advantage (Part C) — Private Medicare Bundled Plans",
        "_text": (
            "Medicare Advantage plans cover everything Original Medicare covers plus often prescription "
            "drugs (Part D), vision, dental, and hearing. Many plans charge no additional premium beyond "
            "the Part B premium. Popular for beneficiaries seeking coordinated care and extra benefits. "
            "Eligibility: same as Original Medicare (age 65+ or qualifying disability)."
        ),
        "content": (
            "Medicare Advantage (Part C) bundles Parts A, B, and usually D into a private plan. "
            "Often includes dental, vision, hearing benefits. Best for patients 65+ wanting coordinated care."
        ),
    },
    {
        "id": "ins_medicaid",
        "title": "Medicaid — State/Federal Low-Income Health Coverage",
        "_text": (
            "Medicaid is a joint federal-state program providing health coverage to eligible low-income "
            "adults, children, pregnant women, elderly adults, and people with disabilities. In expansion "
            "states, adults under 65 with income up to 138% of the Federal Poverty Level (FPL) qualify. "
            "The FPL for a single adult is $14,580/year in 2024. Medicaid covers doctor visits, "
            "hospitalization, prescription drugs, long-term care, and preventive care with minimal cost-sharing."
        ),
        "content": (
            "Medicaid provides near-free comprehensive coverage for low-income individuals. "
            "Income threshold: ~138% FPL (~$20,120/year for a single adult). "
            "Top recommendation for patients at or below 138% FPL."
        ),
    },
    {
        "id": "ins_chip",
        "title": "CHIP — Children's Health Insurance Program",
        "_text": (
            "CHIP provides low-cost health coverage to children in families that earn too much for Medicaid "
            "but cannot afford private insurance. Most states cover children from birth through age 18 with "
            "income limits typically between 200% and 300% of FPL. Low premiums and minimal cost-sharing."
        ),
        "content": (
            "CHIP covers uninsured children in moderate-income families (up to 200-300% FPL). "
            "Strongly recommended when patient has dependents and moderate household income."
        ),
    },
    {
        "id": "ins_aca_subsidized",
        "title": "ACA Marketplace — Subsidized Plans with Premium Tax Credits",
        "_text": (
            "The ACA Marketplace offers plans with premium tax credits for people with income between "
            "100% and 400% of the FPL, and in some cases above 400% FPL. A single adult qualifies for "
            "subsidies with income up to roughly $58,320/year in 2024. Plans cover all ACA essential "
            "health benefits including emergency services, hospitalization, prescription drugs, mental health."
        ),
        "content": (
            "ACA subsidized plans offer comprehensive coverage at reduced cost for income 100-400%+ FPL. "
            "Best option for uninsured working-age adults without employer coverage."
        ),
    },
    {
        "id": "ins_aca_full_price",
        "title": "ACA Marketplace — Full-Price Plans (Above Subsidy Threshold)",
        "_text": (
            "Individuals above the subsidy income threshold can still buy ACA Marketplace plans at full price. "
            "All ACA plans guarantee issue regardless of health status and must cover essential health benefits. "
            "For high earners without employer insurance, Marketplace plans provide portable comprehensive coverage."
        ),
        "content": (
            "ACA full-price plans for high earners without employer coverage. "
            "No medical underwriting, comprehensive ACA benefits, portable coverage."
        ),
    },
    {
        "id": "ins_employer_esi",
        "title": "Employer-Sponsored Insurance (ESI) — Best Value When Available",
        "_text": (
            "Employer-sponsored health insurance (ESI) is the most common form of coverage in the US. "
            "Employers pay on average 73% of single-coverage premiums. Employees pay the remainder via "
            "pre-tax payroll deductions. ESI must meet ACA minimum value and affordability standards. "
            "Because of the employer subsidy, ESI typically offers the best value of any coverage option."
        ),
        "content": (
            "Employer-sponsored insurance is the best-value option for employed individuals. "
            "Employer covers ~73% of premium on average. First recommendation for any employed patient."
        ),
    },
    {
        "id": "ins_hdhp_hsa",
        "title": "High-Deductible Health Plan (HDHP) + Health Savings Account (HSA)",
        "_text": (
            "A High-Deductible Health Plan has lower monthly premiums but higher deductibles ($1,600+ in 2024). "
            "When paired with an HSA, individuals can contribute pre-tax dollars for medical expenses. "
            "HSA funds roll over year to year and can be invested. Best for healthy higher-income individuals "
            "who rarely use healthcare. Not ideal for patients managing chronic conditions."
        ),
        "content": (
            "HDHP + HSA offers low premiums and triple tax advantages. "
            "Best for healthy adults under 50 with income above $60,000 and minimal healthcare utilization."
        ),
    },
]


def seed_insurance_corpus() -> int:
    """
    Seed insurance plan documents into rag_documents (pgvector).
    Called on startup. Returns count of newly inserted documents.
    Uses HF Inference API for embeddings — no local PyTorch needed.
    """
    from backend.rag.retriever import embed_text
    from backend.core.database import get_db

    db = get_db()
    if db is None:
        return 0

    inserted = 0
    for doc in INSURANCE_PLAN_DOCS:
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
            embedding = embed_text(doc["_text"])
            if not embedding:
                continue  # HF token not set or API unavailable; skip silently
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
    age      = int(profile.get("age", 0))
    income   = int(profile.get("annual_income", 0))
    employed = bool(profile.get("employed", False))
    has_deps = bool(profile.get("has_dependents", False))
    chronic  = bool(profile.get("chronic_condition", False))
    state    = profile.get("state", "")

    parts = [f"{age} year old"]
    parts.append("senior Medicare-eligible patient" if age >= 65 else ("employed patient" if employed else "unemployed patient"))
    parts.append(f"annual income ${income:,}")
    if state:    parts.append(f"in {state}")
    if has_deps: parts.append("with dependents needing coverage")
    if chronic:  parts.append("managing a chronic medical condition")
    return " ".join(parts) + " seeking best health insurance plan"


def rank_plans(profile: dict, retrieved_docs: list) -> list[dict]:
    """
    Rank retrieved insurance plan docs for this patient profile.
    Eligibility boosts reflect actual program rules on top of semantic similarity.
    """
    if not retrieved_docs:
        return []

    age      = int(profile.get("age", 0))
    income   = int(profile.get("annual_income", 0))
    employed = bool(profile.get("employed", False))
    has_deps = bool(profile.get("has_dependents", False))
    chronic  = bool(profile.get("chronic_condition", False))
    fpl      = 14580 + (4720 * (2 if has_deps else 0))

    results = []
    for doc in retrieved_docs:
        base  = doc.relevance
        title = doc.title.lower()
        boost = 0.0

        if "medicare" in title:
            boost += 0.30 if age >= 65 else -0.40
        if "medicaid" in title:
            boost += 0.28 if income <= fpl * 1.38 else (-0.30 if income > fpl * 2 else 0.0)
        if "employer" in title or "esi" in title:
            boost += 0.25 if employed else -0.35
        if "subsidized" in title and fpl < income <= fpl * 4:
            boost += 0.20
        if "chip" in title:
            boost += 0.22 if has_deps and income <= fpl * 3 else (-0.30 if not has_deps else 0.0)
        if "high-deductible" in title:
            boost += 0.15 if not chronic and age < 50 and income > 60000 else (-0.25 if chronic else 0.0)

        final = min(max(base + boost, 0.0), 1.0)
        results.append({"plan": doc.title, "match_score": int(final * 100), "reason": doc.content})

    return sorted(results, key=lambda x: -x["match_score"])[:4]
