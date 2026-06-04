# ◈ Synthure

> *One platform. Four stakeholders. Zero administrative burden.*

Synthure is a clinical AI platform built around a single premise: a physician should only ever do medicine. Everything downstream of a clinical note — prior authorizations, insurance claims, patient education, denial appeals, billing reconciliation, employer benefits optimization — should happen automatically, correctly, and without anyone clicking through a queue.

A clinical note enters once. The patient receives their health explained in plain English, their insurance cost breakdown, and follow-up reminders — automatically. The physician gets back to medicine. The hospital's revenue cycle runs itself. The employer's benefits are continuously optimized.

---

## Table of Contents

1. [The Four Portals](#the-four-portals)
2. [The Autonomy Model](#the-autonomy-model)
3. [AI Features](#ai-features)
4. [Machine Learning](#machine-learning)
5. [Architecture](#architecture)
6. [Data Sources](#data-sources)
7. [Database Schema](#database-schema)
8. [Repository Structure](#repository-structure)
9. [Tech Stack](#tech-stack)
10. [Quick Start](#quick-start)
11. [API Reference](#api-reference)

---

## The Four Portals

Synthure presents four different interfaces backed by a single database and AI engine. Role is detected at login and the user is routed automatically — no configuration required.

### Patient

Patients do nothing except read what arrives. After every visit:

- Their clinical note is translated into plain English at a 6th-grade reading level
- Their insurance cost breakdown — deductible met, OOP remaining, estimated share — is computed and displayed
- Education materials sourced from MedlinePlus (conditions) and DailyMed (medications) arrive via SMS
- Their claim status is shown in plain language, not billing codes
- Follow-up reminders are sent automatically
- Financial assistance programs are surfaced when out-of-pocket costs exceed a threshold

The patient journey timeline is a complete chronological record of every visit, claim, action taken, and communication sent — updated in real time as their care team acts.

### Physician

The physician enters a clinical note. Everything downstream — prior auths, claims, referrals, patient education, follow-up scheduling — is handled automatically. The physician receives one notification for clinical-to-clinical communications requiring a one-tap sign-off. No paperwork. No billing admin. No follow-up phone calls.

The **Navigator** is the core physician interface: a unified intake that accepts a typed note, uploaded PDF, FHIR pull, or manual form. It runs the jargon decoder, insurance matcher, and claim adjudication pipelines in parallel, populates the patient's journey timeline, queues all autonomous Tier 1 actions, and opens a conversational chat window for follow-up questions about the encounter.

The physician dashboard is a feed of actions completed autonomously today, not a to-do list.

### Hospital

Full revenue cycle managed automatically:

- Claims submitted, eligibility verified, denials caught before they happen
- Appeal letters generated and filed automatically when denials occur
- Payments reconciled against claims; underpayments flagged
- AR aging tracked across 0–30, 31–60, 61–90, and 90+ day buckets
- Collections workflow advanced stage by stage automatically

Beyond RCM, the hospital portal covers operations that currently require staff time: HIPAA audit reports, CMS quality measures, revenue forecasting (30/60/90-day projections from live AR data), payer contract renewal alerts, provider credentialing expiration tracking, and benchmark comparisons against real CMS Medicare payment data.

### Employer

Benefits plan continuously optimized based on real workforce health data. Open enrollment managed automatically. ACA 1095-C compliance reports compiled and deadline-tracked. COBRA notices generated and sent within the required 44-day window automatically when a qualifying event is recorded. Monthly admin package — utilization report, cost per employee, high-cost category summary, optimizer recommendation — generated on the 1st of every month without anyone requesting it.

---

## The Autonomy Model

Every action Synthure can take is classified into one of three tiers. Tier classification is enforced in code before any action executes.

### Tier 1 — Fully Autonomous

Executes immediately when triggered. Patient consented at signup. No approval needed.

| Trigger | Autonomous action |
|---|---|
| Clinical note processed | Prior auth filed with payer |
| Clinical note processed | Claim staged and submitted |
| Clinical note processed | Patient education sent via SMS |
| Clinical note processed | Follow-up reminder sent to patient |
| Clinical note processed | Eligibility verified |
| Clinical note processed | Cost estimate sent to patient |
| OOP cost ≥ threshold | Financial assistance programs searched and listed |
| Denial event created | Appeal letter generated and filed |
| Payment received | Reconciled against claim; underpayment flagged |
| AR aging > 90 days | Collections workflow started |
| COBRA qualifying event recorded | COBRA notice generated and sent |
| Enrollment period opens | All eligible employees notified |
| ACA reporting deadline approaching | 1095-C data compiled |
| Plan renewal window | Optimizer analysis run |

### Tier 2 — One-Tap

Only physician-to-physician clinical content. A push notification, one tap, done. Can be pre-authorized by template to eliminate entirely.

- Referral letter to specialist containing clinical content
- Discharge summary to patient's PCP
- Care coordination message to another treating provider

### Tier 3 — Never Autonomous

Hard stops regardless of any consent or configuration:

- Prescribing or changing medications
- Differential diagnosis
- Legal medical documents
- Changing a treatment plan

---

## AI Features

### Jargon Decoder

A multi-stage RAG pipeline converts dense clinical notes into plain English. Named medical entities are extracted using the OpenMed biomedical NER model (`d4data/biomedical-ner-all`, 107 entity types), then each entity is looked up against the pgvector knowledge base (ICD-10-CM descriptions, CPT profiles). Claude generates patient-facing explanations grounded entirely in the retrieved context — no hallucinated clinical claims.

Every generation call uses Claude's `tool_use` with a strict output schema. A post-generation citation validation pass strips any document IDs referenced that were not in the retrieved set. The count of stripped hallucinations is surfaced in the pipeline trace.

Output includes: plain-English summary, per-condition explanations with source citations, medication instructions from DailyMed, urgency level (`now` / `soon` / `routine`), and follow-up instructions in patient language.

### Insurance Matcher

A deterministic rule engine scores all major coverage options — Medicare, Medicaid, ACA Marketplace (subsidized and full-price), CHIP, ESI, HDHP+HSA — against the patient's age, income, employment status, dependent count, and chronic condition flags. FPL calculation uses current CMS figures. Subsidy eligibility, CSR tiers, and Medicaid thresholds are computed precisely.

Claude then generates a personalized guidance overlay on top of the rule-engine output, grounded in retrieved insurance policy documents. The final response includes the ranked plan list from the deterministic engine plus an AI insight, key consideration, and any warnings.

### Claim Routing and Adjudication

Claims are scored for complexity across six signals:

| Signal | Max contribution |
|---|---|
| Diagnosis code count (capped at 3+) | 30 pts |
| Excessive dx codes (>3) | 20 pts |
| Prior denial on record | 25 pts |
| Claim amount >$10k | 20 pts |
| Experimental/investigational treatment | 25 pts |
| Out-of-network provider | 20 pts |

Claims with complexity < 60 route to `claude-haiku-4-5` (standard). Claims ≥ 60 route to `claude-sonnet-4-6` (frontier). The adjudication agent retrieves denial pattern documents and CPT/ICD-10 profiles from pgvector, then produces a structured decision — approved, pending review, or denied — with source citations, confidence score, plain-English reasoning, and a step-by-step appeal path.

### Denial Prevention

Before a claim is submitted, the ML denial predictor scores it for denial probability (0–100). RAG retrieves payer-specific denial patterns for the procedure + diagnosis combination. Claude generates 2–3 specific prevention steps when risk exceeds 40%. The risk score, risk level (low/medium/high), and prevention suggestions are shown to the physician before submission — not as a blocker, as an advisory.

### Prior Authorization Automation

Every procedure in a clinical note is checked against payer PA requirements. If PA is required, the payer-specific form is auto-filled from the patient's encounter data and submitted. A per-payer LogisticRegression model predicts approval probability, surfaced alongside the submission confirmation. PA status is tracked through its full lifecycle. Expiration alerts are issued before auth windows close.

### Discharge Education

Discharge instructions are generated at a 6th-grade reading level. Content is sourced from MedlinePlus (conditions, keyed by ICD-10 code) and DailyMed (medications). Multi-language output is supported via Claude's `language` parameter. Readability is scored via a Flesch-Kincaid implementation before delivery.

A 30-day readmission risk score is computed from the patient's age, condition count, medication count, and ICD-10 risk flags (CHF, COPD, DM, CKD) using the calibrated readmission scorer. The score is attached to the discharge record and shown as a badge on the physician's patient card.

Instructions are sent to the patient via SMS automatically (Tier 1) and stored in the patient portal.

### Appeal Generation

When a denial event occurs, the CARC code is extracted, the source claim is found, and Claude generates a formal Level 1 appeal letter with clinical context and policy citations. The letter is filed automatically (Tier 1). Outcome is tracked — won/lost/withdrawn — and feeds back into the payer scorecard.

### Document Intelligence

Upload any healthcare document and Synthure classifies it and acts:

| Document type | Action taken |
|---|---|
| Denial letter | Extract CARC code → find claim → queue appeal |
| EOB | Reconcile payments against claims |
| Insurance card photo | Claude Vision OCR → populate `patient_insurance` record |
| Lab result | Attach to patient record → notify physician |
| ERA/835 | Post payments, flag underpayments |
| Discharge summary | Add to record, mark `visible_to_patient` |

Insurance card OCR uses Claude Vision to extract `plan_name`, `member_id`, `group_number`, and `copay` from a photo. The extracted data auto-populates the patient's insurance coverage record.

### Formulary Checker

Every prescribed medication is checked against the patient's plan formulary. If PA is required for a drug, a therapeutically equivalent alternative without PA is surfaced as a non-mandatory suggestion. If a drug isn't covered, alternatives are listed. Shown to the physician before prescribing — never a blocker.

### Financial Assistance Finder

When estimated out-of-pocket cost exceeds $500, Synthure automatically searches manufacturer assistance programs (e.g., AbbVie myAbbVie Assist, Novo Nordisk Patient Assistance), federal programs (Extra Help/LIS for low-income Medicare patients), and the NeedyMeds database. Matching programs appear in the patient portal without the patient asking.

### Clinical Decision Support

Detected ICD-10 conditions are cross-referenced with ACC/AHA (hypertension, heart failure), ADA (type 2 diabetes), and KDIGO (CKD) guidelines. Gaps are surfaced as non-mandatory suggestions to the physician — missing screenings, underutilized evidence-based medications, overdue follow-ups. The physician can acknowledge or ignore. These are never mandatory.

### Benefits Optimizer

Anonymized aggregate workforce health utilization is analyzed by Claude. The current plan's cost structure is compared against plausible alternatives. Projected annual savings are calculated with specific dollar amounts. The recommendation is generated with rationale (e.g., “Switch 40% of low-utilization employees under 40 to HDHP + HSA — projected savings: $18,400/year”). Runs automatically at plan renewal window and monthly.

---

## Machine Learning

All sklearn models are wrapped with `CalibratedClassifierCV` using Platt scaling. Raw probabilities are replaced with calibrated, interpretable scores throughout. Every model falls back to a rule-based scoring function before enough real labeled outcomes accumulate to retrain.

### Denial Predictor

**Algorithm:** `GradientBoostingClassifier` (200 estimators, depth 4, learning rate 0.05) + `CalibratedClassifierCV`

**Features:**
- Diagnosis code count
- Claim amount
- Out-of-network flag
- Prior denial flag
- Experimental/investigational flag
- Complexity score (0–100)

**Training data:** ICD-10 code distributions drawn from `Inje/SYMPTOMS-COT-ICD10-2024` (12,132 real clinical cases); procedure complexity scores from `DataFog/medical-transcription-instruct` (`complexity_score` float column, 38,924 rows); claim amounts sampled from a log-normal distribution calibrated to CMS average Medicare office visit charges (~$1,808 median). Denial labels generated from CMS-documented multipliers: out-of-network ×4.0, prior denial ×3.5, experimental ×10.0, high amount ×2.0, against an 8% national base denial rate.

**Retrain threshold:** 500+ real labeled claim outcomes in your `claims` table.

### Prior Authorization Predictor

**Algorithm:** `LogisticRegression` (one model per payer type: medicare, medicaid, commercial, unknown) + `CalibratedClassifierCV`

**Features:**
- Surgical procedure flag (CPT prefix-based)
- Imaging procedure flag
- Chronic diagnosis present (ICD-10 chapter-based)
- Patient age bucket (0: <18, 1: 18–39, 2: 40–64, 3: 65+)
- Diagnosis code count

Per-payer models improve as PA outcome data accumulates. Before enough data exists, a deterministic fallback estimates probability from CPT code category and ICD-10 chapter.

### Readmission Risk Scorer

**Algorithm:** `LogisticRegression` (L2 regularization, C=1.0) + `CalibratedClassifierCV`

**Features:** Age (normalized 0–1), condition count (normalized), medication count (normalized), high-risk ICD-10 flag

**High-risk ICD-10 prefixes:** I50 (CHF), J44 (COPD), E11 (DM2), N18 (CKD), J18 (PNA), I21 (AMI), G20 (Parkinson’s), F32 (MDD)

**Training data:** ICD-10 code frequency distributions from `birgermoell/icd10-clinical-notes` (1,802 real clinical notes, 34 languages — English subset used). Age distribution calibrated to CMS Medicare beneficiary statistics (mean 73.9, std 10.2). Readmission label probabilities calibrated to CMS HRRP 2023 published rates: CHF 23.3%, COPD 19.6%, AMI 17.2%, pneumonia 16.8%, CKD 21.0%, base rate 8.3%.

### Feature Store

Patient and claim features are computed on creation and cached in the `feature_store` Supabase table with a 24-hour TTL. All ML models read from the feature store, not raw tables. This ensures consistent feature computation across the denial predictor, PA predictor, and readmission scorer.

### NER Pipeline

Medical entity extraction runs in two stages:

1. **Primary:** `d4data/biomedical-ner-all` via HuggingFace Inference API — 107 biomedical entity types trained on the MACCROBAT clinical case report corpus. Entity groups are mapped to `disease`, `medication`, `anatomy`, and `other` categories.
2. **Fallback:** `blaze999/Medical-NER` — 41 medical entities, DeBERTa v3-base fine-tuned on PubMED.
3. **Final fallback:** Claude Haiku entity extraction via `tool_use` if both HuggingFace calls fail.

### RAG Pipeline

All documents are chunked at 512 tokens with 50-token overlap using a character-level approximation. Each chunk is embedded via `sentence-transformers/all-MiniLM-L6-v2` (768 dimensions, free HuggingFace Inference API) and stored in pgvector. Retrieval uses cosine similarity with IVFFlat indexing (100 lists). Doc-type filtering isolates denial patterns, medical codes, and policy documents in separate targeted retrieval passes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   frontend/ (Next.js 14)                    │
│                                                              │
│  Patient portal    Physician portal                          │
│  Hospital portal   Employer portal                           │
│                                                              │
│  Shared components:                                          │
│    AIChip • StatusBadge • JourneyTimeline                   │
│    NotificationBell • DeadlineMonitor                        │
│                                                              │
│  lib/realtime.ts — subscribeToPortalEvents()                 │
│  Supabase postgres_changes → live UI updates                 │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API + Supabase Realtime
┌────────────────────▼────────────────────────────────────────┐
│  api/index.py — Vercel serverless entry point               │
│                                                              │
│  backend/main.py — FastAPI app factory                      │
│  ┃                                                          │
│  ┣━ core/                                                   │
│  ┃   config.py       pydantic-settings env loader           │
│  ┃   database.py     Supabase singleton (service + anon)    │
│  ┃   auth.py         JWT decode + require_role() dependency  │
│  ┃   audit.py        HIPAA PHI access logger                 │
│  ┃   multitenancy.py org_list/get/insert/update helpers      │
│  ┃   realtime.py     emit_event() → realtime_events table   │
│  ┃   autonomy.py     Tier 1/2/3 classification map           │
│  ┃                                                          │
│  ┣━ api/             Route handlers                          │
│  ┃   auth.py         /api/auth/login                        │
│  ┃   patient/        health, coverage, claims, education     │
│  ┃   physician/      navigator, dashboard, prior auths       │
│  ┃   hospital/       crm/, rcm/, operations/, analytics      │
│  ┃   employer/       benefits, enrollment, cobra, aca        │
│  ┃   features/       all 12 AI feature endpoints             │
│  ┃   mle/            prediction endpoints                    │
│  ┃   fhir/           Epic FHIR R4 pull                       │
│  ┃   platform/       webhooks, billing                       │
│  ┃                                                          │
│  ┣━ agents/                                                  │
│  ┃   orchestrator.py    3 core pipelines (jargon/ins/claim)  │
│  ┃   intake_agent.py    any input → PatientEncounterIR      │
│  ┃   action_orchestrator.py  Tier 1/2/3 execution engine    │
│  ┃   entity_extractor.py    OpenMed NER + Claude fallback   │
│  ┃   generator.py       gated tool_use + citation validator  │
│  ┃   actions/           individual action handler modules    │
│  ┃                                                          │
│  ┣━ ml/                                                      │
│  ┃   denial_predictor.py     GradientBoosting + calibration  │
│  ┃   prior_auth_predictor.py LogisticRegression per payer   │
│  ┃   readmission_scorer.py   LogisticRegression L2           │
│  ┃   feature_store.py        24h cached features in DB       │
│  ┃   training/               train_denial.py, train_readmission.py│
│  ┃                                                          │
│  ┗━ rag/                                                     │
│      embedder.py       HuggingFace all-MiniLM-L6-v2         │
│      chunker.py        512-token / 50-overlap               │
│      retriever.py      pgvector cosine similarity           │
│      knowledge_base.py in-memory corpus (demo mode)         │
│      corpus/loaders/   ICD-10, MTSamples, clinical notes    │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│  Supabase                                                    │
│                                                              │
│  PostgreSQL                                                  │
│    9 migrations • 9 domain schemas • ar_aging SQL view       │
│    Row Level Security (patients see own; admins see org)     │
│                                                              │
│  pgvector                                                    │
│    768-dim embeddings • IVFFlat index (100 lists)            │
│    ICD-10 codes • MTSamples • clinical notes • denial patterns│
│                                                              │
│  Realtime                                                    │
│    postgres_changes on realtime_events                       │
│    physician runs Navigator → patient portal updates live    │
│                                                              │
│  Auth                                                        │
│    Supabase Auth (production) • JWT demo mode (development)  │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Gated controlled generation.** All Claude calls use `tool_use` with `tool_choice={"type": "tool", "name": "..."}` — the model is forced to fill a named tool with a strict JSON schema. This eliminates free-form parsing, guarantees schema conformance, and makes hallucinations structurally impossible to miss. A post-generation citation validation pass removes any document IDs not in the retrieved set; the stripped count surfaces in every pipeline trace.

**Intermediate representations.** Every pipeline stage operates on a typed IR dataclass (`PatientEncounterIR`, `ClinicalNoteIR`, `ClaimIR`, `InsuranceProfileIR`) that accumulates fields as it flows through the pipeline. No raw dicts cross agent boundaries.

**Tier enforcement in code.** The `autonomy.py` module maintains a complete map of every action type to its tier. `queue_action()` in the action orchestrator checks tier classification before any execution — Tier 3 actions are rejected at the queue boundary, never reaching an execution path.

**Multi-tenancy by default.** Every DB write goes through `org_insert()` / `org_update()` helpers that automatically inject `org_id`. Every read goes through `org_list()` / `org_get()` that filter by `org_id`. Row Level Security in Supabase provides a second layer of isolation.

**Cross-portal Realtime.** When any Tier 1 action completes, `emit_event()` inserts rows into `realtime_events` — one row per target portal. Supabase Realtime broadcasts `postgres_changes` to connected clients. The patient portal receives live updates when the physician runs Navigator, without polling.

---

## Data Sources

All HuggingFace dataset paths and column names have been verified against the actual dataset schemas.

| Source | Size | Columns used | Purpose |
|---|---|---|---|
| `wangyichen25/ICD-10-CM_Code-Description_Pairs` | 1.43M rows | `output` (code), `input` (description) | ICD-10 RAG corpus |
| `harishnair04/mtsamples` | 4,999 rows | `transcription`, `medical_specialty`, `description` | Clinical note RAG corpus |
| `AGBonnet/augmented-clinical-notes` | 30,000 rows | `full_note`, `idx` | Clinical NLP RAG corpus |
| `DataFog/medical-transcription-instruct` | 38,924 rows | `complexity_score` (float 0–1), `transcription` | Denial predictor training features |
| `Inje/SYMPTOMS-COT-ICD10-2024` | 12,132 rows | `answer` (code), `symptoms`, `chain_of_thought` | Symptom→ICD-10 RAG + denial training |
| `birgermoell/icd10-clinical-notes` | 1,802 rows | `code`, `language`, `journal_note` | Readmission training code distributions |
| `d4data/biomedical-ner-all` | — | 107 entities (MACCROBAT schema) | Primary medical NER |
| `blaze999/Medical-NER` | — | 41 medical entities (PubMED) | Fallback medical NER |
| `sentence-transformers/all-MiniLM-L6-v2` | — | 768-dim | pgvector embeddings |
| MedlinePlus API (NLM) | — | URL per ICD-10 | Patient condition education |
| DailyMed API (NLM) | — | URL + instructions per drug | Medication guides |
| NeedyMeds | — | — | Financial assistance programs |
| CMS open data API | — | `avg_mdcr_pymt_amt` per CPT code | Medicare payment benchmarks |
| CMS HRRP 2023 | — | Published 30-day readmission rates | Readmission model label calibration |
| CMS Medicare payment lag statistics | — | Collection rates by aging bucket | Revenue forecasting |

---

## Database Schema

Nine migrations applied in sequence. Every table includes `org_id` for multi-tenant isolation. RLS policies are in migration 009.

| Migration | Tables created |
|---|---|
| `001_extensions` | Enables `uuid-ossp`, `vector` (pgvector), `pg_cron` |
| `002_core` | `orgs`, `users`, `notifications`, `care_events`, `audit_logs`, `realtime_events` |
| `003_crm` | `patients`, `patient_insurance`, `patient_conditions`, `patient_medications`, `providers`, `payers`, `patient_documents`, `communications`, `patient_consents` |
| `004_rcm` | `claims` (with state machine), `claim_transitions`, `eligibility_checks`, `prior_auths`, `denial_events`, `appeals`, `payments`, `collections`, plus `ar_aging` view |
| `005_features` | `encounters`, `action_queue`, `discharge_records` |
| `006_employer` | `employer_groups`, `benefit_plans`, `enrollments`, `cobra_events`, `aca_reports` |
| `007_mle` | `embeddings` (pgvector 768-dim with IVFFlat index), `model_versions`, `model_evals`, `feature_store`, `ab_experiments`, `prompt_versions` |
| `008_platform` | `webhooks`, `api_keys`, `billing_usage` |
| `009_rls` | Row Level Security — hospital admins see org-scoped records; patients see only their own; care events filtered by `portal_visibility` array |

The `claims` table implements a full state machine. Valid transitions:

```
draft → validated → submitted → acknowledged → adjudicated → paid
                                              → denied → appealed → adjudicated
any → voided
```

Every transition is recorded in `claim_transitions` with actor, timestamp, and note. Invalid transitions return HTTP 422.

---

## Repository Structure

```
synthure/
│
├── api/
│   └── index.py               Vercel serverless entry point — imports FastAPI app
│
├── backend/
│   ├── main.py                FastAPI app factory + all routers
│   ├── core/
│   │   ├── config.py            pydantic-settings: all env vars with defaults
│   │   ├── database.py          Supabase service-role + anon client singletons
│   │   ├── auth.py              JWT decode, get_current_user(), require_role()
│   │   ├── audit.py             async HIPAA audit log writer
│   │   ├── multitenancy.py      org_list / org_get / org_insert / org_update
│   │   ├── realtime.py          emit_event() → realtime_events table
│   │   └── autonomy.py          Tier 1/2/3 map, classify(), is_autonomous()
│   │
│   ├── api/
│   │   ├── auth.py              /api/auth/login — JWT with role + org_id
│   │   ├── patient/             health.py, coverage.py, claims.py,
│   │   │                        education.py, notifications.py, consents.py
│   │   ├── physician/           navigator.py, dashboard.py
│   │   ├── hospital/
│   │   │   ├── crm/               patients.py, providers.py, payers.py,
│   │   │   │                     documents.py, communications.py
│   │   │   ├── rcm/               claims.py, eligibility.py, coding.py,
│   │   │   │                     ar.py, denials.py, appeals.py,
│   │   │   │                     payments.py, collections.py
│   │   │   ├── operations/        compliance.py, forecasting.py,
│   │   │   │                     credentialing.py, contracts.py
│   │   │   ├── analytics.py       live monthly metrics from DB
│   │   │   └── benchmarks.py      practice vs CMS open data API
│   │   ├── employer/            benefits.py, enrollment.py, cobra.py,
│   │   │                        compliance.py, reports.py
│   │   ├── features/            jargon.py, insurance.py, denial_prevention.py,
│   │   │                        prior_auth.py, discharge.py,
│   │   │                        document_intelligence.py, formulary.py,
│   │   │                        financial_assistance.py, clinical_decision.py
│   │   ├── mle/                 predictions.py (denial risk, PA approval, readmission)
│   │   ├── fhir/                r4.py (Epic FHIR R4 pull)
│   │   └── platform/            webhooks.py, billing.py
│   │
│   ├── agents/
│   │   ├── orchestrator.py      3 pipeline functions: jargon, insurance, claim
│   │   ├── intake_agent.py      PatientEncounterIR + from_note() / from_fhir()
│   │   ├── action_orchestrator.py  queue_action(), approve_tier2(), _dispatch()
│   │   ├── entity_extractor.py  OpenMed NER (HF API) + Claude tool_use fallback
│   │   ├── generator.py         gated tool_use generation + citation validation
│   │   └── actions/
│   │       ├── send_patient_education.py    Twilio SMS
│   │       ├── send_followup_reminder.py    Twilio SMS
│   │       ├── submit_prior_auth.py         inserts prior_auths record
│   │       ├── submit_claim.py              transitions claim to submitted
│   │       ├── generate_appeal.py           Claude appeal + files denial
│   │       └── send_cobra_notice.py         SendGrid HTML notice
│   │
│   ├── ml/
│   │   ├── denial_predictor.py      GradientBoosting + rule-based fallback
│   │   ├── prior_auth_predictor.py  LogisticRegression per payer type
│   │   ├── readmission_scorer.py    LogisticRegression L2 + CMS calibration
│   │   ├── calibration.py           CalibratedClassifierCV wrapper
│   │   ├── feature_store.py         24h cached patient + claim features
│   │   ├── models/                  .pkl artifacts (generated by training scripts)
│   │   └── training/
│   │       ├── train_denial.py      HF datasets + CMS denial rate calibration
│   │       └── train_readmission.py HF datasets + CMS HRRP 2023 rates
│   │
│   ├── rag/
│   │   ├── embedder.py          HuggingFace all-MiniLM-L6-v2
│   │   ├── chunker.py           512-token / 50-token-overlap chunker
│   │   ├── retriever.py         pgvector cosine similarity retrieval
│   │   ├── knowledge_base.py    static in-memory corpus for demo mode
│   │   └── corpus/loaders/
│   │       ├── load_icd10.py            ICD-10-CM pairs → pgvector
│   │       ├── load_mtsamples.py        MTSamples transcriptions → pgvector
│   │       ├── load_clinical_notes.py   AGBonnet notes → pgvector
│   │       ├── load_icd10_symptoms.py   symptom→ICD-10 CoT → pgvector
│   │       └── update_pipeline.py       nightly refresh (pg_cron)
│   │
│   ├── integrations/
│   │   ├── anthropic_client.py  Claude client with prompt caching
│   │   ├── huggingface.py       embeddings + d4data NER (primary) + blaze999 (fallback)
│   │   ├── twilio.py            SMS with demo-mode fallback
│   │   ├── sendgrid.py          email with demo-mode fallback
│   │   └── fhir_client.py       Epic FHIR R4: fetch_patient(), fetch_encounter_documents()
│   │
│   ├── prompts/
│   │   ├── jargon.py, insurance.py, claims.py   system prompts + tool schemas
│   │   └── registry.py          DB-backed prompt versioning with in-process cache
│   │
│   └── tests/
│       ├── conftest.py              TestClient fixtures + auth headers
│       ├── test_portals/test_auth.py
│       ├── test_features/           test_jargon.py, test_insurance.py, test_claims.py
│       ├── test_ml/test_predictions.py
│       └── evals/
│           ├── eval_jargon.py       gold-standard ICD-10 accuracy scorer
│           └── datasets/jargon_gold.json
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/login/page.tsx    login + 4 quick demo role chips
│   │   ├── page.tsx                 reads role → routes to portal home
│   │   ├── patient/                 dashboard, coverage, claims, education,
│   │   │                           documents, messages
│   │   ├── physician/               dashboard (one-tap feed), navigator
│   │   │                           (3-panel output), patients/[id]
│   │   ├── hospital/                crm/ (patients, providers, payers)
│   │   │                           rcm/ (claims kanban, AR aging chart,
│   │   │                           denials), analytics
│   │   └── employer/                dashboard (LineChart cost trend +
│   │                               optimizer card), benefits, enrollment,
│   │                               cobra, compliance, reports
│   ├── components/shared/
│   │   ├── AIChip.tsx               ✦ indigo indicator on AI-generated elements
│   │   ├── StatusBadge.tsx          colour-coded claim/PA status pill
│   │   ├── NotificationBell.tsx     unread count + Tier 2 one-tap buttons
│   │   ├── JourneyTimeline.tsx      patient journey event list with AI/Auto chips
│   │   └── DeadlineMonitor.tsx      urgency-coloured deadline alerts
│   └── lib/
│       ├── api.ts                   typed fetch wrapper for all endpoints
│       ├── realtime.ts              subscribeToPortalEvents() → Supabase Realtime
│       ├── portal.ts                PORTAL_HOME role→route + PORTAL_ACCENT maps
│       └── types.ts                 TypeScript interfaces for all entities
│
├── supabase/migrations/         001 through 009 (see Database Schema)
├── .env.example                 all required env vars
├── requirements.txt             Python dependencies
├── vercel.json                  /api/* rewrite → api/index.py
└── README.md
```

---

## Tech Stack

| Layer | Technology | Monthly cost |
|---|---|---|
| Hosting | Vercel | Free |
| Database + Auth + Realtime | Supabase + pgvector + pg_cron | Free |
| AI generation | Claude Haiku 4.5 + Sonnet 4.6 (Anthropic) | ~$5/week |
| Embeddings | HuggingFace Inference API (all-MiniLM-L6-v2) | Free |
| Medical NER | HuggingFace Inference API (d4data/biomedical-ner-all) | Free |
| ML models | scikit-learn `.pkl` files in repo | Free |
| Frontend | Next.js 14 + Tailwind CSS + Recharts + Radix UI | Free |
| Patient SMS | Twilio | Free trial |
| Provider/employer email | SendGrid | Free (100/day) |
| Insurance card OCR | Claude Vision | <$0.01/card |
| EHR integration | Epic FHIR R4 sandbox | Free |
| Billing | Stripe (% of revenue) | Free until revenue |
| **Total weekly** | | **~$5** |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Supabase project (free tier works)
- An Anthropic API key (optional — demo mode works without one)

### 1. Backend

```bash
pip install -r requirements.txt

# Demo mode — no API key needed
uvicorn api.index:app --reload --port 8000

# With AI
ANTHROPIC_API_KEY=sk-ant-... uvicorn api.index:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### 3. Demo login

```
Patient:   patient@synthure.ai  / demo1234
Physician: doctor@synthure.ai   / demo1234
Hospital:  admin@synthure.ai    / demo1234
Employer:  hr@synthure.ai       / demo1234
```

### 4. With Supabase (full functionality)

Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Run each migration file in `supabase/migrations/` in order (001 → 009) in the Supabase SQL editor.

```bash
# Load the RAG knowledge base into pgvector
python -m backend.rag.corpus.update_pipeline

# Train ML models on real data distributions
python -m backend.ml.training.train_denial
python -m backend.ml.training.train_readmission
```

### 5. Vercel deployment

1. Vercel project settings → **Root Directory** → set to `frontend`
2. Add all env vars from `.env.example` in Vercel → Environment Variables
3. Deploy

---

## API Reference

All endpoints except `GET /api/health` and `POST /api/auth/login` require `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Returns JWT with `role`, `org_id`, `name` |

### Physician
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/physician/navigator` | Unified intake — jargon + insurance + readmission risk run in parallel; queues all Tier 1 actions |
| `GET` | `/api/physician/dashboard` | Pending Tier 2 one-tap queue + completed-today feed |
| `POST` | `/api/physician/actions/{id}/approve` | Approve a Tier 2 action |

### AI Features
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/features/explain-jargon` | Clinical note → plain English |
| `POST` | `/api/features/match-insurance` | Patient profile → ranked plan recommendations |
| `POST` | `/api/features/denial-prevention` | Claim → pre-submission risk score + suggestions |
| `POST` | `/api/features/prior-auth/check` | PA required? + approval probability |
| `POST` | `/api/features/prior-auth/submit` | Auto-fill payer form + submit PA |
| `GET` | `/api/features/prior-auth` | List PAs with status filter |
| `POST` | `/api/features/discharge` | Discharge instructions at 6th-grade level, SMS sent |
| `POST` | `/api/features/formulary/check` | Medication coverage + PA-free alternatives |
| `POST` | `/api/features/financial-assistance` | OOP > threshold → assistance programs |
| `POST` | `/api/features/clinical-decision-support` | ICD-10 → guideline gaps (non-mandatory) |
| `POST` | `/api/features/document-intelligence/classify` | Upload doc → classify + act |
| `POST` | `/api/features/document-intelligence/insurance-card-ocr` | Photo → Claude Vision → populate insurance record |

### Hospital — CRM
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/hospital/crm/patients` | List + create patients |
| `GET/PATCH` | `/api/hospital/crm/patients/{id}` | Read (with conditions, meds, insurance, docs attached) + update |
| `GET/POST` | `/api/hospital/crm/providers` | Provider directory + credentialing alerts |
| `GET/POST/PATCH` | `/api/hospital/crm/payers` | Payer directory + live scorecard |
| `GET/POST` | `/api/hospital/crm/patients/{id}/documents` | Document upload + AI classification |

### Hospital — RCM
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/hospital/rcm/claims` | List + create claims (runs AI adjudication on create) |
| `GET` | `/api/hospital/rcm/claims/{id}` | Claim with transitions, denials, payments attached |
| `POST` | `/api/hospital/rcm/claims/{id}/transition` | State machine transition with enforcement |
| `POST` | `/api/hospital/rcm/eligibility/verify` | EDI eligibility check |
| `POST` | `/api/hospital/rcm/coding/suggest` | ICD-10 + CPT suggestions from clinical note |
| `GET` | `/api/hospital/rcm/ar-aging` | AR buckets with totals |
| `GET/PATCH` | `/api/hospital/rcm/denials` | Denial list + update CARC/reason |
| `POST` | `/api/hospital/rcm/denials/{id}/appeal` | Generate + file Claude appeal letter |
| `POST` | `/api/hospital/rcm/payments` | Post payment; underpayment flag if < 95% of billed |
| `POST/GET` | `/api/hospital/rcm/collections` | Start + advance collections stage workflow |

### Hospital — Operations + Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/hospital/analytics` | Live monthly metrics: billed, paid, collection rate, denial rate |
| `GET` | `/api/hospital/benchmarks` | Practice vs CMS Medicare open data (real API call) |
| `GET` | `/api/hospital/operations/credentialing/alerts` | Expiring licenses + DEA within 90 days |
| `GET` | `/api/hospital/operations/contracts/alerts` | Payer contract renewals within 30 days |
| `GET` | `/api/hospital/operations/compliance/hipaa-audit` | PHI access audit by resource type |
| `GET` | `/api/hospital/operations/compliance/cms-quality` | CMS quality measure report |
| `GET` | `/api/hospital/operations/forecasting/revenue` | 30/60/90-day projection from AR aging + CMS rates |

### Employer
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/employer/benefits/plans` | Active benefit plans |
| `POST` | `/api/employer/benefits/optimize` | Claude optimizer → projected savings with dollar amount |
| `POST` | `/api/employer/enrollment/open` | Open enrollment → SendGrid to all eligible employees |
| `GET` | `/api/employer/enrollment/summary` | Enrollment counts by status |
| `POST` | `/api/employer/cobra/event` | Record qualifying event → COBRA notice sent |
| `GET` | `/api/employer/cobra/events` | COBRA event list |
| `POST` | `/api/employer/compliance/aca/generate` | Compile + store 1095-C report |
| `GET` | `/api/employer/compliance/deadlines` | ACA reporting calendar |
| `GET` | `/api/employer/reports/monthly` | Full monthly admin package |

### ML Predictions
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/mle/predictions/denial-risk` | Returns `denial_risk` (0–100), `risk_level` |
| `POST` | `/api/mle/predictions/pa-approval` | Returns `approval_probability` (0–100) |
| `POST` | `/api/mle/predictions/readmission` | Returns `readmission_risk` (0–100), `risk_level` |

### Patient
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/patient/health` | Conditions + medications (HIPAA audited) |
| `GET` | `/api/patient/coverage` | Insurance deductible/OOP status |
| `GET` | `/api/patient/claims` | Claims with plain-English status translations |
| `GET` | `/api/patient/education` | Discharge materials from MedlinePlus + DailyMed |
| `GET/POST` | `/api/patient/notifications` | Notifications + mark-read |
| `GET/POST` | `/api/patient/consents` | Autonomous action consent management |

---

## Running Tests

```bash
# Full suite — demo mode, no Supabase required
pytest backend/tests/ -v

# Jargon eval harness against gold dataset
# Requires ANTHROPIC_API_KEY
python -m backend.tests.evals.eval_jargon
```
