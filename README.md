# ◈ Synthure

> *One platform. Four stakeholders. Zero administrative burden.*

A clinical AI platform built around one premise: a physician should only ever do medicine. A clinical note enters once. Everything downstream — prior authorizations, claims, patient education, denial appeals, billing, employer benefits optimization — happens automatically.

**📄 [Read the research paper (NeurIPS format, 10 pages)](synthure_paper.pdf)**

---

## Portals

| Portal | Primary User | What it does |
|---|---|---|
| **Patient** | Patient | Plain-language condition summaries, cost share breakdown, medication guides (DailyMed), journey timeline, financial assistance search |
| **Physician** | Clinician | Navigator (jargon + insurance + claim routing in parallel), one-tap Tier 2 queue, autonomous action feed |
| **Hospital** | Admin / Billing | Full RCM state machine, AR aging, denial management + AI appeals, CMS benchmarking, HIPAA audit |
| **Employer** | HR / Benefits | Benefits optimizer, open enrollment automation, COBRA compliance (44-day window), ACA 1095-C reporting |

## The AI Pipeline

Every clinical note runs through five stages:

```
Quality Gate → Biomedical NER → pgvector RAG → Denial ML → Grounded Generation
     ↓               ↓               ↓              ↓               ↓
ICD-10/CPT     d4data/biomedical-  1.43M codes    GradientBoosting  Claude Haiku/Sonnet
validation     ner-all (107 types) cosine search   on 38,924 rows   tool_use + citation check
```

All Claude calls use `tool_use` with `tool_choice={"type":"tool"}` — forced structured JSON. A post-generation citation validation pass strips any document ID not in the retrieved set; hallucination count surfaces in every trace.

## Autonomy Model

| Tier | Description | Examples |
|---|---|---|
| **1 — Autonomous** | Executes immediately | Prior auth, claims, patient SMS, appeal letters, COBRA notices |
| **2 — One-tap** | Physician approval required | Referral letters, discharge summaries to PCPs |
| **3 — Never** | Hard-coded prohibition | Prescribing, differential diagnosis, treatment plan changes |

## ML Models

- **Denial predictor** — GradientBoostingClassifier (150 est., depth 4) + TF-IDF (5k features) trained on DataFog/medical-transcription-instruct (38,924 rows). AUC 0.87.
- **Readmission scorer** — ICD-10 frequency index from birgermoell/icd10-clinical-notes, calibrated against CMS HRRP 2023 published rates (CHF 23.3%, COPD 19.6%, AMI 17.2%).
- **Insurance matcher** — Deterministic ACA/CMS eligibility rule engine + Claude Haiku overlay. 91.3% match accuracy.

## Data Sources

| Source | Size | Purpose |
|---|---|---|
| wangyichen25/ICD-10-CM_Code-Description_Pairs | 1.43M rows | ICD-10 pgvector RAG corpus |
| harishnair04/mtsamples | 4,999 rows | Clinical note RAG |
| AGBonnet/augmented-clinical-notes | 30,000 rows | Clinical NLP RAG |
| DataFog/medical-transcription-instruct | 38,924 rows | Denial predictor training |
| Inje/SYMPTOMS-COT-ICD10-2024 | 12,132 rows | Symptom→ICD-10 RAG |
| birgermoell/icd10-clinical-notes | 1,802 rows | Readmission model |
| d4data/biomedical-ner-all | — | Primary NER (107 entities) |
| blaze999/Medical-NER | — | Fallback NER (41 entities) |
| MedlinePlus API / DailyMed API | — | Patient education |
| CMS open data / HRRP 2023 | — | Payment benchmarks + readmission calibration |

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Hosting | Vercel | Free |
| Database + Auth + Realtime | Supabase + pgvector | Free |
| AI generation | Claude Haiku 4.5 + Sonnet 4.6 | ~$5/week |
| Embeddings + NER | HuggingFace Inference API | Free |
| ML models | scikit-learn .pkl in repo | Free |
| Frontend | Next.js 14 + Tailwind + Radix UI | Free |

## Quick Start

```bash
# Backend
pip install -r requirements.txt
uvicorn api.index:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

Demo accounts (password: `demo1234`):
- `patient@synthure.ai` → Patient portal
- `doctor@synthure.ai` → Physician portal
- `admin@synthure.ai` → Hospital portal
- `hr@synthure.ai` → Employer portal

## Ingest real data into pgvector

```bash
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export HF_TOKEN=...

python -m backend.rag.ingest --limit 500  # smoke test
python -m backend.rag.ingest              # full run (~2-4 hrs for 1.4M ICD-10 rows)
```

## Environment Variables

See `.env.example`. Key vars:

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
HF_TOKEN  ← required for real NER + dataset ingestion
JWT_SECRET
```

---

**📄 [Full technical paper (NeurIPS format)](synthure_paper.pdf)** — architecture, ML models, evaluation results, dataset details, and API reference.
