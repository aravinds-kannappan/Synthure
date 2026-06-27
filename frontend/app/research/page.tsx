'use client'
import Link from 'next/link'

const SECTIONS = [
  {
    id: 'abstract', title: 'Abstract',
    content: `Synthure is a multi agent clinical AI demonstrator that turns one clinical note into four interconnected stakeholder portals, one each for the patient, the physician, the hospital revenue cycle team, and the employer benefits team. The four portals share a single mutable encounter, so an action in one portal (approving a prior authorization, toggling a code, applying for financial assistance, submitting a claim) ripples through the others in real time and recomputes the shared risk, cost, and reimbursement figures.\n\nA note is processed by a pipeline of agents: format validation, biomedical named entity recognition (NER), knowledge resolution of codes to labels, deterministic risk scoring, four grounded writer agents, and a verification and orchestration pass. When an Anthropic API key is present, the NER and writer agents are live Claude calls with forced tool_use schemas; without a key, a deterministic engine runs the same pipeline so the demo always works.\n\nThis report is deliberately transparent about what has and has not been measured. We report a real evaluation of the NER stage on a public labelled dataset: Claude based NER recovers the correct ICD 10 category in 60.4% of cases and the exact code in 23.5% (N = 149), against 0.0% for the deterministic regex extractor on the same prose inputs. The denial, retrieval, and readmission components are not yet benchmarked. Rather than report numbers we cannot reproduce, we describe a concrete evaluation plan for each. Throughout, generation is grounded in the extracted facts, every code is format validated, and a code enforced three tier autonomy model keeps clinical decisions with the physician.`,
  },
  {
    id: 'introduction', title: '1  Introduction',
    content: `The United States healthcare system allocates a large fraction of clinical capacity to administrative rather than patient facing work. Physicians spend a substantial share of their time on prior authorization, claims submission, denial management, and documentation, a pattern associated with high rates of clinician burnout and with hundreds of billions of dollars in estimated annual administrative waste [1, 2].\n\nThe root cause is structural fragmentation. Each of the four principal stakeholders in a patient's care trajectory, the patient, their physician, the hospital, and the employer or insurer, operates within a separate software ecosystem with no shared intelligence layer. A single clinical note simultaneously generates downstream work across all four: the patient needs plain language explanations and cost estimates; the physician needs authorizations filed and claims submitted; the hospital revenue cycle team needs claim tracking and denial management; the employer needs aggregated, anonymized utilization against benefit plans.\n\nSynthure explores a different shape for this problem: a single grounded pipeline that produces four role specific portals from one note, connected by one shared encounter, so that the same facts and the same actions are reflected everywhere at once. The contribution of this report is the architecture and an honest, reproducible evaluation of the parts that are currently testable, together with a plan to evaluate the rest.`,
  },
  {
    id: 'architecture', title: '2  Architecture',
    content: `Synthure is organized as a pipeline of specialized agents that feed four interconnected portals.\n\n• Quality gate, validates ICD 10 and CPT code formats and deduplicates input\n• Biomedical NER, extracts entities and maps diagnoses to ICD 10 and procedures to CPT\n• Knowledge resolution, attaches human readable labels to codes\n• Risk scoring, computes deterministic denial and readmission estimates from the note text\n• Four writer agents, produce role specific reports for the patient, physician, hospital, and employer\n• Verification and orchestration, audit the reports against the extracted facts and connect them\n\nThe novel element is the shared encounter. In the shipped demo this is a single mutable state object that every portal reads from and writes to. Approving a prior authorization in the clinician console lowers the denial estimate, advances the claim, and flips the patient view to covered; toggling a code or removing a procedure recomputes the patient cost, the expected reimbursement, and the employer cohort. Every action emits a cross portal event, and the portals carry an inbox so any one can message any other. We verified this propagation with a headless reducer test covering the prior authorization, code edit, financial assistance, claim submission, and messaging flows.\n\nThe shipped demo runs entirely in Next.js route handlers with the shared encounter held client side. The production design, where the encounter becomes a server authoritative, event sourced aggregate broadcast over web sockets for multi user, cross device synchronization, is described as future work in the evaluation plan.`,
  },
  {
    id: 'pipeline', title: '3  The Agent Pipeline',
    content: `Every clinical note traverses the pipeline below. Each stage appends a trace step with its name, model, and duration.\n\nStage 1, Quality gate: all extracted ICD 10 and CPT codes are validated against compiled patterns. A bare five digit number is accepted as a CPT code only when it is a known code or the surrounding text marks it as one, which prevents stray numbers from being billed.\n\nStage 2, Biomedical NER: when an Anthropic key is present, a Claude agent reads the note and maps diagnoses to ICD 10 and procedures to CPT using a forced tool_use schema, including diagnoses written in plain language or as abbreviations (for example high blood pressure maps to I10). Without a key, a deterministic extractor uses a regular expression for literal codes plus a medication dictionary. Every returned code is format validated, so an invented or malformed code is dropped.\n\nStage 3, Knowledge resolution: codes are attached to human readable labels from a curated dictionary. The production design replaces this with semantic retrieval over the full ICD 10 corpus; see the evaluation plan.\n\nStage 4, Risk scoring: denial and readmission scores are deterministic heuristics over the note text. They are clearly labelled as estimates in the product and are not a trained model.\n\nStage 5, Generation, verification, orchestration: four writer agents (Claude Haiku) produce role specific reports using forced tool_use schemas, grounded strictly in the extracted facts. A verifier and an orchestrator (Claude Sonnet) audit each statement against the facts and connect the four reports. All product copy is sanitized to contain no hyphens or dashes.`,
  },
  {
    id: 'evaluation', title: '4  Evaluation (measured)',
    content: `We report only results we actually ran and can reproduce.\n\nNER, diagnosis to ICD 10. We evaluate the NER stage on the public dataset Inje/SYMPTOMS-COT-ICD10-2024, where each item has a gold ICD 10 code. For each item we construct a short note from its symptom list and stated diagnosis, run the extractor, and check whether it recovers the gold code. On N = 149 English items:\n\n• Claude based NER, recall at the ICD 10 category (three character) level: 60.4% (90 of 149)\n• Claude based NER, recall at the exact code level: 23.5% (35 of 149)\n• Claude based NER produced at least one code on 92.6% of notes\n• Deterministic regex extractor, recall at the category level: 0.0% (0 of 149)\n\nThe headline finding is the gap: the deterministic extractor recovers no diagnoses from prose, because prose contains no literal codes, while the Claude NER path recovers the correct ICD 10 chapter most of the time. This is the measured justification for the NER stage.\n\nHonest caveats. N is 149; the dataset is symptom and diagnosis to code, which is somewhat idealized relative to full clinical notes; the gold label is a single code per item; category level recall is lenient and exact ICD 10 mapping is hard. Latency: the deterministic extractor runs in about 0.013 ms per note; the 149 Claude NER calls completed in 56 s at a concurrency of 6. Per stage latency profiling on the deployed pipeline is future work.`,
  },
  {
    id: 'plan', title: '5  Evaluation Plan (not yet measured)',
    content: `The following components are described honestly as not yet benchmarked. For each we give the concrete method we would use to make the claim real.\n\n• NER at scale, the current N of 149 is small and the dataset is idealized. Plan: evaluate on de identified real clinical notes (for example n2c2 or i2b2 corpora under their data use agreements) and report entity span F1 and exact and category code accuracy with confidence intervals.\n\n• Denial prediction, there is currently no real denial outcome label available, and the demo uses a heuristic. Plan: obtain a claims dataset with adjudication outcomes (paid or denied), train a classifier, and report AUC, precision, recall, and calibration against a held out test set, with a rule based baseline.\n\n• Retrieval (RAG), the demo resolves codes from a curated dictionary, not a learned retriever. Plan: embed the full ICD 10 CM corpus into a vector index, assemble a labelled query set (symptom or description to code), and report MRR at k and recall at k against a lexical baseline.\n\n• Readmission, the demo uses a heuristic. Plan: calibrate against published CMS HRRP condition rates and report mean absolute error and risk tier agreement.\n\n• End to end latency, plan: instrument the deployed pipeline and report p50, p95, and p99 over real traffic per stage.\n\n• Grounding and hallucination, plan: sample generated outputs, have reviewers check every statement against the extracted facts, and report a fabrication rate with N and inter rater agreement, alongside the automated citation and code validation already in place.`,
  },
  {
    id: 'safety', title: '6  Safety and Grounding',
    content: `Two properties are enforced by construction rather than asserted by a benchmark.\n\nGrounding. Writer agents receive only the extracted facts and are instructed to use nothing else; the tool_use schema forces structured output, and a validation pass drops any code that fails format checks. This makes fabrication of codes and clinical values structurally unlikely, though the planned human review above is needed to put a real number on the residual rate.\n\nThree tier autonomy. The system distinguishes actions that may be fully automated (for example drafting a prior authorization packet, preparing an appeal letter, generating patient education) from actions that require a single human approval, from actions that are never automated (prescribing, diagnosis, treatment changes). The third tier is a design prohibition, not a configuration option: the agents produce decision support and administrative artifacts, never clinical decisions.`,
  },
  {
    id: 'data', title: '7  Data and Reproducibility',
    content: `The measured NER evaluation uses one public dataset, accessed through the HuggingFace datasets server, with the gold ICD 10 code as ground truth.\n\n• Inje/SYMPTOMS-COT-ICD10-2024, ICD 10 code with symptom and diagnosis text, used for the NER evaluation in Section 4\n\nDatasets named in the evaluation plan (Section 5), for example ICD 10 CM code and description pairs for the retrieval index, MTSamples and other clinical note corpora for NER at scale, and CMS HRRP rates for readmission calibration, are listed as planned inputs, not as results. The NER benchmark is reproducible: construct a note from each item, run the extractor, and compare the returned codes to the gold code at the category and exact levels.`,
  },
  {
    id: 'conclusion', title: '8  Conclusion',
    content: `Synthure shows that a single grounded agent pipeline can drive four interconnected stakeholder portals from one clinical note, with actions in any portal rippling through the others in real time, on openly available model APIs and serverless infrastructure.\n\nThe honest evaluation is narrow but real: Claude based NER recovers the correct ICD 10 category in 60.4% of cases and the exact code in 23.5% (N = 149), against 0.0% for the deterministic baseline on prose. The remaining components, denial prediction, retrieval, and readmission, are presented as heuristics or design with a concrete plan to evaluate each rather than as measured results. We prefer a smaller set of claims we can stand behind to a larger set we cannot reproduce.`,
  },
]

const METRICS = [
  { label: 'NER category recall', value: '60.4%', sub: 'Claude Haiku · N = 149 · measured', color: 'text-teal-400' },
  { label: 'NER exact code', value: '23.5%', sub: 'same eval, full ICD 10', color: 'text-indigo-400' },
  { label: 'Deterministic baseline', value: '0.0%', sub: 'regex on prose, measured', color: 'text-rose-400' },
  { label: 'NER coverage', value: '92.6%', sub: 'produced at least one code', color: 'text-teal-400' },
  { label: 'Risk scoring', value: 'Heuristic', sub: 'not yet trained or evaluated', color: 'text-amber-400' },
  { label: 'Denial · RAG · readmit', value: 'Planned', sub: 'see evaluation plan', color: 'text-violet-400' },
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
          <p className="text-slate-400 text-sm mb-3">A grounded agent pipeline, with an honest evaluation of what is and is not measured.</p>
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
        <p className="text-center text-xs text-slate-600 mb-16">
          Only measured results are shown as numbers. Components that are not yet benchmarked are marked Heuristic or Planned and detailed in the evaluation plan.
        </p>

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
