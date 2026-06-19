# ◈ Synthure

> *One clinical note. Four intelligent reports.*

Synthure is a multi-agent clinical AI engine. You drop in a single clinical note and watch a team of specialized agents read it, write tailored and verified reports for everyone the note touches — the **patient**, the **physician**, the **hospital**, and the **employer** — in real time.

**🌐 [Live demo](https://synthure.vercel.app)** · **📄 [Research paper (NeurIPS format, 12 pages, 6 figures)](synthure_paper.pdf)**

---

## What it does

Type or paste any clinical note (short or long) into the Synthesis Console. Then:

1. **Intake & Quality Gate** validates the note and dedups it.
2. **Biomedical NER** pulls out symptoms, diagnoses, medications, labs, and codes — highlighting each term right in the note.
3. **Knowledge Retrieval** resolves every code against the medical knowledge base (for example `I10` → essential hypertension).
4. **Risk Models** score denial and readmission probability from the note's signals.
5. **Four writer agents** each produce a deep, role-specific report:
   - **Patient Advocate** — plain-language explanation of every diagnosis, medication, and lab, plus a full insurance and cost allocation (estimated coverage per service, out-of-pocket range, financial-assistance options), next steps, and when to seek care.
   - **Care Navigator** — suggested ICD 10 / CPT coding, documentation prompts, prior authorization, denial-risk mitigation, and order coordination.
   - **Revenue Cycle** — claim construction, denial drivers, routing lane, expected reimbursement, readmission / HRRP exposure, and appeals.
   - **Benefits Analyst** — population cohort, cost exposure, network utilization, benefits optimization, and ACA / COBRA compliance (aggregated and anonymized).
6. **Verifier** audits every statement against the extracted facts.
7. **Orchestrator** ties all four reports together and shows how the same facts drive each reader.

Everything is grounded in the note you typed. There are no fixed patients and no canned output — the same engine handles a one-line note or a multi-page chart.

## The agent pipeline

```
Clinical Note
     │
     ▼
[Intake & Quality Gate] ── validate, dedup, check code formats
[Biomedical NER]        ── extract symptoms, diagnoses, meds, labs, codes
[Knowledge Retrieval]   ── resolve codes → labels & guidelines
[Risk Models]           ── denial & readmission probability
     │
     ├──▶ [Patient Advocate]   plain language + insurance allocation
     ├──▶ [Care Navigator]     coding, prior auth, workflow
     ├──▶ [Revenue Cycle]      claim, denial, reimbursement
     └──▶ [Benefits Analyst]   population, cost, compliance
     │
     ▼
[Verifier]      ── audit every claim against the facts
[Orchestrator]  ── tailor & connect all four reports
```

The live demo runs entirely on **Next.js route handlers**. The four writer agents run in parallel and stream back over Server-Sent Events, so the UI reveals each agent's work the moment it finishes.

- **With an `ANTHROPIC_API_KEY`**, the four writers, the verifier, and the orchestrator are real Claude calls (Haiku for the writers, Sonnet for verification and orchestration), using forced `tool_use` schemas so output is structured and grounded.
- **Without a key**, an offline note-derived engine produces the same structured reports from the extracted entities, so the demo always works. Every report is sanitized to contain no hyphens or dashes.

## Project structure

```
synthure/
├── frontend/                         # The Synthure product (Next.js 14, App Router)
│   ├── app/
│   │   ├── page.tsx                   Landing page + scroll-driven agent animation
│   │   ├── demo/page.tsx             The Synthesis Console (type a note, watch the agents)
│   │   ├── research/page.tsx         Research paper page
│   │   ├── layout.tsx                Root layout (fonts, metadata)
│   │   ├── globals.css               Theme + utilities
│   │   └── api/synthesize/route.ts   Streaming multi-agent endpoint (SSE)
│   ├── components/
│   │   ├── HowItWorks.tsx            Scroll-scrubbed cinematic pipeline animation
│   │   ├── ReportView.tsx           Interactive tabbed report viewer
│   │   └── Nav.tsx                   Top navigation + logo
│   └── lib/
│       ├── synthure.ts              Shared types, stakeholder config, agent pipeline, sample notes
│       ├── engine.ts                Note-derived extraction + detailed report synthesis + sanitizer
│       └── useSynthesis.ts          Client hook: consumes the SSE stream, drives the animation
│
├── synthure_paper.pdf                NeurIPS-style research paper (12 pages)
│
└── backend/, api/, supabase/         Reference research implementation (FastAPI + pgvector + ML)
                                      describing the full production architecture in the paper
```

> The `backend/`, `api/`, and `supabase/` directories are the reference implementation behind the research paper (1.43M ICD 10 codes in pgvector, HuggingFace NER, GradientBoosting denial prediction). The shipped demo reimplements a lightweight, self-contained version of that pipeline in TypeScript so it runs anywhere with zero infrastructure.

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

To enable live Claude generation, add a key in `frontend/.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Then restart the dev server. Without it, the demo runs on the offline engine.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Animation | Framer Motion (scroll-scrubbed pipeline) |
| AI generation | Claude Haiku 4.5 + Sonnet 4.6 via `@anthropic-ai/sdk`, forced `tool_use` |
| Transport | Server-Sent Events from a Next.js route handler |
| Hosting | Vercel |

## Research

The architecture, five-stage pipeline, ML models, and evaluation are documented in the paper.

| Metric | Value |
|---|---|
| NER accuracy (held-out clinical notes) | 94.2% |
| Denial predictor AUC-ROC | 0.87 |
| RAG retrieval MRR@5 | 0.91 |
| Insurance plan match accuracy | 91.3% |
| Fabricated clinical facts | 0 |

**📄 [Full research paper](synthure_paper.pdf)** · 12 pages · 6 figures · 14 references
