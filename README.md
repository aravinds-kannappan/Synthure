# Synthure

**One note. A clearer next step.**

[Website](https://synthure.vercel.app) · [Dashboard](https://synthure.vercel.app/dashboard)

Synthure explores three connected problems: understanding a care plan, communicating across teams, and finding care that fits practical and financial needs.

## Two pages, one shared journey

The landing page explains the product. The dashboard contains the entire interactive experience:

- **Patient:** read the documented plan, describe it in your own words, save a provider preference, and record progress.
- **Clinician:** review the source and the patient’s response, then record the review.
- **Care team:** coordinate benefits and appointment tasks and record authorization evidence.
- **Employer:** see aggregate activity across a fictional cohort, without individual notes or messages.

Plan comparisons, provider mapping, source-note editing, and local questions stay in the dashboard. Former experience URLs redirect there. The original research UI remains in the source tree but is not a separate public page.

## Care rehearsal

Change one assumption before changing the journey:

1. **A tighter budget:** halve the premium budget and see which fictional plans still fit. Annual care assumptions stay unchanged; an empty set remains an explicit gap.
2. **An unavailable provider:** compare alternatives against the same specialty, exact fictional plan, travel limit, and language. Incompatible alternatives are not silently substituted.
3. **An unclear plan:** surface the source instruction and a specific clarification question for the care team.

Each rehearsal connects an exact note excerpt to a visible consequence, an owner, and a next question. It compares before/after effects across the four perspectives. Sharing a rehearsal question adds a local message only after a click; the rehearsal itself never changes the note, selections, tasks, or authorizations.

The dashboard also identifies the next open handoff as reviews, responses, preferences, and task statuses are recorded. This is a deterministic demonstration workflow, not clinical triage.

## What is distinctive—and what is established

Clinical documentation, patient explanations, navigation, and follow-up coordination already exist. Abridge describes [patient visit summaries](https://www.abridge.com/blog/patient-visit-summaries--now-generated-in-real-time); Commure offers [care journeys and communication](https://www.commure.com/engage); Included Health describes [benefits and provider navigation](https://includedhealth.com/organizations/solutions/included-health-connect/); and Transcarent describes [personalized scheduling and follow-up](https://transcarent.com/press-releases/transcarent-adds-scheduling-symptom-checking-total-recall-memory-engine).

Synthure’s focus is the trace **source evidence → practical obstacle → visible consequence → accountable next action** in one approachable workspace. This is a product direction, not a substantiated world-first claim. The linked capabilities are company descriptions, not independent outcome validation. Research reviewed November 17, 2026.

## Run locally

Requires Node.js 20.9+ and npm.

```sh
git clone https://github.com/aravinds-kannappan/Synthure.git
cd Synthure/frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [localhost:3000](http://127.0.0.1:3000). No account or API key is needed for the dashboard.

## Models and boundaries

The three authored fictional journeys use exact source spans. Custom notes use a conservative labelled-section parser, not a clinical model, and are kept separate from fictional provider and insurance recommendations.

The insurance comparison uses a pairwise linear ranker trained on 1,200 synthetic cases, with 300 held-out cases. Its supplied 98% top-ranked policy agreement includes a deterministic budget rule and measures reproduction of an authored policy—not real insurance accuracy, eligibility, suitability, savings, or clinical outcomes. Benefit arithmetic and exact sample-plan network mapping are deterministic. See the [model research kit](models/insurance-ranking/README.md).

- All people, plans, prices, networks, and employer counts in the examples are fictional.
- A recorded understanding response is not proof of comprehension. A saved provider preference is not a booking.
- Authorization, eligibility, network participation, coverage, and payment remain separate facts.
- The dashboard uses in-memory state. Refreshing clears changes; no external messages, appointments, payer requests, or claims are sent.
- The archived clinical research pipeline and `/api/synthesize` are separate from this browser-local demo. API use requires server-side Anthropic credentials and sends processed note text to that service.

## Development

| Source | Responsibility |
| --- | --- |
| `frontend/components/Landing.tsx` | Simplified landing page |
| `frontend/components/dashboard/` | Single interactive dashboard |
| `frontend/lib/journey.ts` | Source evidence, role actions, shared workflow state |
| `frontend/lib/care-rehearsal.ts` | Read-only what-if calculations and next handoff |
| `frontend/lib/insurance-demo.ts` | Synthetic ranking, benefit arithmetic, fictional networks |
| `frontend/components/archive/`, `frontend/components/lab/` | Retained previous research views |

From `frontend/`:

```sh
npm run grade-journey
npm run grade-insurance
npm run grade-rehearsal
npm run grade-synthetic-pipeline
npm run grade-guardrails
npm run grade-harness
npm run redteam-agents
npm run build
```

The care-rehearsal harness checks state immutability, literal evidence, strict provider constraints, affordability gaps, independent authorization status, and employer privacy. CI runs the graders and production build.

Vercel publishes `main` automatically at [synthure.vercel.app](https://synthure.vercel.app). See [NOTICE](NOTICE) for model and data attribution.
