<div align="center">

# ◈ Synthure

**A clinical note normalization and claim readiness copilot.**

Synthure accepts a messy clinical note (SOAP, discharge summary, referral, ER note, radiology report, intake form, or pasted physician text), uses **OpenMed** as the clinical NLP backbone for de identification and biomedical entity extraction, then runs **Synthure trained task specific models** on top to classify the note, parse its sections, rank ICD candidates, detect missing documentation, and score claim and prior authorization readiness with calibrated confidence and an abstention layer. The output is one auditable, structured record with a human review step. The patient, physician, hospital, and employer views are projections of that record, not separate dashboards.

This is a **research and prototype grade** ML workflow system with auditable outputs, human review, and measurable evals. It is not a production medical device.

[Live demo](https://synthure.vercel.app) · [Model evaluations](https://synthure.vercel.app/evals) · [Research notes](https://synthure.vercel.app/research)

</div>

---

## Table of contents

1. [Why Synthure exists](#why-synthure-exists)
2. [How it works: the pipeline](#how-it-works-the-pipeline)
3. [The privacy model](#the-privacy-model)
4. [Everything is real data](#everything-is-real-data)
5. [The four portals](#the-four-portals)
6. [One interconnected encounter](#one-interconnected-encounter)
7. [Claim readiness, not a denial score](#claim-readiness-not-a-denial-score)
8. [Alignment and safety layer](#alignment-and-safety-layer)
9. [Project structure](#project-structure)
10. [Local development](#local-development)
11. [Rebuilding the models and data](#rebuilding-the-models-and-data)
12. [Deployment](#deployment)
13. [Configuration](#configuration)
14. [Honesty rules this repo follows](#honesty-rules-this-repo-follows)
15. [Evaluation status](#evaluation-status)
16. [Known limitations and roadmap](#known-limitations-and-roadmap)
17. [Attribution and licenses](#attribution-and-licenses)

---

## The ML architecture

The pipeline is: **raw note → OpenMed de identification and entity extraction → note type classifier → section parser → clinical schema builder → ICD candidate ranker → missing information detector → claim and prior authorization readiness predictor → calibration and abstention layer → human approval → downstream portal views.**

**OpenMed is the clinical NLP backbone** (de identification, PII detection, biomedical NER, medical embeddings), used as provided.

**Synthure owns and trains the task specific models** (`ml/`, exported to `frontend/lib/models/`, run in process):

| Model | Type | Purpose |
|---|---|---|
| note type | TF IDF + logistic regression | classify the note type |
| section parser | rule based | detect and span clinical sections |
| ICD reranker | logistic regression | rank candidates from the official ICD 10 CM index |
| missing info | per field logistic regression | flag absent required documentation |
| readiness | gradient boosted trees + isotonic calibration | calibrated claim / prior auth readiness |

**Claude is never the runtime decision maker.** It is used only for synthetic note augmentation, weak labeling, adversarial test cases, rubric based evaluation, and plain language narration of the finished record.

Every model is trained and evaluated in a reproducible harness. Measured on a held out synthetic test split (labels are exact gold; absolute numbers will be lower on real clinical text, which is stated plainly): note type accuracy 1.00, section F1 0.82, ICD top 3 accuracy 0.82 with a 0.0 hallucination rate, missing info micro F1 0.75, readiness AUROC 0.84 and AUPRC 0.90 with ECE 0.054, abstention lifting accuracy from 0.88 to 0.92, and OpenMed de identification recall 1.00 with disease NER recall 0.83. See the [evaluations page](https://synthure.vercel.app/evals) and [`ml/README.md`](ml/README.md).

## Why Synthure exists

A single clinical encounter creates work for four different people who each open a different piece of software: the patient trying to understand a diagnosis and a bill, the physician coding the visit and chasing prior authorization, the hospital revenue cycle team constructing and defending the claim, and the employer benefits team watching population cost. Today that is four people doing four jobs in four systems from one note.

Two things stop a language model from doing this in one pass in the real world: **patient data cannot leave the building**, and **a model that invents a billing code is worse than useless**. Synthure is built around solving exactly those two constraints. The note is de identified on the user's own device before anything is transmitted, and diagnosis codes are chosen from the official ICD 10 CM index rather than generated, so an out of index code is impossible by construction. Everything else follows from taking those two rules seriously.

## How it works: the pipeline

There is **no fallback path**. If a stage cannot run, the product surfaces the error instead of silently degrading to a weaker method. The stages are:

**1. De identification, on device.**
`OpenMed-PII-ClinicalE5-Small-33M` (int8 ONNX, running via transformers.js in the browser) scans the note for the 18 Safe Harbor identifier classes and replaces each span with a typed placeholder such as `[FIRST_NAME]`. The raw note is never transmitted. Only the de identified text and the extracted entities are sent to the API route.

**2. Biomedical NER, on device.**
`OpenMed-NER-DiseaseDetect-TinyMed-65M` and `OpenMed-NER-PharmaDetect-TinyMed-65M` extract diagnosis and drug entities, each carrying a real softmax confidence from the model (not an invented number). Symptom and lab spans are tagged by a Claude call whose outputs are accepted only if they appear verbatim, character for character, in the note. Medication entities are kept only if they match the NLM RxNorm prescribable vocabulary, so a hallucinated drug name is dropped.

**3. Code linking, constrained choice.**
For each diagnosis entity, candidate codes are retrieved from the official CDC/NCHS ICD 10 CM FY2026 alphabetic index (a token overlap search over roughly 168,000 index terms). A Claude call then selects the single best candidate for each entity **or abstains**. Selections outside the retrieved candidate set are rejected server side. A code that is not in the official index therefore cannot appear, which is the structural answer to code hallucination. Every accepted code is validated against the CMS tabular and carries its billable flag. Literal codes written in the note are validated the same way against the tabular and the fee schedules.

**4. Risk and readiness, sourced.**
Readmission is a lookup of the CMS published 30 day rate for the encounter's matched measure cohort. Claim readiness is a checklist where every line cites the published rule it reads (see [Claim readiness](#claim-readiness-not-a-denial-score)). No denial probability is shown anywhere, because no public claim adjudication dataset exists to justify one.

**5. Four writer agents.**
Claude Haiku writes the four role specific reports (Sonnet takes over on the frontier lane, when a blocking readiness check fails), grounded strictly in the extracted facts, using the real CMS fee schedule amounts for cost figures.

**6. Verify, critique, revise.**
A verifier and a constitution critic audit every report. Any flagged report is sent back through its own writer with the critique attached, and the revised version is streamed to the UI. This is the critique and revise loop made real rather than decorative.

**7. Orchestrate.**
An orchestrator reads the final, post revision reports and produces the cross portal narrative that shows how the same facts drive each reader.

The browser streams each stage to the console as Server Sent Events, with the model id and elapsed milliseconds for every step.

## The privacy model

The three OpenMed models total about 165 MB. They download once, cache in the browser, and run through a vendored transformers.js plus ONNX Runtime Web (wasm) build served from this repository under `frontend/public/vendor/`. There is no external model host and no external inference call for extraction.

The consequence that matters: the API route only ever receives the **de identified** note plus a list of entities. The identifiable text stays on the user's machine. This is the capability that lets a clinical product touch a real note at all, and it is the core reason Synthure is not a thin wrapper over a chat API.

The synthesize route is rate limited per visitor (6 runs per hour) and globally (200 runs per day) to bound the cost of the one paid dependency, the Claude API.

## Everything is real data

Every figure the product shows is a published amount, a count, or visible arithmetic over visible inputs. Nothing is a tuned constant dressed up as knowledge.

| What | Rows | Source |
|---|---|---|
| Diagnosis codes, descriptions, billable flags | 98,186 | CDC/NCHS ICD 10 CM FY2026 order file |
| Alphabetic index terms for code linking | ~168,000 | CDC/NCHS ICD 10 CM FY2026 index |
| Priced services (procedures and labs) | 9,724 | CMS Physician Fee Schedule (rvu26a) + Clinical Lab Fee Schedule 2026 |
| Prior authorization requirement | list | CMS hospital OPD prior authorization list + published commercial lists |
| Readmission rates and cohorts | 6 cohorts | CMS Unplanned Hospital Visits, national (data.cms.gov dataset cvcs-xecj) |
| Population categories | ~540 | AHRQ HCUP CCSR v2025 1 |
| Medication vocabulary (ingredients and brands) | 9,576 | NLM RxNorm prescribable content |
| Consumer language for diagnoses | on demand | MedlinePlus Connect (NLM), cited in the UI |

CPT descriptors are copyright of the American Medical Association and are **not** distributed with this project. Numeric CPT payment amounts derive from the public CMS RVU file; HCPCS Level II codes (public domain) keep their descriptions.

Plan design values (deductible remaining, coinsurance, out of pocket maximum) are not hidden constants. They are visible, editable inputs in the patient portal, defaulted to published KFF Employer Health Benefits Survey averages, and the cost estimate is ordinary benefit arithmetic over them: deductible first, then coinsurance, capped by the remaining out of pocket maximum.

## The four portals

The four reports are not lookalike tabs. Each opens as a distinct interface that behaves like the software that reader would actually use.

- **Patient portal.** A light consumer health app: plain language diagnosis cards (preferring MedlinePlus text where available), medication cards, a cost estimator over the editable plan design, next steps, and a when to seek care panel.
- **Care Navigator (clinician).** A dense workspace: suggested ICD 10 codes with billable and provenance chips (linked from which entity, or written literally in the note), the claim readiness checklist with a fix for each flagged item, a prior authorization action, and documentation prompts.
- **Revenue Cycle (hospital).** A claim operations view: line items priced from the CMS schedules, expected reimbursement versus at risk dollars (dollars tied to a failing readiness check), the readiness checklist, and the CMS readmission exposure.
- **Benefits Analytics (employer).** An aggregated, anonymized population view built from the AHRQ CCSR category of the encounter and from the real history of encounters synthesized in this browser, with an honest empty state before any exist.

## One interconnected encounter

The four portals share a single mutable encounter object (`lib/encounter.ts`). An action in any portal mutates that state and a pure `derive()` recomputes readiness, cost, and reimbursement, so changes ripple:

- Approving the required prior authorization flips its readiness check to pass, moves the at risk dollars into expected reimbursement, and shows the patient the procedure as covered.
- Toggling a diagnosis or removing a procedure recomputes the claim, the patient estimate, and the employer aggregates.
- Editing the plan design recalculates the patient out of pocket estimate.

Every action emits a cross portal event, and each portal carries an inbox so any one can message another. The propagation is covered by a headless reducer test rather than a browser check.

## Claim readiness, not a denial score

The previous version of Synthure scored a fabricated denial risk from note keywords. That is gone. Predicting denials honestly requires a dataset of real paid versus denied outcomes, which is PHI protected and not public, so Synthure predicts nothing there.

In its place is a deterministic **claim readiness checklist**, where every line is computable from a published rule and cites its source:

- **Diagnosis codes are billable.** Reads the billable flag from the CMS ICD 10 CM order file (a category header such as `E11` fails; `E11.9` passes).
- **Procedures have a supporting diagnosis.** Structural check that medical necessity can be established.
- **Required prior authorization on file.** Reads the CMS OPD prior authorization list and published commercial lists.
- **Encounter is coded.** Structural completeness.
- **Network status** and **prior denial history.** Advisory flags, true only when the note states them.

The summary number is simply the share of checks flagged, not a weighted score, and the encounter routes to the frontier review lane when any blocking check fails. Readiness is the interface; there is no black box probability.

## Alignment and safety layer

After the writers run, an inference time safety layer applies techniques from the alignment literature (it does not train a reward model):

- **A clinical constitution** (Constitutional AI style). Six principles: no fabricated codes, no agent issued prescribing or diagnosing, cost figures labeled as estimates, no identifying information in aggregate views, abstention under low confidence, and risk numbers that come from data or are not shown. A Claude constitution critic plus deterministic checks audit every report, and violations trigger the revision pass.
- **An autonomy gate.** Each action is routed to one of three tiers: automated (draft a prior authorization, prepare an appeal, generate patient education), single human approval (file the authorization, submit the claim, message the patient), or prohibited (prescribe, diagnose, change treatment). The prohibited tier is a design constraint; those actions are never generated.
- **Selective prediction.** When the minimum model confidence falls below 0.60, or no codes are confidently resolved, the encounter abstains and escalates to a human coder instead of auto routing.

## Project structure

```
synthure/
├── frontend/                          # The product (Next.js 14 App Router, deploys to Vercel)
│   ├── public/models/                 # OpenMed int8 ONNX models (browser inference)
│   │   ├── pii-clinicale5-33m/
│   │   ├── disease-tinymed-65m/
│   │   └── pharma-tinymed-65m/
│   ├── public/vendor/transformers/    # Self contained transformers.js + ORT wasm
│   ├── data/                          # Knowledge artifacts (gzip JSON) + sources.json
│   ├── lib/
│   │   ├── openmed.ts                 # On device de-id + NER (spans, real confidences)
│   │   ├── openmedModels.ts           # Model registry (server safe, no wasm import)
│   │   ├── knowledge.server.ts        # ICD index search, tabular, fee schedules, RxNorm, MedlinePlus
│   │   ├── risk.ts                    # Readiness checklist + CMS readmission lookup
│   │   ├── encounter.ts               # Shared live encounter + benefit arithmetic
│   │   ├── history.ts                 # Real population aggregates (localStorage)
│   │   ├── safety.ts                  # Constitution, autonomy gate, selective prediction
│   │   └── useSynthesis.ts            # Orchestrates on-device stages then the SSE stream
│   ├── app/api/synthesize/route.ts    # Pipeline: span tag, linking, writers, verify, revise
│   ├── app/demo/page.tsx              # Synthesis console
│   ├── app/page.tsx                   # Landing
│   ├── app/research/page.tsx          # Research notes
│   └── components/portals/            # The four interconnected stakeholder portals
├── scripts/build_knowledge/build.py   # Stdlib pipeline: CDC/CMS/AHRQ/NLM -> data artifacts
├── scripts/build_models/convert.py    # Export OpenMed checkpoints to int8 ONNX
├── ml/                                # Trained models + the evaluation harness
│   ├── run_evals.py                   # One command: build the canonical evals.json, gate it
│   ├── eval_schema.py                 # Canonical metric schema, provenance + regression gates
│   ├── evaluate.py                    # Tabular + OpenMed suite
│   └── artifacts/eval_history.jsonl   # Regression history, one row per run
├── frontend/data/evals.json           # The single source of truth the /evals page reads
├── .github/workflows/eval.yml         # CI: graders + eval gate on every pull request
└── NOTICE                             # OpenMed (Apache 2.0) and data attributions
```

## Local development

```bash
cd frontend
npm install
ANTHROPIC_API_KEY=sk-... npm run dev
```

Open `http://localhost:3000`. The OpenMed models and the knowledge artifacts ship with the repository, so the only credential you need is an Anthropic API key for the writer, verifier, and orchestrator agents. On the first run the browser downloads the three models (about 165 MB, cached afterward); the console shows a per model progress bar while it happens.

Without an API key the on device stages (de identification and NER) still run and display, and the pipeline then stops with an honest "synthesis service is not configured" message rather than falling back to a weaker method.

## Rebuilding the models and data

Both are reproducible from source and committed so a normal clone needs neither step.

**Knowledge artifacts** (Python standard library only, no dependencies):

```bash
python3 scripts/build_knowledge/build.py           # all artifacts
python3 scripts/build_knowledge/build.py pfs readm  # just named stages
```

This downloads the primary sources (CDC ICD 10 CM, CMS fee schedules, CMS readmission data, AHRQ CCSR, NLM RxNorm), transforms them, and writes gzipped JSON plus `sources.json` into `frontend/data/`. Downloads are cached under `scripts/build_knowledge/.cache/`.

**OpenMed models to ONNX** (needs `optimum` and `transformers`, see `scripts/build_models/requirements.txt`):

```bash
pip install -r scripts/build_models/requirements.txt
python3 scripts/build_models/convert.py frontend/public/models
```

This exports each OpenMed checkpoint to int8 quantized ONNX in the layout transformers.js expects.

## Deployment

The product is the `frontend/` directory and deploys to Vercel from `main` on every push (no separate backend). Set `ANTHROPIC_API_KEY` in the Vercel project. The Next.js route handler is the only server side surface; the models, wasm runtime, and data artifacts are served as static assets, so the whole thing runs on the Vercel free tier.

`next.config.mjs` traces the `data/` artifacts into the synthesize function and keeps transformers.js out of the server bundle (it is loaded at runtime in the browser from the vendored self contained build).

> Note on repository size: the three model files and the wasm binaries total roughly 200 MB of committed binaries, and the largest model is above GitHub's 50 MB soft limit. This works today; moving the models to Git LFS or a CDN is the clean next step before it bumps a hosting limit.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes (for synthesis) | Writer, verifier, critic, orchestrator, span tagging, code linking |

Rate limits live in `app/api/synthesize/route.ts` (`RL_PER_IP_HOUR`, `RL_GLOBAL_DAY`).

## Honesty rules this repo follows

- **No fallback chains.** If a stage cannot run, the product says so rather than silently degrading.
- **No invented numbers.** Every figure is a published amount, a count, or visible arithmetic over visible inputs.
- **Labeled provenance.** Model outputs carry the model that produced them, including confidences; consumer text carries its source.
- **Codes cannot be invented.** Linking is constrained choice over the official index; literal codes are validated against the tabular.
- **No AMA licensed content.** CPT descriptors are not shipped; public domain HCPCS descriptions are.
- **No hyphens or dashes** in any product copy or generated report.

## Evaluation status

Every number the product and the paper display resolves to one file, `frontend/data/evals.json`, generated by `python3 ml/run_evals.py`. It folds the tabular and OpenMed suite (`ml/evaluate.py`) and the neural coder and data engine numbers into one document where each metric carries its dataset, its source, and an honest status: **measured**, **deferred**, or **by construction**. Two gates run on every build and in CI: a provenance gate that fails if a headline metric lacks a backing record, and a regression gate that fails if a measured metric drops below its committed floor. Metric drift is tracked in `ml/artifacts/eval_history.jsonl`, and the live [evals page](https://synthure.vercel.app/evals) renders the whole document.

The shipped tabular numbers are measured on a synthetic split whose labels leak, so they are labeled as a floor test rather than a generalization estimate (this is why the note type accuracy reads 1.00). The honest generalization numbers, a frozen real note holdout, a cross encoder faithfulness AUROC, and a human judged fabrication rate, are present as **deferred** until the training run that produces them, so they are visible as open items instead of silently missing. See the roadmap below.

## Known limitations and roadmap

- **Re benchmark the current pipeline.** Measure OpenMed on device NER and constrained code linking directly, rather than citing the previous pipeline's numbers.
- **Denial prediction stays out** until a real claim adjudication dataset is available under agreement. Sourced readiness facts are shown instead of a fabricated probability.
- **Move model weights to Git LFS or a CDN** to get the binaries out of the git tree.
- **A feedback flywheel.** Log critic corrections and clinician thumbs signals as a growing, proprietary dataset. That is the only version of model training that would create a compounding advantage, and it is the prerequisite for it.
- **Server authoritative encounter.** The shared encounter is client side today; an event sourced, multi user version is future work.

## Attribution and licenses

The NER and PII models are from the [OpenMed](https://github.com/maziyarpanahi/openmed) project (Apache 2.0), created by Maziyar Panahi and contributors, converted here to int8 ONNX for in browser inference with the weights otherwise unmodified. The vendored transformers.js runtime (`@huggingface/transformers`, Apache 2.0) and the ONNX Runtime Web wasm binaries (MIT) are redistributed under `frontend/public/vendor/`. Knowledge artifacts are built from public United States government and NLM sources. See [NOTICE](NOTICE) for the full attributions.
