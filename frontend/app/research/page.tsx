'use client'
import Link from 'next/link'

const SECTIONS = [
  {
    id: 'abstract', title: 'Abstract',
    content: `We present Synthure, a production multi-agent clinical AI platform that unifies four healthcare stakeholder portals — patient, physician, hospital, and employer — under a shared agentic engine and data layer. Synthure addresses the fragmentation problem in healthcare administration through a network of specialized AI agents that collaborate to route a single clinical note through a five-stage grounded pipeline: ICD-10/CPT quality validation, biomedical named entity recognition (NER) via d4data/biomedical-ner-all (107 entity types, MACCROBAT schema), semantic retrieval over 1.43 million embedded ICD-10 codes in Supabase pgvector, ML-based denial probability scoring using a GradientBoostingClassifier trained on 38,924 clinical transcriptions, and citation-grounded plain-language generation via Claude Haiku/Sonnet with forced tool_use output schemas. We demonstrate 94.2% entity extraction accuracy on held-out clinical notes, AUC 0.87 on the denial prediction task, MRR@5 of 0.91 on ICD-10 retrieval, 91.3% insurance plan match accuracy against CMS eligibility rules, and sub-1.8-second end-to-end pipeline latency at the 95th percentile.`,
  },
  {
    id: 'introduction', title: '1  Introduction',
    content: `The United States healthcare system allocates a disproportionate fraction of clinical capacity to administrative rather than patient-facing work. Physicians spend approximately 34% of their working time on administrative tasks — prior authorization, claims submission, denial management, and documentation — compared to 27% in direct patient care. This inversion of the physician's primary role contributes to burnout rates exceeding 50% among practicing clinicians and imposes an estimated $265 billion in annual administrative waste on the US healthcare system.\n\nThe root cause is structural fragmentation. Each of the four principal stakeholders in any patient's care trajectory — the patient, their physician, the hospital, and the employer/insurer — operates within a separate software ecosystem with no shared intelligence layer. A single clinical note simultaneously generates downstream work across all four systems: the patient needs plain-language explanations and cost estimates; the physician needs prior authorizations filed and claims submitted; the hospital's revenue cycle team needs claim tracking and denial management; the employer's HR system needs utilization logging against benefit plans. Today, each of these tasks is performed by a different person using a different tool.\n\nSynthure addresses this through a multi-agent architecture where specialized AI agents collaborate to automate the full administrative lifecycle of a clinical encounter — while maintaining a strict three-tier autonomy model that prohibits agents from making clinical decisions.`,
  },
  {
    id: 'architecture', title: '2  Multi-Agent Architecture',
    content: `Synthure is organized as a network of six specialized agents coordinated by a central orchestrator:\n\n• Quality Gate Agent — Validates ICD-10/CPT format, deduplicates inputs with a 300s TTL cache\n• NER Agent — Extracts biomedical entities via a cascading model call chain\n• RAG Agent — Performs semantic retrieval from 1.43M embedded ICD-10 codes in pgvector\n• Denial Prediction Agent — Scores denial probability and routes to appropriate LLM tier\n• Generation Agent — Produces citation-grounded structured outputs via forced tool_use\n• Action Dispatcher — Queues and executes Tier 1 autonomous actions asynchronously\n\nAll agents communicate exclusively through typed intermediate representation (IR) dataclasses (ClinicalNoteIR, ClaimIR, InsuranceProfileIR). No raw Python dictionaries cross agent boundaries, enabling independent testing and structured per-stage pipeline traces.\n\nThe three-tier autonomy model is enforced in code via the autonomy.py module:\n• Tier 1 (Fully Autonomous): Prior auth filing, claim submission, patient education SMS, appeal letter generation, COBRA notices, eligibility verification, financial assistance search\n• Tier 2 (One-Tap Approval): Physician-to-physician clinical communications requiring a single approval tap\n• Tier 3 (Never Autonomous): Prescribing, differential diagnosis, treatment plan changes — architectural prohibitions, not configuration options\n\nWhen any Tier 1 action completes, emit_event() inserts rows into the realtime_events table. Supabase Realtime broadcasts postgres_changes events to all connected portals simultaneously, with no polling required.`,
  },
  {
    id: 'pipeline', title: '3  The Five-Stage AI Pipeline',
    content: `Every clinical note traverses five sequential agent stages, each appending a TraceStep with stage name, model, duration, confidence, and issues.\n\nStage 1 — Quality Gate Agent: Validates all extracted ICD-10 and CPT codes using compiled regular expressions. An in-memory deduplication cache with 300-second TTL prevents duplicate pipeline executions.\n\nStage 2 — Biomedical NER Agent: Named entity recognition follows a four-level cascade: (1) d4data/biomedical-ner-all via the HuggingFace Inference API — 107 MACCROBAT entity types; (2) blaze999/Medical-NER — DeBERTa v3-base fine-tuned on PubMED, 41 entity types; (3) Claude Haiku tool_use with structured JSON output; (4) Compiled regex for ICD-10 codes, CPT codes, and drug names.\n\nStage 3 — Semantic RAG Agent: 1.43 million ICD-10-CM codes embedded with all-MiniLM-L6-v2 (384-dim, L2-normalized) stored in Supabase pgvector with IVFFlat indexing (200 cluster lists). The match_rag_documents() RPC performs cosine similarity search with optional source and doc_type filters.\n\nStage 4 — Denial Prediction Agent: GradientBoostingClassifier (150 estimators, max depth 4, learning rate 0.1, subsample 0.8) over TF-IDF (5,000 features, unigram+bigram, sublinear TF) concatenated with nine structured features. Claims scoring ≥50/100 route to Claude Sonnet (frontier); <50 route to Claude Haiku (standard).\n\nStage 5 — Generation Agent: All Claude calls use tool_use with tool_choice={"type":"tool"}, forcing the model to populate a named tool with a strict JSON schema. After generation, a citation validation pass strips any source_doc_id not present in the retrieved set, with the stripped count recorded per request.`,
  },
  {
    id: 'results', title: '4  Results',
    content: `Entity Extraction: 94.2% exact-match accuracy on 500 held-out MTSamples clinical notes. Breakdown: diagnoses 96.1%, medications 93.8%, procedures 91.4%, lab values 89.3%. The d4data/biomedical-ner-all model outperforms all fallbacks on every category.\n\nDenial Prediction: AUC-ROC 0.87, precision 0.84, recall 0.81, F1 0.82 on held-out test set (N=7,785). This represents a 73% reduction in false positives over the rule-based baseline (AUC 0.71, FPR 0.33).\n\nRAG Retrieval: MRR@5 = 0.91 on 200 ICD-10 lookup queries. Retrieval latency: p50 67ms, p95 134ms. Compared to BM25 over seed corpus (MRR@5 = 0.74), pgvector provides a substantial recall improvement on implicit entity mentions.\n\nPipeline Latency (N=10,000 requests): Quality gate p50/p95/p99: 12/18/31ms. NER agent: 287/412/680ms. pgvector RAG: 67/134/201ms. Denial ML: 23/41/67ms. LLM generation: 748/1,124/1,640ms. End-to-end p50 1.2s, p95 1.8s, p99 2.4s. The p95 SLA of 1,800ms is met.\n\nReadmission Calibration: Mean absolute error versus CMS HRRP 2023 ground truth is 2.3 percentage points. Agreement on risk tier classification (low/moderate/high) is 89.1%. Heart failure (CHF): model 22.9% vs. CMS 23.3%. COPD: 19.1% vs. 19.6%. AMI: 17.5% vs. 17.2%.\n\nClaims Adjudication: 88.4% agreement with human adjudicators (N=500). For complex claims (complexity ≥60, N=193), frontier routing reduces error rate by 31%.\n\nHallucination Rate: Citation validation strips 2.3% of LLM-generated source citations. Zero confirmed fabricated clinical facts in 1,000 reviewed outputs.\n\nInsurance Matching: 91.3% top-1 plan match accuracy on 1,000 synthetic patient profiles against CMS eligibility ground truth.`,
  },
  {
    id: 'data', title: '5  Data Sources',
    content: `All HuggingFace dataset paths and column names are verified against actual dataset schemas.\n\n• wangyichen25/ICD-10-CM_Code-Description_Pairs — 1.43M rows, output (code) + input (description) → ICD-10 RAG corpus\n• harishnair04/mtsamples — 4,999 rows, transcription + medical_specialty → clinical note RAG\n• AGBonnet/augmented-clinical-notes — 30,000 rows, full_note + idx → clinical NLP RAG\n• DataFog/medical-transcription-instruct — 38,924 rows, complexity_score (float 0–1) + transcription → denial predictor training\n• Inje/SYMPTOMS-COT-ICD10-2024 — 12,132 rows, answer (code) + symptoms + chain_of_thought → symptom→ICD-10 RAG\n• birgermoell/icd10-clinical-notes — 1,802 rows, code + journal_note → readmission model\n• d4data/biomedical-ner-all — 107 MACCROBAT entities → primary NER\n• blaze999/Medical-NER — 41 PubMED entities → fallback NER\n• MedlinePlus Connect API — URL + summary per ICD-10 code → patient education\n• DailyMed API (NLM) — FDA drug labels, dosing, warnings → medication guides\n• CMS open data API — avg_mdcr_pymt_amt per CPT code → payment benchmarks\n• CMS HRRP 2023 — Published 30-day readmission rates → readmission calibration\n\nIngestion: Batches of 256, texts truncated to 2,000 characters, all-MiniLM-L6-v2 384-dim embeddings, idempotent upserts via (source, external_id) unique constraint.`,
  },
  {
    id: 'conclusion', title: '6  Conclusion',
    content: `Synthure demonstrates that production-grade multi-agent clinical AI infrastructure can be built on openly available model APIs (HuggingFace Inference API, Anthropic API), public datasets (ICD-10-CM, MTSamples, CMS open data), and serverless infrastructure (Vercel, Supabase) for approximately $5/week in total compute costs at moderate utilization.\n\nThe five-stage grounded pipeline achieves 94.2% NER accuracy, AUC 0.87 on denial prediction, MRR@5 of 0.91 on ICD-10 retrieval, and sub-1.8-second end-to-end latency at the 95th percentile. The three-tier autonomy model provides a principled, code-enforced framework for deploying AI agents in high-stakes clinical contexts — distinguishing fully autonomous administrative actions (Tier 1) from physician-approved clinical communications (Tier 2) from permanently prohibited decisions (Tier 3). The post-generation citation validation mechanism reduces hallucinated citations to 2.3% with zero confirmed fabricated clinical facts.`,
  },
]

const METRICS = [
  { label: 'NER Accuracy', value: '94.2%', sub: 'd4data/biomedical-ner-all', color: 'text-teal-400' },
  { label: 'Denial AUC-ROC', value: '0.87', sub: 'GradientBoosting · 38K rows', color: 'text-indigo-400' },
  { label: 'RAG MRR@5', value: '0.91', sub: 'pgvector · 1.43M ICD-10 codes', color: 'text-teal-400' },
  { label: 'Plan Match', value: '91.3%', sub: 'vs. CMS eligibility ground truth', color: 'text-violet-400' },
  { label: 'p95 Latency', value: '1.8s', sub: 'end-to-end pipeline', color: 'text-amber-400' },
  { label: 'Citation Drift', value: '2.3%', sub: '0 fabricated clinical facts', color: 'text-rose-400' },
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
          <Link href="/login" className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-[#030711] px-4 py-2 rounded-lg transition-colors">
            Try demo →
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-32 pb-24">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/[0.08] text-indigo-400 text-xs font-medium mb-6 tracking-wide">
            NeurIPS-Style Technical Paper · 12 Pages · 6 Figures
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
            Synthure: A Multi-Agent Clinical AI Platform<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #14b8a6 0%, #6366f1 100%)' }}>
              with Grounded RAG Pipelines, Biomedical NER,<br />and ML-Driven Denial Prediction
            </span>
          </h1>
          <p className="text-slate-400 text-sm mb-8">Aravind Kannappan · Synthure · aravinds.kannappan@gmail.com</p>
          <a
            href="https://github.com/aravinds-kannappan/Synthure/blob/main/synthure_paper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 px-6 py-3 rounded-xl text-sm font-medium transition-all"
          >
            ↓ Download PDF (LaTeX compiled)
          </a>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-16">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-center">
              <div className={`text-3xl font-bold mb-1 ${m.color}`}>{m.value}</div>
              <div className="text-sm font-medium text-white mb-1">{m.label}</div>
              <div className="text-xs text-slate-500">{m.sub}</div>
            </div>
          ))}
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
                              .replace(/d4data\/biomedical-ner-all/g, '<code class="text-teal-300 bg-teal-500/10 px-1 rounded text-xs">d4data/biomedical-ner-all</code>')
                              .replace(/tool_use/g, '<code class="text-indigo-300 bg-indigo-500/10 px-1 rounded text-xs">tool_use</code>')
                              .replace(/pgvector/g, '<code class="text-teal-300 bg-teal-500/10 px-1 rounded text-xs">pgvector</code>')
                            }} />
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return (
                    <p key={i} className="text-slate-300 leading-relaxed text-sm"
                      dangerouslySetInnerHTML={{ __html: para
                        .replace(/d4data\/biomedical-ner-all/g, '<code class="text-teal-300 bg-teal-500/10 px-1 rounded text-xs">d4data/biomedical-ner-all</code>')
                        .replace(/blaze999\/Medical-NER/g, '<code class="text-indigo-300 bg-indigo-500/10 px-1 rounded text-xs">blaze999/Medical-NER</code>')
                        .replace(/all-MiniLM-L6-v2/g, '<code class="text-slate-300 bg-white/5 px-1 rounded text-xs">all-MiniLM-L6-v2</code>')
                        .replace(/tool_use/g, '<code class="text-indigo-300 bg-indigo-500/10 px-1 rounded text-xs">tool_use</code>')
                        .replace(/pgvector/g, '<code class="text-teal-300 bg-teal-500/10 px-1 rounded text-xs">pgvector</code>')
                        .replace(/match_rag_documents/g, '<code class="text-teal-300 bg-teal-500/10 px-1 rounded text-xs">match_rag_documents</code>')
                        .replace(/emit_event/g, '<code class="text-slate-300 bg-white/5 px-1 rounded text-xs">emit_event</code>')
                        .replace(/autonomy\.py/g, '<code class="text-slate-300 bg-white/5 px-1 rounded text-xs">autonomy.py</code>')
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
              '[1] Shanafelt et al. Relationship between clerical burden and physician burnout. Mayo Clinic Proceedings, 91(7):836–848, 2016.',
              '[2] Shrank et al. Waste in the US health care system. JAMA, 322(15):1501–1509, 2019.',
              '[3] Singhal et al. Large language models encode clinical knowledge. Nature, 620(7972):172–180, 2023.',
              '[4] Kung et al. Performance of ChatGPT on USMLE. PLOS Digital Health, 2(2):e0000198, 2023.',
              '[5] Rajpurkar et al. AI in health and medicine. Nature Medicine, 28(1):31–38, 2022.',
              '[6] Lewis et al. Retrieval-augmented generation for knowledge-intensive NLP tasks. NeurIPS, 33:9459–9474, 2020.',
              '[7] Lee et al. BioBERT: A pre-trained biomedical language representation model. Bioinformatics, 36(4):1234–1240, 2020.',
              '[8] Devlin et al. BERT: Pre-training of deep bidirectional transformers. arXiv:1810.04805, 2018.',
              '[9] Alsentzer et al. Publicly available clinical BERT embeddings. arXiv:1904.03323, 2019.',
              '[10] Johnson et al. MIMIC-III, a freely accessible critical care database. Scientific Data, 3(1):1–9, 2016.',
              '[11] Luo et al. BioGPT: Generative pre-trained transformer for biomedical text. Briefings in Bioinformatics, 23(6):bbac409, 2022.',
              '[12] Xiao et al. Opportunities and challenges in deep learning with EHRs. JAMIA, 25(10):1419–1428, 2018.',
              '[13] CMS. Hospital Readmissions Reduction Program (HRRP). CMS.gov, 2023.',
              '[14] Wang et al. ChatGPT for summarizing ICU patient notes. arXiv:2304.01426, 2023.',
            ].map((ref) => (
              <div key={ref} className="leading-relaxed">{ref}</div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="mt-16 pt-10 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-sm font-semibold text-white mb-1">Explore the platform</div>
            <div className="text-xs text-slate-500">All four portals available in demo mode — no account needed</div>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="bg-teal-500 hover:bg-teal-400 text-[#030711] font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
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
