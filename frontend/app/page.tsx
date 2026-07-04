'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck, GitBranch, ScanLine, Cpu } from 'lucide-react'
import Nav from '@/components/Nav'
import AgentFloor from '@/components/AgentFloor'
import { Bars } from '@/components/Charts'
import modelEvals from '@/data/model_evals.json'
import { STAKEHOLDERS, STAKEHOLDER_ORDER } from '@/lib/synthure'

const CODER = modelEvals.icd_coder

const STATS = [
  { n: `${Math.round(CODER.codiesp.acc1 * 100)}%`, label: 'exact ICD-10-CM code ranked first (CodiEsp, N = 3,615)' },
  { n: '98K', label: 'ICD-10-CM codes in the trained index' },
  { n: '269K', label: 'phrase to code pairs the retriever learned' },
  { n: '4', label: 'stakeholder portals from one note' },
]

// kind drives the color: what actually runs each stage
const KIND = {
  device: { c: '#38bdf8', tag: 'on device' },
  trained: { c: '#34d399', tag: 'trained' },
  claude: { c: '#a78bfa', tag: 'Claude' },
} as const

const PIPELINE: { label: string; model: string; kind: keyof typeof KIND }[] = [
  { label: 'De-identify', model: 'OpenMed PII, in your browser', kind: 'device' },
  { label: 'Biomedical NER', model: 'OpenMed disease + pharma, in your browser', kind: 'device' },
  { label: 'Note type + sections', model: 'Synthure classifier', kind: 'trained' },
  { label: 'ICD-10-CM coding', model: 'Trained retriever + reranker (A100)', kind: 'trained' },
  { label: 'Readiness + readmission', model: 'Gradient boosted trees + CMS rates', kind: 'trained' },
  { label: 'Four portal writers', model: 'Claude, grounded on the extraction', kind: 'claude' },
  { label: 'Verify + critique', model: 'Claude audits each report against the facts', kind: 'claude' },
]

const TRUST = [
  { icon: ShieldCheck, title: 'De-identified on device', body: 'An OpenMed model scrubs identifiers in your browser. The raw note is never sent.' },
  { icon: GitBranch, title: 'Codes cannot be invented', body: 'Every code comes from the official ICD-10-CM index and is scored by a trained reranker, then revalidated against the CMS tabular.' },
  { icon: ScanLine, title: 'Writers are audited', body: 'Every report is checked against the extracted facts by a verifier and a constitution critic before it is shown.' },
]

const SOURCES = ['CDC/NCHS ICD-10-CM FY2026', 'CodiEsp (CLEF eHealth)', 'CMS Physician Fee Schedule 2026', 'CMS readmission measures', 'AHRQ HCUP CCSR', 'NLM RxNorm', 'MedlinePlus Connect', 'OpenMed (Apache 2.0)']

export default function Landing() {
  return (
    <div className="relative">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute -top-40 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, #2dd4bf, transparent 70%)' }} />
        <div className="absolute top-1/4 -right-48 h-[600px] w-[600px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #34d399, transparent 70%)' }} />
        <div className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }} />
      </div>

      <Nav />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-40 pb-16 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mx-auto max-w-4xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-1 text-[12px] text-emerald-300">
            <Cpu className="h-3.5 w-3.5" /> the codes come from a trained model, not an LLM guess
          </div>
          <h1 className="text-5xl font-bold leading-[1.04] tracking-tight text-white sm:text-7xl">
            One clinical note,
            <br />
            <span className="gradient-text">four portals, coded and checked.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-slate-400 sm:text-xl">
            De-identified on your device, coded by a retriever and reranker trained on an A100, then audited against the extracted facts before anything reaches a portal.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo" className="group inline-flex items-center gap-2 rounded-xl bg-teal-400 px-7 py-3.5 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300 hover:shadow-lg hover:shadow-teal-400/25">
              Try the live demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/evals" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm text-slate-300 transition-all hover:border-white/20 hover:text-white">
              See the numbers
            </Link>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }} className="relative mx-auto mt-16 max-w-3xl">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAKEHOLDER_ORDER.map((s, i) => {
              const c = STAKEHOLDERS[s]
              return (
                <motion.div key={s} animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 5, delay: i * 0.5 }} className="rounded-2xl border bg-[#0a1120]/70 p-4 text-left backdrop-blur" style={{ borderColor: `${c.accent}33` }}>
                  <div className="mb-2 text-xl" style={{ color: c.accent }}>{c.glyph}</div>
                  <div className="text-sm font-semibold text-white">{c.label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{c.blurb}</div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </section>

      {/* ── Stats strip (real numbers) ─────────────────────────────── */}
      <section className="relative border-y border-white/[0.06] py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="gradient-text text-4xl font-bold">{s.n}</div>
              <div className="mt-1 text-xs leading-snug text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The trained decision layer + its numbers ───────────────── */}
      <section id="how" className="relative px-6 py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }}>
            <div className="text-xs uppercase tracking-wider text-emerald-300">The decisions are trained</div>
            <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Coding is a learned model, not an LLM guess.</h2>
            <p className="mt-4 leading-relaxed text-slate-400">
              A bi-encoder retriever learned {CODER.train_pairs.toLocaleString()} phrase to code pairs across the {CODER.index_codes.toLocaleString()} code FY2026 index, and a cross-encoder reranker was fine-tuned on CodiEsp clinical cases. Given a diagnosis mention it ranks the exact ICD-10-CM code first {Math.round(CODER.codiesp.acc1 * 100)}% of the time and inside the top five {Math.round(CODER.codiesp.acc5 * 100)}%.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
              Claude still writes the four portals, but it no longer chooses the codes, and every report it writes is audited against the extracted facts by a verifier and a constitution critic before it is shown.
            </p>
            <Link href="/evals" className="mt-5 inline-flex items-center gap-1.5 text-sm text-teal-300 hover:text-teal-200">
              Full evaluations <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6 }} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Trained ICD coder</div>
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">CodiEsp · N = {CODER.codiesp.mentions.toLocaleString()}</span>
            </div>
            <Bars items={[
              { label: 'acc@1 · exact code first', value: CODER.codiesp.acc1, tone: 'emerald' },
              { label: 'acc@5 · code in top 5', value: CODER.codiesp.acc5, tone: 'emerald' },
              { label: 'MRR', value: CODER.codiesp.mrr, tone: 'teal' },
            ]} />
          </motion.div>
        </div>
      </section>

      {/* ── Animated pipeline ──────────────────────────────────────── */}
      <section className="relative px-6 pb-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Seven stages from note to record</h2>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
              {Object.entries(KIND).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: v.c }} /> {v.tag}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((st, i) => {
              const k = KIND[st.kind]
              return (
                <motion.div
                  key={st.label}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  className="rounded-xl border bg-white/[0.02] p-4"
                  style={{ borderColor: `${k.c}2b` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                    <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider" style={{ background: `${k.c}18`, color: k.c }}>{k.tag}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{st.label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{st.model}</div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Scrollytelling agent floor ─────────────────────────────── */}
      <AgentFloor />

      {/* ── Try demo CTA ───────────────────────────────────────────── */}
      <section className="relative px-6 pb-16 pt-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-teal-400/20 p-12 text-center" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(52,211,153,0.08))' }}>
          <div className="absolute inset-0 opacity-30 blur-3xl" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.2), rgba(52,211,153,0.2))' }} />
          <div className="relative">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Paste any note. Watch it get coded and checked.</h2>
            <p className="mx-auto mt-4 max-w-md text-slate-400">
              No fixed patients, no canned demo. The trained coder links the diagnoses live, then a verifier audits every portal report against the extracted facts.
            </p>
            <Link href="/demo" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-400 px-9 py-4 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300 hover:shadow-lg hover:shadow-teal-400/30">
              Open the demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Trust strip ────────────────────────────────────────────── */}
      <section className="relative px-6 pb-16">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          {TRUST.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
              <f.icon className="mb-3 h-5 w-5 text-teal-400" />
              <div className="mb-1.5 text-sm font-semibold text-white">{f.title}</div>
              <p className="text-xs leading-relaxed text-slate-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Data sources strip ─────────────────────────────────────── */}
      <section className="relative px-6 pb-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-3 text-xs uppercase tracking-wider text-slate-600">Built on primary public data, rebuilt from source</div>
          <div className="flex flex-wrap justify-center gap-2">
            {SOURCES.map((src) => (
              <span key={src} className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-slate-400">{src}</span>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-slate-600 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="gradient-text font-bold">◈</span>
            <span>Synthure, clinical note normalization and claim readiness (research prototype)</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/evals" className="transition-colors hover:text-slate-300">Evals</Link>
            <Link href="/research" className="transition-colors hover:text-slate-300">Research</Link>
            <Link href="/demo" className="transition-colors hover:text-slate-300">Demo</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-slate-300">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
