'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPortalHome } from '@/lib/portal'
import type { PortalRole } from '@/lib/types'

const PORTALS = [
  {
    icon: '◎', label: 'Patient',
    desc: 'Conditions explained in plain language, cost share breakdown, medication guides, and a complete care journey timeline.',
    border: 'hover:border-teal-500/50', glow: 'hover:shadow-teal-500/5',
    iconBg: 'bg-teal-500/10 border-teal-500/20 text-teal-400',
    arrow: 'group-hover:text-teal-400',
  },
  {
    icon: '◈', label: 'Physician',
    desc: 'Navigator runs jargon decoder, insurance matcher, and claim routing in parallel. Prior auths filed automatically.',
    border: 'hover:border-indigo-500/50', glow: 'hover:shadow-indigo-500/5',
    iconBg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    arrow: 'group-hover:text-indigo-400',
  },
  {
    icon: '⬡', label: 'Hospital',
    desc: 'Full revenue cycle with AI-driven claim routing, denial management, appeal generation, and CMS benchmarking.',
    border: 'hover:border-cyan-500/50', glow: 'hover:shadow-cyan-500/5',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    arrow: 'group-hover:text-cyan-400',
  },
  {
    icon: '◇', label: 'Employer',
    desc: 'Benefits optimizer, COBRA compliance, ACA 1095-C reporting, and a monthly admin package — generated automatically.',
    border: 'hover:border-violet-500/50', glow: 'hover:shadow-violet-500/5',
    iconBg: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    arrow: 'group-hover:text-violet-400',
  },
]

const AGENTS = [
  { n: '01', label: 'Quality Gate', sub: 'ICD-10/CPT validation + 300s dedup cache', color: 'border-teal-500/30 text-teal-400 bg-teal-500/10' },
  { n: '02', label: 'NER Agent', sub: 'd4data/biomedical-ner-all · 107 entity types', color: 'border-teal-500/30 text-teal-400 bg-teal-500/10' },
  { n: '03', label: 'RAG Agent', sub: '1.43M ICD-10 codes · pgvector cosine search', color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { n: '04', label: 'Denial Agent', sub: 'GradientBoosting · 38K DataFog transcriptions', color: 'border-rose-500/30 text-rose-400 bg-rose-500/10' },
  { n: '05', label: 'Generation Agent', sub: 'Claude Haiku/Sonnet · tool_use · citation check', color: 'border-violet-500/30 text-violet-400 bg-violet-500/10' },
]

const STATS = [
  { n: '1.4M+', label: 'ICD-10 codes in pgvector' },
  { n: '107', label: 'biomedical entity types' },
  { n: '0.87', label: 'denial predictor AUC' },
  { n: '<1.8s', label: 'p95 pipeline latency' },
]

export default function LandingPage() {
  const router = useRouter()
  useEffect(() => {
    try {
      const raw = localStorage.getItem('synthure_user')
      if (raw) {
        const user = JSON.parse(raw)
        if (user?.role) router.replace(getPortalHome(user.role as PortalRole))
      }
    } catch { localStorage.removeItem('synthure_user') }
  }, [router])

  return (
    <div className="min-h-screen bg-[#030711] text-white overflow-x-hidden">

      {/* Ambient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #14b8a6, transparent 70%)' }} />
        <div className="absolute top-1/2 -right-60 w-[600px] h-[600px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
        <div className="absolute -bottom-20 left-1/3 w-[500px] h-[500px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #14b8a6, transparent 70%)' }} />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#030711]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-teal-400 text-xl">◈</span>
            <span className="font-semibold tracking-wider text-white text-sm">SYNTHURE</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#agents" className="hover:text-white transition-colors">Agents</a>
            <a href="#portals" className="hover:text-white transition-colors">Portals</a>
            <Link href="/research" className="hover:text-white transition-colors">Research</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5">Sign in</Link>
            <Link href="/login" className="text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-[#030711] px-4 py-2 rounded-lg transition-colors">
              Try demo →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-28 px-6 text-center">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/[0.08] text-teal-400 text-xs font-medium mb-8 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse inline-block" />
            Multi-Agent Clinical AI — Four Portals, One Agentic Engine
          </div>
          <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
            The multi-agent AI<br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #14b8a6 0%, #6366f1 100%)' }}>
              running healthcare.
            </span>
          </h1>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Synthure connects patients, physicians, hospitals, and employers through a network of
            specialized AI agents — NER, semantic retrieval over 1.43M ICD-10 codes,
            ML denial prediction, and citation-grounded generation — all orchestrated in real time.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login" className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-[#030711] font-bold px-8 py-3.5 rounded-xl text-sm transition-all hover:shadow-lg hover:shadow-teal-500/25">
              Try the demo — free
            </Link>
            <Link href="/research" className="inline-flex items-center gap-2 border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white px-8 py-3.5 rounded-xl text-sm transition-all">
              Read the paper →
            </Link>
          </div>
        </div>

        {/* Hero preview */}
        <div className="relative mt-20 max-w-4xl mx-auto">
          <div className="absolute inset-0 rounded-2xl blur-xl opacity-20"
            style={{ background: 'linear-gradient(135deg, #14b8a6, #6366f1)' }} />
          <div className="relative rounded-2xl border border-white/10 bg-[#0a1628]/80 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-3 text-xs text-slate-500 font-mono">synthure.ai/physician/navigator</span>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Navigator — Agent Pipeline Output</div>
                <div className="bg-[#0d1f3a] rounded-xl p-4 border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <span className="text-xs text-teal-400 font-medium">Jargon Decoder Agent</span>
                    <span className="ml-auto text-xs text-slate-600">Claude Haiku · 812ms</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">Your doctor found that your blood pressure is consistently elevated — a condition called <span className="text-teal-300 font-medium">essential hypertension</span>. Two medications have been prescribed to bring it under control.</p>
                </div>
                <div className="bg-[#0d1f3a] rounded-xl p-4 border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="text-xs text-rose-400 font-medium">Denial Prediction Agent</span>
                    <span className="ml-auto text-xs text-slate-600">GBM · 23ms</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: '34%' }} />
                    </div>
                    <span className="text-xs text-amber-400 font-medium">34% denial risk · Standard route</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Agent trace</div>
                {[
                  { stage: 'Quality Gate', ms: '12ms', ok: true },
                  { stage: 'NER Agent', ms: '287ms', ok: true },
                  { stage: 'RAG Agent', ms: '89ms', ok: true },
                  { stage: 'Denial Agent', ms: '23ms', ok: true },
                  { stage: 'Generation', ms: '812ms', ok: true },
                ].map((s) => (
                  <div key={s.stage} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.ok ? 'bg-teal-400' : 'bg-red-400'}`} />
                    <span className="text-slate-400 flex-1">{s.stage}</span>
                    <span className="text-slate-600 font-mono">{s.ms}</span>
                  </div>
                ))}
                <div className="mt-4 pt-3 border-t border-white/[0.06]">
                  <div className="text-xs text-slate-500">Entity confidence</div>
                  <div className="text-2xl font-bold text-white mt-1">0.94</div>
                  <div className="text-xs text-slate-600">biomedical-ner-all</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/[0.06] py-14">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-10 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-4xl font-bold text-transparent bg-clip-text mb-2"
                style={{ backgroundImage: 'linear-gradient(135deg, #14b8a6, #6366f1)' }}>
                {s.n}
              </div>
              <div className="text-xs text-slate-500 leading-relaxed">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Agent pipeline */}
      <section id="agents" className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Five specialized agents. Every request.</h2>
            <p className="text-slate-400 text-sm max-w-lg mx-auto">
              A network of AI agents collaborates on every clinical note —
              each with a single responsibility, typed inputs and outputs, and full auditability.
            </p>
          </div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="md:col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-all">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 text-lg mb-5">◈</div>
              <h3 className="text-xl font-semibold mb-3">Semantic ICD-10 Retrieval Agent</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                1.43M ICD-10-CM codes embedded with <span className="text-white">all-MiniLM-L6-v2</span> (384-dim) and stored in Supabase pgvector with IVFFlat indexing. The RAG agent performs cosine similarity search in under 100ms — not brittle keyword matching. MRR@5 = 0.91.
              </p>
              <div className="bg-[#030711] rounded-xl p-4 border border-white/[0.06] font-mono text-xs">
                <div className="text-slate-500 mb-2">{'-- pgvector similarity RPC'}</div>
                <div className="text-teal-400">SELECT * FROM match_rag_documents(</div>
                <div className="text-slate-300 ml-4">query_embedding =&gt; <span className="text-indigo-400">embed(query)</span>,</div>
                <div className="text-slate-300 ml-4">match_count =&gt; <span className="text-teal-300">5</span>,</div>
                <div className="text-slate-300 ml-4">filter_doc_type =&gt; <span className="text-amber-400">&apos;medical_code&apos;</span></div>
                <div className="text-teal-400">);</div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-all">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-lg mb-5">⬡</div>
              <h3 className="text-xl font-semibold mb-3">Biomedical NER Agent</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-5">
                <span className="text-white">d4data/biomedical-ner-all</span> as primary (107 MACCROBAT entities), with blaze999/Medical-NER, Claude Haiku, and regex as cascading fallbacks. 94.2% accuracy on held-out MTSamples.
              </p>
              <div className="space-y-2">
                {[
                  { label: 'SIGN_SYMPTOM', color: 'bg-teal-500/10 text-teal-300 border-teal-500/20' },
                  { label: 'MEDICATION', color: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' },
                  { label: 'LAB_VALUE', color: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
                  { label: 'THERAPEUTIC_PROCEDURE', color: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
                ].map((e) => (
                  <span key={e.label} className={`inline-flex items-center px-2 py-1 rounded-lg border text-xs mr-2 mb-1 ${e.color}`}>
                    {e.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-all">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 text-lg mb-5">◎</div>
              <h3 className="text-xl font-semibold mb-3">Denial Prediction Agent</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                GradientBoosting trained on <span className="text-white">38,924 DataFog transcriptions</span>. AUC 0.87. Routes complex claims (score ≥ 50) to Claude Sonnet automatically.
              </p>
              <div className="bg-[#030711] rounded-xl p-3 border border-white/[0.06]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Denial probability</span>
                  <span className="text-rose-400 font-bold">0.73 → Frontier</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '73%' }} />
                </div>
              </div>
            </div>
            <div className="md:col-span-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-all">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-lg mb-5">◇</div>
              <h3 className="text-xl font-semibold mb-3">Citation-Grounded Generation Agent</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                All Claude calls use <span className="text-white">tool_use with forced tool selection</span> — the model must populate a strict JSON schema, making hallucinations structurally identifiable. A post-generation pass strips ungrounded citations. 2.3% citation drift; zero fabricated clinical facts in 1,000 reviewed outputs.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#030711] rounded-xl p-4 border border-white/[0.06]">
                  <div className="text-xs text-slate-500 mb-2">Clinical input</div>
                  <p className="text-xs text-slate-400 font-mono leading-relaxed">Pt presents w/ HTN, dyslipidemia. A1C 7.2. Started on lisinopril 10mg QD + atorvastatin 20mg QHS...</p>
                </div>
                <div className="bg-[#030711] rounded-xl p-4 border border-teal-500/20">
                  <div className="text-xs text-teal-400 mb-2">Patient output (grounded)</div>
                  <p className="text-xs text-slate-300 leading-relaxed">Your doctor found high blood pressure and cholesterol. Two medicines will help control these — take one in the morning, one at bedtime.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline steps */}
          <div className="relative">
            <div className="absolute top-8 left-[10%] right-[10%] h-px bg-gradient-to-r from-teal-500/20 via-indigo-500/20 to-teal-500/20 hidden md:block" />
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {AGENTS.map((step, i) => (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-lg font-bold mb-4 z-10 ${step.color}`}>
                    {step.n}
                  </div>
                  <h4 className="text-sm font-semibold mb-2">{step.label}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{step.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Portals */}
      <section id="portals" className="py-28 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Every stakeholder. One agentic platform.</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Four purpose-built portals sharing a single agent engine and real-time data layer.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PORTALS.map((p) => (
              <Link key={p.label} href="/login"
                className={`group rounded-2xl border border-white/[0.06] ${p.border} bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:shadow-xl ${p.glow} transition-all duration-200`}>
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl mb-5 ${p.iconBg}`}>{p.icon}</div>
                <h3 className="text-base font-semibold mb-3">{p.label} Portal</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{p.desc}</p>
                <div className={`mt-5 text-xs font-medium text-slate-500 transition-colors flex items-center gap-1 ${p.arrow}`}>
                  Enter portal <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Research CTA */}
      <section className="py-20 px-6 border-t border-white/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border border-indigo-500/20 p-12 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(20,184,166,0.06) 100%)' }}>
            <div className="absolute inset-0 blur-3xl opacity-20"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(20,184,166,0.2))' }} />
            <div className="relative grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="text-xs text-indigo-400 font-medium tracking-wider uppercase mb-3">NeurIPS-Style Research Paper</div>
                <h2 className="text-3xl font-bold mb-4">Read the technical paper</h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  12 pages covering the multi-agent architecture, five-stage pipeline, ML models,
                  evaluation results (AUC 0.87, NER 94.2%, MRR@5 0.91), and six figures.
                </p>
                <Link href="/research"
                  className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all">
                  Read the paper →
                </Link>
              </div>
              <div className="bg-[#030711]/60 rounded-2xl border border-white/[0.08] p-5 font-mono text-xs space-y-2">
                {['94.2%  NER accuracy (held-out MTSamples)',
                  ' 0.87  denial predictor AUC-ROC',
                  ' 0.91  RAG retrieval MRR@5',
                  '91.3%  insurance plan match accuracy',
                  ' 1.8s  end-to-end p95 latency',
                  ' 2.3%  citation drift rate',
                  '    0  fabricated clinical facts'].map((line) => (
                  <div key={line} className="text-slate-400">{line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl border border-white/10 p-16 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(99,102,241,0.08) 100%)' }}>
            <div className="absolute inset-0 blur-3xl opacity-30"
              style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(99,102,241,0.15))' }} />
            <div className="relative">
              <h2 className="text-4xl font-bold mb-4">See it in action — no account needed.</h2>
              <p className="text-slate-400 mb-10 max-w-md mx-auto text-sm leading-relaxed">
                All four portals are available in demo mode. Walk through a clinical note,
                route a claim, or match insurance — right now.
              </p>
              <Link href="/login"
                className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-[#030711] font-bold px-10 py-4 rounded-xl text-sm transition-all hover:shadow-lg hover:shadow-teal-500/30">
                Open demo →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-teal-400">◈</span>
            <span>Synthure — Multi-Agent Clinical AI</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/research" className="hover:text-slate-400 transition-colors">Research</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">GitHub</a>
            <Link href="/login" className="hover:text-slate-400 transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
