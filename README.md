# ◈ Synthure

**Clinical AI platform — four portals, one engine.**

A clinical note enters once. Everything else happens automatically. The patient understands their health and costs. The physician does nothing but medicine. The hospital's revenue cycle runs itself. The employer's benefits optimize continuously.

---

## The Four Portals

| Portal | Who it's for | What they see |
|---|---|---|
| **Patient** | Patients | Health summary in plain English, insurance coverage, claims in plain English, education materials, journey timeline — all arriving automatically |
| **Physician** | Doctors | Navigator (one note → all pipelines), one-tap approvals for Tier 2 actions, patient records with readmission risk badges, clinical decision support |
| **Hospital** | Admins / billing | Full RCM (claims kanban, AR aging, denials, appeals, payments), CRM (patients, providers, payers), compliance reports, revenue forecasting, benchmarks vs CMS |
| **Employer** | HR / benefits | Benefits optimizer with projected savings, open enrollment automation, COBRA notices, ACA compliance reports, monthly admin package |

Same database. Same AI engine. Role detected on login — user routed automatically.

---

## Demo Access

```
Patient:   patient@synthure.ai  / demo1234
Physician: doctor@synthure.ai   / demo1234
Hospital:  admin@synthure.ai    / demo1234
Employer:  hr@synthure.ai       / demo1234
```

---

## Quick Start

```bash
# Terminal 1 — backend
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. All three original AI pipelines (jargon decoder, insurance matcher, claim adjudication) work in demo mode with no env vars needed.

### With real AI + database

Copy `.env.example` to `.env` and fill in:

```env
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Apply Supabase migrations in order:

```bash
# Run each file in your Supabase SQL editor
supabase/migrations/001_extensions.sql
supabase/migrations/002_core.sql
supabase/migrations/003_crm.sql
supabase/migrations/004_rcm.sql
supabase/migrations/005_features.sql
supabase/migrations/006_employer.sql
supabase/migrations/007_mle.sql
supabase/migrations/008_platform.sql
supabase/migrations/009_rls.sql
```

Load the RAG corpus and train ML models:

```bash
python -m backend.rag.corpus.update_pipeline
python -m backend.ml.training.train_denial
python -m backend.ml.training.train_readmission
```

---

## Vercel Deployment

1. Vercel project settings → **Root Directory** → set to `frontend`
2. Add all env vars from `.env.example` in Vercel → Settings → Environment Variables
3. Every branch push creates a preview URL automatically — no merge needed to test

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   frontend/ (Next.js 14)                    │
│  Patient    Physician    Hospital    Employer                │
└────────────────────┬────────────────────────────────────────┘
                     │ REST + Supabase Realtime
┌────────────────────▼────────────────────────────────────────┐
│                  backend/ (FastAPI)                         │
│                                                              │
│  api/  ├── auth          JWT + role detection               │
│        ├── patient/      health, coverage, claims, education │
│        ├── physician/    navigator, dashboard, prior auths   │
│        ├── hospital/     crm/, rcm/, operations/, analytics  │
│        ├── employer/     benefits, enrollment, cobra, aca    │
│        ├── features/     jargon, insurance, discharge,       │
│        │                 denial prevention, PA, formulary,  │
│        │                 financial assistance, CDS, doc intel│
│        └── mle/          denial risk, PA approval, readmission│
│                                                              │
│  agents/  orchestrator, intake_agent, action_orchestrator,  │
│           entity_extractor (OpenMed NER), generator          │
│                                                              │
│  ml/      GradientBoosting denial predictor                  │
│           LogisticRegression PA predictor (per payer)        │
│           LogisticRegression readmission scorer              │
│           feature_store (24h cached patient/claim features)  │
│                                                              │
│  rag/     pgvector retriever, HuggingFace embedder,          │
│           corpus loaders for ICD-10 + MTSamples + notes      │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│          Supabase: PostgreSQL + pgvector + Auth + Realtime   │
└─────────────────────────────────────────────────────────────┘
```

---

## The Navigator

The centerpiece. One clinical note in → all pipelines run in parallel → timeline populated → Tier 1 actions queued immediately.

```bash
curl -X POST /api/physician/navigator \
  -H "Authorization: Bearer <token>" \
  -d '{
    "notes": "62yo M with CHF exacerbation. BNP 1200. Furosemide 80mg BID...",
    "age": 62,
    "annual_income": 38000,
    "patient_phone": "+15550001234"
  }'
```

What fires automatically (all parallel):
- Jargon decoded → sent to patient portal
- Insurance plans matched → shown on physician panel
- 30-day readmission risk scored → badge on patient card
- Patient education SMS sent (Tier 1 — fires immediately)
- Care event written to journey timeline
- Encounter record saved

---

## Autonomy Model

| Tier | Behavior | Examples |
|---|---|---|
| **Tier 1** | Fully autonomous — executes immediately on trigger | Prior auth filed, claim staged, patient education SMS, COBRA notice, eligibility verified, appeal generated and filed |
| **Tier 2** | One-tap — physician acknowledges via push notification | Referral letter to specialist, discharge summary to PCP, care coordination message |
| **Tier 3** | Hard stop — never autonomous regardless of consent | Prescribing medications, differential diagnosis, modifying treatment plan, legal medical documents |

---

## AI Features

| Feature | What it does | Endpoint |
|---|---|---|
| **Jargon Decoder** | Clinical note → plain English with condition explanations sourced from MedlinePlus | `POST /api/features/explain-jargon` |
| **Insurance Matcher** | Rule engine + Claude overlay → ranked plan recommendations with FPL/subsidy calculation | `POST /api/features/match-insurance` |
| **Claim Adjudication** | Complexity scored → routed to Haiku (standard) or Sonnet (frontier) → structured decision | `POST /api/hospital/rcm/claims/submit` |
| **Denial Prevention** | Pre-submission ML risk score + payer-specific prevention suggestions from RAG | `POST /api/features/denial-prevention` |
| **Appeal Generation** | Claude writes appeal letter from CARC code + clinical context → filed automatically | `POST /api/hospital/rcm/denials/{id}/appeal` |
| **PA Automation** | PA requirement check + per-payer form auto-fill + ML approval probability | `POST /api/features/prior-auth/submit` |
| **Discharge Education** | 6th-grade reading level, MedlinePlus + DailyMed sourced, Flesch-Kincaid scored, multilingual via Claude | `POST /api/features/discharge` |
| **Document Intelligence** | Upload any doc → AI classifies → acts: denial→appeal, insurance card→OCR populate, EOB→reconcile | `POST /api/features/document-intelligence/classify` |
| **Formulary Checker** | Medication coverage check → PA-free therapeutically equivalent alternatives surfaced | `POST /api/features/formulary/check` |
| **Financial Assistance** | OOP > $500 threshold → NeedyMeds + manufacturer programs + federal programs listed automatically | `POST /api/features/financial-assistance` |
| **Clinical Decision Support** | ICD-10 codes → ACC/AHA/ADA/KDIGO guideline gaps surfaced as non-mandatory physician suggestions | `POST /api/features/clinical-decision-support` |
| **Benefits Optimizer** | Anonymized workforce health data → alternative plan modeled → projected savings with specific dollar amount | `POST /api/employer/benefits/optimize` |

---

## ML Models

All models use `CalibratedClassifierCV` (Platt scaling) so scores are calibrated probabilities, not raw logits.

| Model | Algorithm | Training data |
|---|---|---|
| **Denial predictor** | GradientBoostingClassifier (200 trees) | ICD-10 distributions from `Inje/SYMPTOMS-COT-ICD10-2024` + complexity scores from `DataFog/medical-transcription-instruct` + CMS denial rate multipliers (OON ×4.0, experimental ×10.0) |
| **PA approval predictor** | LogisticRegression per payer type | Per-payer models trained as outcomes accumulate; rule-based fallback before 500 labeled outcomes |
| **Readmission scorer** | LogisticRegression L2 | ICD-10 code frequencies from `birgermoell/icd10-clinical-notes` + CMS HRRP 2023 rates (CHF 23.3%, COPD 19.6%, AMI 17.2%) |

---

## Real Data Sources

All HuggingFace dataset paths and column names verified:

| Dataset | Rows | Columns used | Purpose |
|---|---|---|---|
| `wangyichen25/ICD-10-CM_Code-Description_Pairs` | 1.43M | `output` (code), `input` (description) | ICD-10 RAG corpus |
| `harishnair04/mtsamples` | 4,999 | `transcription`, `medical_specialty` | Clinical note RAG corpus |
| `AGBonnet/augmented-clinical-notes` | 30,000 | `full_note`, `idx` | Clinical NLP RAG |
| `DataFog/medical-transcription-instruct` | 38,924 | `complexity_score` (float 0–1) | Denial predictor training |
| `Inje/SYMPTOMS-COT-ICD10-2024` | 12,132 | `answer` (code), `symptoms`, `chain_of_thought` | Symptom→ICD-10 RAG + denial training |
| `birgermoell/icd10-clinical-notes` | 1,802 | `code`, `language`, `journal_note` | Readmission training code distributions |
| `d4data/biomedical-ner-all` | — | 107 biomedical entity types (MACCROBAT) | Primary medical NER |
| `blaze999/Medical-NER` | — | 41 medical entities (PubMED) | Fallback medical NER |
| `sentence-transformers/all-MiniLM-L6-v2` | — | 768-dim embeddings | pgvector RAG |
| MedlinePlus API (NLM) | — | — | Patient education URLs by ICD-10 |
| DailyMed API (NLM) | — | — | Medication guide URLs |
| NeedyMeds | — | — | Financial assistance programs |
| CMS open data API | — | `avg_mdcr_pymt_amt` per CPT | Real Medicare payment benchmarks |
| CMS HRRP 2023 | — | Published readmission rates | Readmission model label calibration |

---

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Hosting | Vercel | Free |
| Database + Auth + Realtime | Supabase + pgvector | Free |
| AI generation | Claude Haiku 4.5 / Sonnet 4.6 | ~$5/week |
| Embeddings | HuggingFace all-MiniLM-L6-v2 | Free |
| Medical NER | HuggingFace d4data/biomedical-ner-all | Free |
| ML models | scikit-learn .pkl in repo | Free |
| Frontend | Next.js 14 + Tailwind CSS + Recharts | Free |
| SMS | Twilio | Free trial |
| Email | SendGrid | Free (100/day) |
| Billing | Stripe | Free until revenue |
| EHR integration | Epic FHIR R4 sandbox | Free |
| **Weekly total** | | **~$5** |

---

## API Reference

All endpoints except `GET /api/health` and `POST /api/auth/login` require `Authorization: Bearer <token>`.

### Auth
| `POST` | `/api/auth/login` | Returns JWT with `role` + `org_id` |
|---|---|---|

### Physician
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/physician/navigator` | Unified intake — all pipelines parallel |
| `GET` | `/api/physician/dashboard` | Pending one-tap queue + completed-today feed |
| `POST` | `/api/physician/actions/{id}/approve` | Approve a Tier 2 action |

### Features
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/features/explain-jargon` | Decode a clinical note |
| `POST` | `/api/features/match-insurance` | Score insurance plans |
| `POST` | `/api/features/denial-prevention` | Pre-submission denial risk + suggestions |
| `POST` | `/api/features/prior-auth/check` | PA required + approval probability |
| `POST` | `/api/features/prior-auth/submit` | Auto-fill and submit PA |
| `POST` | `/api/features/discharge` | Generate discharge education |
| `POST` | `/api/features/formulary/check` | Medication coverage + alternatives |
| `POST` | `/api/features/financial-assistance` | Patient assistance programs |
| `POST` | `/api/features/clinical-decision-support` | Guideline gap detection |
| `POST` | `/api/features/document-intelligence/classify` | AI document classification + action |
| `POST` | `/api/features/document-intelligence/insurance-card-ocr` | Claude Vision OCR → populate insurance record |

### Hospital — RCM
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/hospital/rcm/claims` | List / create claims |
| `POST` | `/api/hospital/rcm/claims/{id}/transition` | State machine: draft→submitted→adjudicated→paid/denied |
| `POST` | `/api/hospital/rcm/eligibility/verify` | Verify patient eligibility |
| `POST` | `/api/hospital/rcm/coding/suggest` | ICD-10 + CPT suggestions from clinical note |
| `GET` | `/api/hospital/rcm/ar-aging` | AR buckets: 0–30 / 31–60 / 61–90 / 90+ |
| `GET/PATCH` | `/api/hospital/rcm/denials` | Denial management |
| `POST` | `/api/hospital/rcm/denials/{id}/appeal` | Generate + file appeal letter |
| `POST` | `/api/hospital/rcm/payments` | Post payment, flag underpayments |
| `POST/GET` | `/api/hospital/rcm/collections` | Collections stage workflow |

### Hospital — Operations
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/hospital/analytics` | Live monthly metrics from DB |
| `GET` | `/api/hospital/benchmarks` | Practice vs CMS Medicare open data |
| `GET` | `/api/hospital/operations/credentialing/alerts` | Expiring provider licenses + DEA (90-day window) |
| `GET` | `/api/hospital/operations/contracts/alerts` | Payer contract renewal deadlines |
| `GET` | `/api/hospital/operations/compliance/hipaa-audit` | HIPAA PHI access audit report |
| `GET` | `/api/hospital/operations/forecasting/revenue` | 30/60/90-day projection from AR aging + CMS rates |

### Employer
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/employer/benefits/plans` | Active benefit plans |
| `POST` | `/api/employer/benefits/optimize` | AI benefits optimizer with projected savings |
| `POST` | `/api/employer/enrollment/open` | Open enrollment → notify all employees |
| `POST` | `/api/employer/cobra/event` | Record qualifying event → COBRA notice sent |
| `POST` | `/api/employer/compliance/aca/generate` | Generate 1095-C report |
| `GET` | `/api/employer/reports/monthly` | Full monthly admin package |

### ML Predictions
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/mle/predictions/denial-risk` | Claim denial probability (0–100) |
| `POST` | `/api/mle/predictions/pa-approval` | Prior auth approval probability |
| `POST` | `/api/mle/predictions/readmission` | 30-day readmission risk |

---

## Database Schema (9 migrations)

| Migration | Tables |
|---|---|
| `001_extensions` | pgvector, pg_cron |
| `002_core` | orgs, users, notifications, care_events, audit_logs, realtime_events |
| `003_crm` | patients, patient_insurance, patient_conditions, patient_medications, providers, payers, patient_documents, communications, patient_consents |
| `004_rcm` | claims, claim_transitions, eligibility_checks, prior_auths, denial_events, appeals, payments, collections + `ar_aging` SQL view |
| `005_features` | encounters, action_queue, discharge_records |
| `006_employer` | employer_groups, benefit_plans, enrollments, cobra_events, aca_reports |
| `007_mle` | embeddings (pgvector 768-dim), model_versions, model_evals, feature_store, ab_experiments, prompt_versions |
| `008_platform` | webhooks, api_keys, billing_usage |
| `009_rls` | Row Level Security — hospital admins: org-scoped; patients: own records only |

---

## Build Branches

Each phase is a separate branch with a PR. Merge in order to deploy:

| Branch | PR | What it adds |
|---|---|---|
| `phase-0-infrastructure` | [#1](https://github.com/aravinds-kannappan/Synthure/pull/1) | FastAPI migration, Supabase core, role auth, migrations 001–002 |
| `phase-1-crm-nextjs` | [#2](https://github.com/aravinds-kannappan/Synthure/pull/2) | Hospital CRM API, Next.js 14 shell, all 4 portal layouts, migration 003 |
| `phase-2-rcm-core` | [#3](https://github.com/aravinds-kannappan/Synthure/pull/3) | Claims state machine, eligibility, AR aging, denials, appeals, payments, migration 004 |
| `phase-3-mle-foundation` | [#4](https://github.com/aravinds-kannappan/Synthure/pull/4) | ML models, pgvector embeddings, HuggingFace NER, feature store, migration 007 |
| `phase-4-navigator` | [#5](https://github.com/aravinds-kannappan/Synthure/pull/5) | Unified Navigator, parallel pipelines, action orchestrator, migration 005 |
| `phase-5-patient-portal` | [#6](https://github.com/aravinds-kannappan/Synthure/pull/6) | Patient portal API + Supabase Realtime live updates |
| `phase-6-autonomous-actions` | [#7](https://github.com/aravinds-kannappan/Synthure/pull/7) | Twilio/SendGrid, all Tier 1 action handlers, physician one-tap dashboard |
| `phase-7-product-bets` | [#8](https://github.com/aravinds-kannappan/Synthure/pull/8) | Denial prevention, PA automation end-to-end, discharge education |
| `phase-8-hospital-ops` | [#9](https://github.com/aravinds-kannappan/Synthure/pull/9) | Compliance reports, revenue forecasting, credentialing alerts, CMS benchmarks |
| `phase-9-employer-portal` | [#10](https://github.com/aravinds-kannappan/Synthure/pull/10) | Benefits optimizer, open enrollment, COBRA, ACA compliance, migration 006 |
| `phase-10-intelligence` | [#11](https://github.com/aravinds-kannappan/Synthure/pull/11) | Document intelligence, formulary checker, financial assistance, clinical decision support |
| `phase-11-platform` | [#12](https://github.com/aravinds-kannappan/Synthure/pull/12) | pytest suite, eval harness, Row Level Security, FHIR R4, webhooks, prompt registry, migrations 008–009 |
| `fix/real-data-sources` | [#13](https://github.com/aravinds-kannappan/Synthure/pull/13) | Verified NER models, correct HF dataset schemas, CMS-calibrated training data, live DB analytics |

Final step: merge `fix/real-data-sources` → `main` to go live.

---

## Running Tests

```bash
# Full test suite (demo mode — no Supabase needed)
pytest backend/tests/ -v

# Jargon eval harness (requires ANTHROPIC_API_KEY)
python -m backend.tests.evals.eval_jargon
```
