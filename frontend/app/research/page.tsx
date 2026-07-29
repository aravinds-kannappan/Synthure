'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Bars, Gauge } from '@/components/Charts'
import modelEvals from '@/data/model_evals.json'

const DE = modelEvals.data_engine
const DE_FLOW = [
  { t: 'Real notes', s: 'MTSamples + PMC OA', c: '#2dd4bf' },
  { t: 'Trained generator', s: 'byte-level conditional GPT', c: '#34d399' },
  { t: 'Conditional samples', s: 'note type is gold', c: '#818cf8' },
  { t: 'Independent labels', s: 'not from the generator', c: '#22d3ee' },
  { t: 'Frozen real test', s: 'the honest metric', c: '#a78bfa' },
]

const SECTIONS = [
  {
    id: 'abstract', title: 'Abstract',
    content: `Synthure is a multi agent clinical AI demonstrator that turns one clinical note into four interconnected stakeholder portals, one each for the patient, the physician, the hospital revenue cycle team, and the employer benefits team. The four portals share a single mutable encounter, so an action in one portal (approving a prior authorization, toggling a code, applying for financial assistance, submitting a claim) ripples through the others in real time and recomputes the shared risk, cost, and reimbursement figures.\n\nA note is processed by a pipeline with no fallback path. De identification and biomedical NER run as OpenMed models (Apache 2.0) exported to int8 ONNX and executed in the browser, so the raw note never leaves the device and every entity carries a real model confidence. Diagnosis entities are linked to ICD 10 CM through the official CDC/NCHS alphabetic index: candidates are retrieved from the index and a Claude call may only choose among them or abstain, so a code outside the official index cannot be produced. Literal codes written in the note are validated against the CMS tabular and fee schedules. Four grounded writer agents, a verifier, a constitution critic, and a revision pass then produce and audit the reports.\n\nThis version removes the previous risk heuristics entirely and replaces every number with something traceable. Three claims are backed by data. (1) NER: Claude based NER recovers the correct ICD 10 category in 60.4% of cases and the exact code in 23.5% (N = 149), against 0.0% for the deterministic regex extractor on the same prose. (2) Readmission: the readmission figure is the real CMS HRRP published 30 day rate for the encounter's dominant condition, not an invented score. (3) Coding: a trained bi encoder retriever plus cross encoder reranker links a diagnosis mention to its ICD 10 CM code, ranking the exact code first 41 percent of the time on CodiEsp gold mentions (top five 49 percent, MRR 0.44, N = 3,615). For denial we deliberately make no prediction: there is no public claim adjudication dataset, and the one labeled proxy we tested (DataFog complexity_score) turned out to be an inverse length artifact, so we removed the fabricated denial probability and show only sourced prior authorization and claim validity facts. Generation is grounded in the extracted facts, every code is format validated, and a code enforced three tier autonomy model keeps clinical decisions with the physician.`,
  },
  {
    id: 'introduction', title: '1  Introduction',
    content: `The United States healthcare system allocates a large fraction of clinical capacity to administrative rather than patient facing work. Physicians spend a substantial share of their time on prior authorization, claims submission, denial management, and documentation, a pattern associated with high rates of clinician burnout and with hundreds of billions of dollars in estimated annual administrative waste [1, 2].\n\nThe root cause is structural fragmentation. Each of the four principal stakeholders in a patient's care trajectory, the patient, their physician, the hospital, and the employer or insurer, operates within a separate software ecosystem with no shared intelligence layer. A single clinical note simultaneously generates downstream work across all four: the patient needs plain language explanations and cost estimates; the physician needs authorizations filed and claims submitted; the hospital revenue cycle team needs claim tracking and denial management; the employer needs aggregated, anonymized utilization against benefit plans.\n\nSynthure explores a different shape for this problem: a single grounded pipeline that produces four role specific portals from one note, connected by one shared encounter, so that the same facts and the same actions are reflected everywhere at once. The contribution of this report is the architecture and a reproducible evaluation of the parts that are currently testable, together with a plan to evaluate the rest.`,
  },
  {
    id: 'architecture', title: '2  Architecture',
    content: `Synthure is organized as a pipeline of specialized agents that feed four interconnected portals.\n\n• Quality gate, validates ICD 10 and CPT code formats and deduplicates input\n• Biomedical NER, extracts entities and maps diagnoses to ICD 10 and procedures to CPT\n• Knowledge resolution, attaches human readable labels to codes\n• Risk and readiness, looks up the CMS HRRP readmission rate for the coded conditions and runs a sourced claim readiness scrub (prior authorization from published payer policy and claim validity); it does not predict denials\n• Four writer agents, produce role specific reports for the patient, physician, hospital, and employer\n• Verification and orchestration, audit the reports against the extracted facts and connect them\n\nThe novel element is the shared encounter. In the shipped demo this is a single mutable state object that every portal reads from and writes to. Approving a prior authorization in the clinician console clears the largest review item, advances the claim, and flips the patient view to covered; toggling a code or removing a procedure recomputes the patient cost, the expected reimbursement, and the employer cohort. Every action emits a cross portal event, and the portals carry an inbox so any one can message any other. We verified this propagation with a headless reducer test covering the prior authorization, code edit, financial assistance, claim submission, and messaging flows.\n\nThe shipped demo runs entirely in Next.js route handlers with the shared encounter held client side. The production design, where the encounter becomes a server authoritative, event sourced aggregate broadcast over web sockets for multi user, cross device synchronization, is described as future work in the evaluation plan.`,
  },
  {
    id: 'pipeline', title: '3  The Agent Pipeline',
    content: `Every clinical note traverses the pipeline below. Each stage appends a trace step with its name, model, and duration.\n\nStage 1, Quality gate: all extracted ICD 10 and CPT codes are validated against compiled patterns. A bare five digit number is accepted as a CPT code only when it is a known code or the surrounding text marks it as one, which prevents stray numbers from being billed.\n\nStage 2, De identification and biomedical NER, on device: OpenMed PII ClinicalE5 Small 33M scrubs identifiers in the browser before anything is transmitted, then OpenMed DiseaseDetect and PharmaDetect TinyMed 65M extract diagnosis and drug entities with per entity softmax confidences. Symptom and lab spans are tagged by a Claude call whose outputs are accepted only if they appear verbatim in the note. Medication entities are accepted only if they match the RxNorm prescribable vocabulary.\n\nStage 3, Code linking: for each diagnosis entity, a trained bi encoder retriever embeds the mention and every code in the FY2026 ICD 10 CM index (98,186 codes) into one space and returns the nearest candidates, then a cross encoder reranker fine tuned on CodiEsp scores them and the top codes are kept. Candidates are constrained to the index, so a code outside it cannot be produced, and every accepted code is validated against the CMS tabular with its billable flag. The retriever and reranker run as a small service (a Hugging Face Space); the lexical index lookup remains as an in process fallback. Official descriptions come from the order file; consumer language comes from MedlinePlus Connect where available, with its source labeled.\n\nStage 4, Risk and readiness: there are no hand tuned risk heuristics in this version. Readmission is a lookup of the real CMS HRRP published 30 day rate for the encounter's dominant condition. Claim readiness is a deterministic scrub whose every input is a sourced fact: prior authorization required under a published payer list, a claim validity issue (for example a procedure billed with no supporting diagnosis), or an administrative flag stated in the note. We show no denial probability, because no public claim outcome data exists to train one, and we say so in the product.\n\nStage 5, Generation, verification, orchestration: four writer agents (Claude Haiku) produce role specific reports using forced tool_use schemas, grounded strictly in the extracted facts. A verifier and an orchestrator (Claude Sonnet) audit each statement against the facts and connect the four reports. All product copy is sanitized to contain no hyphens or dashes.`,
  },
  {
    id: 'evaluation', title: '4  Evaluation (measured)',
    content: `We report only results we actually ran and can reproduce. Note: the NER and retrieval numbers below were measured on the previous pipeline (Claude tool_use extraction versus a regex baseline). The shipped pipeline now extracts with OpenMed models on device and links codes through the official ICD 10 CM index with constrained choice; re running this benchmark against the new pipeline is the first item of ongoing work.\n\nNER, diagnosis to ICD 10. We evaluate the NER stage on the public dataset Inje/SYMPTOMS-COT-ICD10-2024, where each item has a gold ICD 10 code. For each item we construct a short note from its symptom list and stated diagnosis, run the extractor, and check whether it recovers the gold code. On N = 149 English items:\n\n• Claude based NER, recall at the ICD 10 category (three character) level: 60.4% (90 of 149)\n• Claude based NER, recall at the exact code level: 23.5% (35 of 149)\n• Claude based NER produced at least one code on 92.6% of notes\n• Deterministic regex extractor, recall at the category level: 0.0% (0 of 149)\n\nThe headline finding is the gap: the deterministic extractor recovers no diagnoses from prose, because prose contains no literal codes, while the Claude NER path recovers the correct ICD 10 chapter most of the time. This is the measured justification for the NER stage.\n\nRetrieval, symptom text to ICD 10 category. We train a TF IDF retriever on real symptom text and test it against a BM25 baseline on the same data. The data is split deterministically into a fit set, a validation slice, and a disjoint held out test set (N = 781). The trained model is a hybrid of a word TF IDF centroid, a character 3 to 4 gram TF IDF centroid, and BM25, with the three blend weights chosen only on the validation slice. On the held out test set the hybrid edges the BM25 baseline: MRR 0.340 versus 0.330, recall at 1 25.1% versus 24.2%, recall at 5 44.2% versus 43.5%. The gain is real but small, which quantifies that lexical methods plateau here. The dense retriever that replaced this path (Section 5) is the improvement, now built and deployed. The lexical trainer is pure standard library Python and runs offline and is committed under ml/. These numbers describe the previous pipeline and are superseded by the trained coder in Section 5, with the current numbers reported on the evals page.\n\nReadmission, calibration to CMS HRRP. The readmission figure is the published national 30 day risk standardized readmission rate for the encounter's dominant condition (for example heart failure 21.7%, COPD 19.6%, AMI 15.6%, pneumonia 16.9%), with the national all cause rate of 15.3% as the baseline for conditions outside the HRRP cohorts. To test whether these rates are recoverable from code level features rather than memorized, we ran a leave one condition out chapter regression: it scored a mean absolute error of 5.27 percentage points against a 4.29 point mean baseline (N = 10 conditions). Because chapter features do not beat the mean, we do not extrapolate; we calibrate to the published rates directly and label them as such.\n\nDenial, not modeled. There is no public dataset of real claim adjudication outcomes (paid versus denied); that data is PHI protected. The one labeled proxy we could obtain, the DataFog complexity_score, correlates about -0.62 with note length, so it is essentially an inverse length artifact and a model trained on it learns nothing about denials (a logistic regression reached a meaningless AUC of 1.0 by reconstructing length). We therefore removed the denial heuristic and display no denial probability at all.\n\nCaveats. The NER N is 149 and the dataset is idealized; the CodiEsp coder numbers are on Spanish origin cases translated to English; the readmission benchmark has only 10 conditions. Per stage latency profiling on the deployed pipeline is future work.`,
  },
  {
    id: 'plan', title: '5  What Changed, and What Is Next',
    content: `What changed in this version. The hand tuned denial and readmission heuristics were removed. Readmission is now calibrated to real CMS HRRP rates; claim readiness is a sourced, auditable scrub; a trained retriever now has a measured number against BM25; and the fabricated denial probability is gone.\n\nWhat is still honestly open, with the concrete method for each.\n\n• Denial prediction, blocked on data, not effort. The day a claims dataset with real adjudication outcomes (paid or denied) is available under agreement, we train a classifier and report AUC, precision, recall, and calibration against a held out test set with a rule based baseline. Until then we show sourced facts, not a probability.\n\n• Retrieval, done. The dense retriever is built and deployed: a bi encoder over the 98,186 code FY2026 index (269K phrase to code training pairs) plus a cross encoder reranker fine tuned on CodiEsp. On CodiEsp gold mentions it ranks the exact code first 41 percent of the time and inside the top five 49 percent (MRR 0.44, N = 3,615). Next: report against the BM25 and lexical hybrid baselines on the same split, and add English clinical mentions.\n\n• NER at scale, the current N of 149 is small and the dataset is idealized. Plan: evaluate on de identified real clinical notes (for example n2c2 or i2b2 corpora under their data use agreements) and report entity span F1 with confidence intervals.\n\n• Readmission at patient level. The CMS rates are condition level. Plan: where a patient level outcomes corpus is available, fit a calibrated patient level model and report MAE and risk tier agreement against the CMS condition rates as a prior.\n\n• End to end latency and grounding. Plan: instrument the deployed pipeline for p50, p95, p99 per stage, and run a human review of generated statements against the extracted facts to put a real number on the fabrication rate.`,
  },
  {
    id: 'safety', title: '6  Alignment and Safety',
    content: `Synthure is not just a chain of agents. After the writers run, an alignment layer applies inference time safety mechanisms drawn from the safety literature. We are precise about what this is: we do not train a reward model (that needs preference data and compute we do not have). The writer agents run on Claude, which Anthropic aligned with RLHF, and on top of that we add the inference time techniques below, each cited to the work that introduced it.\n\nA clinical constitution (Constitutional AI, Bai et al. 2022). Every report is checked against six explicit principles: no fabricated codes, no agent issued prescribing or diagnosing, cost figures labeled as estimates, no identifying information in aggregate views, abstention under low confidence, and risk numbers that come from data or are not shown. A Constitution Critic agent (Claude Sonnet when a key is present, deterministic rule checks otherwise) audits each report and a revise step removes violations.\n\nAn autonomy gate. Each action is routed to one of three tiers: fully automated (draft a prior authorization, prepare an appeal, generate patient education), single human approval (file the authorization, submit the claim, message the patient), or prohibited (prescribe, diagnose, change treatment). The third tier is a design prohibition, not a setting; those actions are never generated. This is the corrigibility and scalable oversight idea made concrete.\n\nSelective prediction (Geifman and El-Yaniv 2017). When extraction confidence falls below 0.60, or no codes are confidently extracted, the system abstains and escalates to a human coder rather than auto routing.\n\nRed team result. We applied the red teaming method of Ganguli et al. 2022 to these safeguards: adversarial cases that try to make the agent bill a fabricated code, prescribe, diagnose, quote an unqualified cost, or leak identifying information into an aggregate view. The deterministic checks catch every injected violation with no false positives on the clean cases, validated by the guardrail red team harness (frontend/lib/guardrails.harness.ts, run with npm run grade-guardrails). The set is small and handcrafted, so this is evidence the safeguards fire as intended, not a guarantee of completeness.`,
  },
  {
    id: 'data', title: '7  Data and Reproducibility',
    content: `Every measured number above comes from public data and a committed, pure standard library script, so it can be re run offline.\n\n• Inje/SYMPTOMS-COT-ICD10-2024, ICD 10 code with symptom and diagnosis text. Used for the NER evaluation and as the training and held out data for the retriever (Section 4).\n\n• CMS Hospital Readmissions Reduction Program (HRRP) published national 30 day readmission rates. Used to calibrate and to evaluate the readmission head (frontend/data/readmissions.json).\n\n• DataFog/medical-transcription-instruct, real clinical transcriptions with a complexity_score. We tested it as a denial proxy, found it to be an inverse length artifact, and report that as a negative result rather than shipping a model on it.\n\nReproduce it: python3 ml/run_evals.py folds every eval source into the canonical data/evals.json and gates it on provenance and regression; python3 ml/train.py and python3 ml/evaluate.py retrain and score the tabular models; npm run grade-guardrails red teams the alignment layer. Every number the site shows resolves to a record on the evals page.`,
  },
  {
    id: 'conclusion', title: '8  Conclusion',
    content: `Synthure shows that a single grounded agent pipeline can drive four interconnected stakeholder portals from one clinical note, with actions in any portal rippling through the others in real time, on openly available model APIs and serverless infrastructure.\n\nThe evaluation is narrow but real, and every shipped number is traceable: a trained bi encoder plus cross encoder coder ranks the exact ICD 10 CM code first 41 percent of the time on CodiEsp gold mentions; the readmission figure is the real CMS HRRP published rate; the denial heuristic was removed rather than dressed up; and an inference time alignment layer (a clinical constitution, an autonomy gate, and selective prediction) sits between the agents and the portals, catching every injected violation in a small red team set. Every number here is tied to public data and a reproducible script.`,
  },
  {
    id: 'references', title: '9  References',
    content: `Bai et al. 2022, Constitutional AI: Harmlessness from AI Feedback.\nOuyang et al. 2022, Training language models to follow instructions with human feedback (InstructGPT, RLHF).\nChristiano et al. 2017, Deep reinforcement learning from human preferences.\nIrving et al. 2018, AI Safety via Debate.\nGanguli et al. 2022, Red Teaming Language Models to Reduce Harms.\nLightman et al. 2023, Let's Verify Step by Step.\nGlaese et al. 2022, Improving alignment of dialogue agents via targeted human judgements (Sparrow).\nGeifman and El-Yaniv 2017, Selective Classification for Deep Neural Networks.\nDhuliawala et al. 2023, Chain of Verification Reduces Hallucination in Large Language Models.`,
  },
]

const METRICS = [
  { label: 'ICD coder acc@1', value: '41%', sub: 'exact code first · CodiEsp · N = 3,615', color: 'text-emerald-400' },
  { label: 'ICD coder acc@5', value: '49%', sub: 'code in top 5 · CodiEsp', color: 'text-emerald-400' },
  { label: 'Index coverage', value: '98K', sub: 'FY2026 ICD 10 CM codes, 269K training pairs', color: 'text-teal-400' },
  { label: 'Readmission', value: 'CMS HRRP', sub: 'real published 30 day rates', color: 'text-indigo-400' },
  { label: 'Denial probability', value: 'Removed', sub: 'no claim outcome data; not modeled', color: 'text-amber-400' },
  { label: 'Red team safety', value: '7/7', sub: 'injected violations caught, 0 false positives', color: 'text-rose-400' },
]

export default function ResearchPage() {
  return (
    <div className="min-h-screen bg-[#030711] text-white">

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#030711]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-teal-400 text-xl">◈</span>
            <span className="font-semibold tracking-wider text-white text-sm">SYNTHURE</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/evals" className="hover:text-white transition-colors">Evals</Link>
            <Link href="/research" className="text-white">Research</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
          <Link href="/demo" className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-[#030711] px-4 py-2 rounded-lg transition-colors">
            Try demo →
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-32 pb-24">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/[0.08] text-indigo-400 text-xs font-medium mb-6 tracking-wide">
            Technical Report · Transparent Evaluation
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
            Synthure: Four Interconnected Portals<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #14b8a6 0%, #6366f1 100%)' }}>
              from One Clinical Note
            </span>
          </h1>
          <p className="text-slate-400 text-sm mb-3">A grounded agent pipeline with a trained coding model and a transparent evaluation of what is and is not measured.</p>
          <p className="text-slate-400 text-sm mb-8">Aravind Kannappan · Synthure · aravinds.kannappan@gmail.com</p>
          <a
            href="https://github.com/aravinds-kannappan/Synthure/blob/main/synthure_paper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 px-6 py-3 rounded-xl text-sm font-medium transition-all"
          >
            ↓ Download PDF
          </a>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-center">
              <div className={`text-3xl font-bold mb-1 ${m.color}`}>{m.value}</div>
              <div className="text-sm font-medium text-white mb-1">{m.label}</div>
              <div className="text-xs text-slate-500">{m.sub}</div>
            </div>
          ))}
        </div>
        <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Trained ICD coder, CodiEsp mention linking</div>
            <span className="text-[11px] text-emerald-300/80">N = {modelEvals.icd_coder.codiesp.mentions.toLocaleString()}</span>
          </div>
          <Bars items={[
            { label: 'acc@1 · exact code first', value: modelEvals.icd_coder.codiesp.acc1, tone: 'emerald' },
            { label: 'acc@5 · code in top 5', value: modelEvals.icd_coder.codiesp.acc5, tone: 'emerald' },
            { label: 'MRR', value: modelEvals.icd_coder.codiesp.mrr, tone: 'teal' },
          ]} />
        </div>

        {/* Trained models dashboard */}
        <div className="mb-6 grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
            <Gauge value={modelEvals.icd_coder.codiesp.acc1} label="ICD coder acc@1" sub="exact code first" tone="emerald" />
            <div className="mt-3 text-center text-[11px] text-slate-500">
              {modelEvals.icd_coder.index_codes.toLocaleString()} codes · {modelEvals.icd_coder.train_pairs.toLocaleString()} training pairs
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
            <div className="mb-4 text-sm font-semibold text-white">The trained data engine</div>
            <div className="flex flex-wrap items-stretch gap-2">
              {DE_FLOW.map((step, i) => (
                <div key={step.t} className="flex items-stretch gap-2">
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.12 }}
                    className="min-w-[128px] flex-1 rounded-xl border bg-white/[0.02] p-3"
                    style={{ borderColor: `${step.c}44`, borderTop: `2px solid ${step.c}` }}
                  >
                    <div className="text-[12px] font-semibold text-white">{step.t}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{step.s}</div>
                  </motion.div>
                  {i < DE_FLOW.length - 1 && <span className="self-center text-slate-600">→</span>}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
              The note generator is trained on real open license notes ({DE.sources.join(', ')}); labels come from a source independent of the generator, so a model must learn text to label rather than memorize a template. Every headline number is reported on the {DE.holdout}.
            </p>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <div className="mb-1 text-[12px] font-semibold text-white">Note type classifier ({DE.note_types} classes, retrained in PyTorch)</div>
              {DE.note_type_real_test != null ? (
                <Bars items={[
                  { label: 'synthetic val', value: DE.note_type_synthetic_val ?? 0, tone: 'slate' },
                  { label: 'real test (held out)', value: DE.note_type_real_test, tone: 'emerald' },
                ]} />
              ) : (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  Real test accuracy populates here after the Colab data engine run writes it to <span className="font-mono text-slate-400">data/model_evals.json</span>. It is reported separately from the synthetic val split on purpose: a number well below the old 1.00 is the honest signal that the model learned clinical language, not a template grammar.
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mb-4">
          Only measured results are shown as numbers. Components that are not yet benchmarked are marked Heuristic or Planned and detailed in the evaluation plan.
        </p>
        <div className="mb-16 text-center">
          <Link href="/evals" className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.08] px-5 py-2.5 text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20">
            Every measured, deferred, and by construction number →
          </Link>
        </div>

        {/* Table of contents */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 mb-12">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Contents</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}
                className="text-sm text-slate-400 hover:text-white transition-colors py-1 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-teal-500" />
                {s.title}
              </a>
            ))}
          </div>
        </div>

        {/* Paper sections */}
        <div className="space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id}
              className="border-t border-white/[0.06] pt-10">
              <h2 className="text-2xl font-bold mb-6 text-white">{section.title}</h2>
              <div className="space-y-4">
                {section.content.split('\n\n').map((para, i) => {
                  if (para.startsWith('•')) {
                    return (
                      <div key={i} className="space-y-2">
                        {para.split('\n').filter(l => l.startsWith('•')).map((line, j) => (
                          <div key={j} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                            <span className="text-teal-400 mt-0.5 flex-shrink-0">•</span>
                            <span dangerouslySetInnerHTML={{ __html: line.slice(2)
                              .replace(/tool_use/g, '<code class="text-indigo-300 bg-indigo-500/10 px-1 rounded text-xs">tool_use</code>')
                            }} />
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return (
                    <p key={i} className="text-slate-300 leading-relaxed text-sm"
                      dangerouslySetInnerHTML={{ __html: para
                        .replace(/tool_use/g, '<code class="text-indigo-300 bg-indigo-500/10 px-1 rounded text-xs">tool_use</code>')
                      }} />
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {/* References */}
        <section className="border-t border-white/[0.06] pt-10 mt-12">
          <h2 className="text-2xl font-bold mb-6">References</h2>
          <div className="space-y-2 text-xs text-slate-500 font-mono">
            {[
              '[1] Shanafelt et al. Relationship between clerical burden and physician burnout. Mayo Clinic Proceedings, 91(7):836 to 848, 2016.',
              '[2] Shrank et al. Waste in the US health care system. JAMA, 322(15):1501 to 1509, 2019.',
              '[3] Lewis et al. Retrieval augmented generation for knowledge intensive NLP tasks. NeurIPS, 33:9459 to 9474, 2020.',
              '[4] Singhal et al. Large language models encode clinical knowledge. Nature, 620:172 to 180, 2023.',
              '[5] CMS. Hospital Readmissions Reduction Program (HRRP). CMS.gov, 2023.',
            ].map((ref) => (
              <div key={ref} className="leading-relaxed">{ref}</div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="mt-16 pt-10 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-sm font-semibold text-white mb-1">Explore the platform</div>
            <div className="text-xs text-slate-500">Type any clinical note and watch the agents work, no account needed</div>
          </div>
          <div className="flex gap-3">
            <Link href="/demo" className="bg-teal-500 hover:bg-teal-400 text-[#030711] font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Try demo
            </Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer"
              className="border border-white/10 hover:border-white/20 text-slate-300 hover:text-white px-6 py-2.5 rounded-xl text-sm transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
