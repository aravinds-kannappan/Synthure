# ◈ Synthure

> *One clinical note. Four intelligent reports. Nothing identifiable leaves your device.*

Synthure reads a single clinical note and opens a tailored, verified portal for everyone the note touches: the **patient**, the **physician**, the **hospital**, and the **employer**. De identification and clinical NER run as open models in your browser; every code, price, and rate traces to a public primary source; and a verifier plus constitution critic audit and revise every report.

**🌐 [Live demo](https://synthure.vercel.app)** · **📄 [Research notes](https://synthure.vercel.app/research)**

---

## The pipeline (no fallback path)

1. **De identification, on device.** `OpenMed-PII-ClinicalE5-Small-33M` (int8 ONNX via transformers.js) scrubs identifiers in the browser. The raw note is never transmitted.
2. **Biomedical NER, on device.** `OpenMed-NER-DiseaseDetect-TinyMed-65M` and `OpenMed-NER-PharmaDetect-TinyMed-65M` extract diagnosis and drug entities with real per entity confidences. Medication entities must match the NLM RxNorm prescribable vocabulary; symptom and lab spans are tagged by Claude and accepted only if they appear verbatim in the note.
3. **Code linking, constrained.** Candidates are retrieved from the official CDC/NCHS ICD 10 CM FY2026 alphabetic index (about 168,000 terms). Claude may only choose among retrieved candidates or abstain, so an invented code is impossible by construction. Every accepted code is validated against the CMS tabular with its billable flag.
4. **Risk and readiness, sourced.** Readmission is the CMS published 30 day rate for the matched measure cohort (data.cms.gov). Claim readiness is a checklist where every line cites its rule: billability per the CMS order file, diagnosis to procedure linkage, prior authorization per the published CMS OPD list, and administrative flags stated in the note. No denial probability is shown anywhere; none can honestly exist.
5. **Four writer agents** (Claude Haiku, Sonnet on the frontier lane) produce role specific reports grounded strictly in the extracted facts, with real CMS fee schedule amounts.
6. **Verifier, constitution critic, and a revision pass.** Flagged reports go back through their writer with the critique attached; the revision is shown.

## Everything is real data

| What | Source |
|---|---|
| 98,186 diagnosis codes, descriptions, billable flags | CDC/NCHS ICD 10 CM FY2026 release |
| Code candidates for linking | ICD 10 CM FY2026 alphabetic index |
| 9,724 service prices | CMS Physician Fee Schedule (rvu26a) + Clinical Lab Fee Schedule 2026 |
| Prior authorization list | CMS hospital OPD prior authorization list + published commercial lists |
| Readmission rates | CMS Unplanned Hospital Visits, national (data.cms.gov) |
| Population cohorts | AHRQ HCUP CCSR v2025 1 |
| Medication vocabulary (9,576 names) | NLM RxNorm prescribable content |
| Consumer language for diagnoses | MedlinePlus Connect, cited in the UI |

Rebuild all artifacts from source with `python3 scripts/build_knowledge/build.py` (stdlib only). Plan design values (deductible, coinsurance, out of pocket max) are visible, editable inputs defaulted to published KFF survey averages, and the cost math is ordinary benefit arithmetic over CMS amounts. The Benefits portal aggregates real encounters synthesized in your browser (localStorage) and shows an honest empty state before any exist.

## Privacy model

The OpenMed models (~165 MB total, downloaded once and cached) run in the browser through a vendored transformers.js + ONNX Runtime wasm build served from this repo. Only the de identified note and the extracted entities reach the API route, which is rate limited per visitor and per day.

## Project structure

```
synthure/
├── frontend/                       # The product (Next.js 14, deploys to Vercel)
│   ├── public/models/              # OpenMed int8 ONNX models (browser inference)
│   ├── public/vendor/              # transformers.js web bundle + ORT wasm
│   ├── data/                       # Knowledge artifacts built from primary sources
│   ├── lib/openmed.ts              # On device de-id + NER (spans, confidences)
│   ├── lib/knowledge.server.ts     # ICD index search, tabular, fee schedules, RxNorm
│   ├── lib/risk.ts                 # Readiness checklist + CMS readmission lookup
│   ├── lib/encounter.ts            # Shared live encounter, benefit arithmetic
│   ├── lib/history.ts              # Real population aggregates (localStorage)
│   ├── app/api/synthesize/route.ts # Pipeline: linking, writers, verify, revise
│   └── components/portals/         # Four interconnected stakeholder portals
├── scripts/build_knowledge/        # Stdlib pipeline: CDC/CMS/AHRQ/NLM -> artifacts
├── eval/                           # Benchmarks of the previous pipeline (see note)
└── NOTICE                          # OpenMed (Apache 2.0) and data attributions
```

## Quick start

```bash
cd frontend
npm install
ANTHROPIC_API_KEY=sk-... npm run dev
```

The OpenMed models and knowledge artifacts ship with the repo, so the only credential needed is the Anthropic API key for the writer/verifier agents. `python3 scripts/build_knowledge/build.py` refreshes the artifacts from their primary sources.

## Honesty rules this repo follows

- No fallback chains: if a stage cannot run, the product says so instead of silently degrading.
- No invented numbers: every figure is a published amount, a count, or visible arithmetic over visible inputs.
- Model outputs are labeled with the model that produced them, including confidences.
- CPT descriptors are AMA licensed and are not distributed; HCPCS Level II descriptions (public domain) are.
- All generated copy contains no hyphens or dashes.

## Attribution

NER and PII models are from the [OpenMed](https://github.com/maziyarpanahi/openmed) project (Apache 2.0), converted to int8 ONNX for browser inference. See [NOTICE](NOTICE) for full attributions.
