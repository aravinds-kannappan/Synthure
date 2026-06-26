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

### Four portals, one note

The four reports are not shown as lookalike tabs. Each opens as a **distinct portal** that looks and behaves like the real software that reader would use:

- **Patient portal** — a friendly, light consumer health app with plain-language diagnosis cards, medication cards, a cost estimator, a next-steps checklist, and a "when to seek care" panel.
- **Clinician console** — a dense EHR-style workspace with acceptable ICD 10 / CPT code chips, a one-tap prior-authorization packet, documentation prompts, and live denial / readmission gauges.
- **Revenue cycle dashboard** — a claim-status pipeline, line items, expected reimbursement, denial drivers, and HRRP exposure.
- **Benefits analytics** — an aggregated, anonymized population view with a cohort spend sparkline, network-utilization donut, and compliance posture.

A portal switcher lets you "log into" each one and the whole frame re-skins. A **guided tour** auto-plays through all four, and a **Compare all four** view shows them side by side. Switching is instant — the run is cached, so no agent re-runs.

### One interconnected encounter, not four silos

The four portals share a single mutable **encounter** (`lib/encounter.ts`), so an action in one ripples through the others in real time:

- The clinician **approves the prior-authorization packet** → denial risk drops, the claim advances to "ready to submit", the patient portal shows the procedure as covered, and the employer cohort trend bends.
- The clinician **toggles a code or procedure out of the claim** → the patient cost estimate, the revenue allowed amount and expected reimbursement, and the employer cohort all recompute.
- The patient **applies for financial assistance** → their out-of-pocket estimate drops and a screening task lands in revenue cycle.
- Revenue cycle **submits the claim** → the patient's billing status updates.

Every portal also has a **cross-portal inbox**: each one can message any other, and a shared activity feed plus notification badges and a "ripple" toast show the interconnection as it happens. It runs entirely client-side off the shared store, so it works with or without an API key.

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

- **With an `ANTHROPIC_API_KEY`**, a Claude NER agent reads the note and maps diagnoses to ICD 10 / CPT codes, including ones written in plain language or as abbreviations (for example "high blood pressure" maps to `I10`). The four writers, the verifier, and the orchestrator are then real Claude calls (Haiku for NER and the writers, Sonnet for verification and orchestration), using forced `tool_use` schemas so output is structured and grounded. Every code is format validated before it is used.
- **Without a key**, an offline rules based extractor (a regex for codes plus a medication dictionary) and the note derived engine produce the same structured reports, so the demo always works. This offline extractor is exact when a note already contains valid codes and exactly spelled drug names, but it does not recognize diagnoses written only in prose; that is what the Claude NER path is for. Every report is sanitized to contain no hyphens or dashes.
- **In both modes**, the denial and readmission risk scores are deterministic heuristics over the note text, clearly labelled as estimates in the UI, not the trained models described in the paper.

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
│   │   ├── portals/                 Four role-specific portals + shell, switcher, guided tour, widgets
│   │   ├── HowItWorks.tsx            Scroll-scrubbed cinematic pipeline animation
│   │   ├── ReportView.tsx           "Compare all four" tabbed report viewer
│   │   └── Nav.tsx                   Top navigation + logo
│   └── lib/
│       ├── synthure.ts              Shared types, stakeholder config, agent pipeline, sample notes
│       ├── knowledge.ts             Shared clinical dictionaries + illustrative cost estimation
│       ├── engine.ts                Note-derived extraction + detailed report synthesis + sanitizer
│       ├── encounter.ts             Shared encounter state, live recompute, cross-portal event reducer
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

> These metrics evaluate the full **research implementation** in `backend/` (HuggingFace biomedical NER, a GradientBoosting denial model, and a pgvector RAG over 1.43M ICD 10 codes). They are **not** produced by the shipped web demo, which uses the lighter extraction described above (a Claude NER pass when a key is set, or a rules based extractor offline) and heuristic risk scores. The demo does not reproduce these numbers.

**📄 [Full research paper](synthure_paper.pdf)** · 12 pages · 6 figures · 14 references
