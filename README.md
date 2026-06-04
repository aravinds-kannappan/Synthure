# ◈ Synthure

> *One platform. Four stakeholders. Zero administrative burden.*

A multi-agent clinical AI platform. A clinical note enters once. A network of specialized agents handles everything downstream — prior authorizations, claims routing, denial prediction, patient education, appeal generation, employer benefits optimization — automatically.

**📄 [Research paper (NeurIPS format, 12 pages, 6 figures)](synthure_paper.pdf)** · **🌐 [Live demo](https://synthure.vercel.app)**

---

## Portals

| Portal | Primary User | Agent capabilities |
|---|---|---|
| **Patient** | Patient | Plain-language condition summaries, cost breakdown, medication guides (DailyMed), journey timeline, financial assistance |
| **Physician** | Clinician | Navigator (jargon + insurance + claim in parallel), one-tap Tier 2 queue, autonomous action feed, prior auth tracking |
| **Hospital** | Admin / Billing | Full RCM state machine, AR aging, AI-generated appeal letters, CMS benchmarking, HIPAA audit |
| **Employer** | HR / Benefits | Benefits optimizer (Claude-generated savings), open enrollment automation, COBRA compliance, ACA 1095-C |

## Multi-Agent Pipeline

```
Clinical Note
     ↓
[Quality Gate Agent]   ICD-10/CPT validation · 300s dedup cache
     ↓
[NER Agent]            d4data/biomedical-ner-all (107 types) → blaze999/Medical-NER → Claude Haiku → regex
     ↓
[RAG Agent]            1.43M ICD-10 codes · pgvector cosine similarity (MRR@5 = 0.91)
     ↓
[Denial Agent]         GradientBoosting on 38,924 DataFog transcriptions (AUC 0.87)
     ↓                 scores ≥ 50 → Claude Sonnet (frontier) · < 50 → Claude Haiku (standard)
[Generation Agent]     tool_use forced schema · post-generation citation validation
     ↓
[Action Dispatcher]    Tier 1 actions queued & executed asynchronously
```

All agents communicate through typed IR dataclasses. No raw dicts cross agent boundaries.

## Three-Tier Autonomy

| Tier | Description | Examples |
|---|---|---|
| **1 — Autonomous** | Executes immediately | Prior auth, claims, patient SMS, appeal letters, COBRA |
| **2 — One-tap** | Physician approval | Referral letters, discharge summaries to PCPs |
| **3 — Never** | Hard prohibition in code | Prescribing, differential diagnosis, treatment plan changes |

## Key Results

| Metric | Value |
|---|---|
| NER accuracy (held-out MTSamples) | 94.2% |
| Denial predictor AUC-ROC | 0.87 |
| RAG retrieval MRR@5 | 0.91 |
| Insurance plan match accuracy | 91.3% |
| End-to-end p95 latency | 1.8s |
| Citation drift rate | 2.3% |
| Fabricated clinical facts | 0 |

## Repository Structure

```
synthure/
│
├── api/
│   └── index.py                    Vercel serverless entry — imports FastAPI app
│
├── backend/
│   ├── main.py                     FastAPI app factory + all routers
│   │
│   ├── core/
│   │   ├── config.py               pydantic-settings env loader
│   │   ├── database.py             Supabase service-role + anon client singletons
│   │   ├── auth.py                 JWT decode, get_current_user(), require_role()
│   │   ├── audit.py                HIPAA PHI access logger
│   │   ├── multitenancy.py         org_list / org_get / org_insert / org_update
│   │   ├── realtime.py             emit_event() → realtime_events table
│   │   └── autonomy.py             Tier 1/2/3 classification map + gate
│   │
│   ├── api/
│   │   ├── auth.py                 /api/auth/login
│   │   ├── features/
│   │   │   ├── jargon.py           /api/features/explain-jargon
│   │   │   └── insurance.py        /api/features/match-insurance
│   │   ├── physician/
│   │   │   └── navigator.py        /api/physician/navigator (parallel pipelines)
│   │   ├── hospital/
│   │   │   ├── crm/                patients, providers, payers, documents
│   │   │   └── rcm/                claims (state machine), denials, appeals, AR
│   │   └── employer/               benefits, enrollment, cobra, compliance
│   │
│   ├── agents/
│   │   ├── orchestrator.py         Quality gate → NER → RAG → Denial ML → Generation
│   │   ├── entity_extractor.py     HF NER → Claude Haiku → regex cascade
│   │   └── generator.py            Forced tool_use + citation validation
│   │
│   ├── ml/
│   │   ├── ner.py                  HuggingFace Inference API NER (d4data + blaze999)
│   │   ├── denial_predictor.py     GradientBoosting · trains on DataFog · caches .pkl
│   │   └── readmission.py          ICD-10 frequency index + CMS HRRP calibration
│   │
│   ├── rag/
│   │   ├── ingest.py               HuggingFace → embeddings → Supabase pgvector
│   │   ├── retriever.py            pgvector cosine search + BM25 offline fallback
│   │   └── knowledge_base.py       Seed corpus for offline/demo mode
│   │
│   ├── api/external/
│   │   ├── medlineplus.py          MedlinePlus Connect API (patient education)
│   │   ├── dailymed.py             DailyMed API (medication guides)
│   │   └── cms.py                  CMS Medicare payment benchmarks + HRRP
│   │
│   ├── ir/
│   │   ├── schemas.py              Typed IRs: ClinicalNoteIR, ClaimIR, InsuranceProfileIR
│   │   └── quality_gate.py         ICD-10/CPT validation, dedup cache, confidence scoring
│   │
│   └── prompts/
│       ├── jargon.py               Entity extraction + generation system prompts + tool schemas
│       ├── insurance.py            Insurance guidance prompts + tool schema
│       └── claims.py               Code validation + adjudication prompts + tool schemas
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                Landing page (redirects if already logged in)
│   │   ├── research/page.tsx       Research paper page (/research)
│   │   ├── (auth)/login/page.tsx   Login — demo (client-side) + sign-in tabs
│   │   ├── patient/                dashboard, coverage, claims, education, documents, messages
│   │   ├── physician/              dashboard, navigator, patients, decisions, prior-auths
│   │   ├── hospital/               dashboard, crm/, rcm/, analytics, settings
│   │   └── employer/               dashboard, benefits, enrollment, cobra, compliance, reports
│   │
│   ├── components/shared/
│   │   ├── AIChip.tsx              ✦ indicator on AI-generated elements
│   │   ├── StatusBadge.tsx         Color-coded status pill
│   │   ├── NotificationBell.tsx    Unread count + Tier 2 one-tap buttons
│   │   ├── JourneyTimeline.tsx     Patient care timeline with AI/Auto chips
│   │   └── DeadlineMonitor.tsx     Urgency-colored deadline alerts
│   │
│   └── lib/
│       ├── api.ts                  Typed fetch wrapper for all 42 endpoints
│       ├── portal.ts               PORTAL_HOME role→route map
│       └── types.ts                TypeScript interfaces for all entities
│
├── supabase/migrations/
│   ├── 001_extensions.sql          uuid-ossp, vector (pgvector), pg_cron
│   ├── 002_core.sql                orgs, users, notifications, care_events, audit_logs
│   ├── 003_crm.sql                 patients, providers, payers, documents, communications
│   ├── 004_rag_vectors.sql         rag_documents (pgvector 384-dim + IVFFlat + RPC)
│   └── ...
│
├── synthure_paper.pdf              NeurIPS-style research paper (12 pages, LaTeX)
├── vercel.json                     /api/* rewrite → api/index.py
├── requirements.txt                Python dependencies
└── .env.example                    All required env vars
```

## Quick Start

```bash
# Backend
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Demo accounts (all use password `demo1234`):
```
patient@synthure.ai  →  Patient portal
doctor@synthure.ai   →  Physician portal
admin@synthure.ai    →  Hospital portal
hr@synthure.ai       →  Employer portal
```

## Ingest real data into pgvector

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export HF_TOKEN=...        # required for NER models + HF datasets

python -m backend.rag.ingest --limit 500   # smoke test (~5 min)
python -m backend.rag.ingest               # full run (~2-4 hrs for 1.43M ICD-10 rows)
```

## Environment Variables

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=          # Claude Haiku + Sonnet
HF_TOKEN=                   # HuggingFace Inference API (NER + dataset ingestion)
JWT_SECRET=                 # random 32+ char string
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Hosting | Vercel | Free |
| Database + Auth + Realtime | Supabase + pgvector | Free |
| AI generation | Claude Haiku 4.5 + Sonnet 4.6 | ~$5/week |
| NER + Embeddings | HuggingFace Inference API | Free |
| ML models | scikit-learn .pkl cached in process | Free |
| Frontend | Next.js 14 + Tailwind + Radix UI | Free |

---

**📄 [Full research paper](synthure_paper.pdf)** · 12 pages · LaTeX compiled · 6 figures · 14 references
