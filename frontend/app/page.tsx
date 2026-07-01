'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck, GitBranch, Gauge, Zap } from 'lucide-react'
import Nav from '@/components/Nav'
import HowItWorks from '@/components/HowItWorks'
import { STAKEHOLDERS, STAKEHOLDER_ORDER } from '@/lib/synthure'

const STATS = [
  { n: '3', label: 'OpenMed models running in your browser' },
  { n: '98,186', label: 'ICD 10 CM FY2026 codes in the knowledge layer' },
  { n: '9,724', label: 'services priced from CMS fee schedules' },
  { n: '0', label: 'identifiers leave your device' },
]

const TRUST = [
  { icon: ShieldCheck, title: 'De identified on your device', body: 'An OpenMed PII model runs in your browser and scrubs identifiers before the note leaves it. The raw note is never sent anywhere.' },
  { icon: GitBranch, title: 'Codes cannot be invented', body: 'Diagnosis codes are retrieved from the official ICD 10 CM index; the language model only chooses among retrieved candidates, and a verifier plus constitution critic audit and revise every report.' },
  { icon: Gauge, title: 'Every number is sourced', body: 'Prices are CMS fee schedule amounts, readmission is the CMS published rate, cohorts are AHRQ CCSR categories, and readiness is a checklist that cites its rule. No invented probabilities.' },
]

const SOURCES = ['CDC/NCHS ICD 10 CM FY2026', 'CMS Physician Fee Schedule 2026', 'CMS Clinical Lab Fee Schedule 2026', 'CMS OPD prior authorization list', 'CMS readmission measures (data.cms.gov)', 'AHRQ HCUP CCSR v2025', 'NLM RxNorm', 'MedlinePlus Connect']

export default function Landing() {
  return (
    <div className="relative">
      {/* Background layer — fixed + clipped so it never creates a scroll container */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute -top-40 -left-32 h-[600px] w-[600px] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, #2dd4bf, transparent 70%)' }} />
        <div className="absolute top-1/4 -right-48 h-[600px] w-[600px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #818cf8, transparent 70%)' }} />
        <div className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #a78bfa, transparent 70%)' }} />
      </div>

      <Nav />

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="relative pt-40 pb-24 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/[0.07] px-3.5 py-1.5 text-xs font-medium text-teal-300 mb-7">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
            OpenMed models on your device · Claude agents in the loop
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.04] text-white">
            One clinical note.
            <br />
            <span className="gradient-text">Four intelligent reports.</span>
          </h1>
          <p className="mt-7 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Synthure reads one clinical note and opens a tailored, verified portal for everyone it
            touches: the patient, the physician, the hospital, and the employer. De identification
            and clinical NER run as open models in your browser; nothing identifiable ever leaves it.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              className="group inline-flex items-center gap-2 rounded-xl bg-teal-400 px-7 py-3.5 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300 hover:shadow-lg hover:shadow-teal-400/25"
            >
              Try the live demo
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm text-slate-300 transition-all hover:border-white/20 hover:text-white"
            >
              See how it works
            </a>
          </div>
        </motion.div>

        {/* floating stakeholder constellation */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative mt-20 max-w-3xl mx-auto"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STAKEHOLDER_ORDER.map((s, i) => {
              const c = STAKEHOLDERS[s]
              return (
                <motion.div
                  key={s}
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 5, delay: i * 0.5 }}
                  className="rounded-2xl border bg-[#0a1120]/70 backdrop-blur p-4 text-left"
                  style={{ borderColor: `${c.accent}33` }}
                >
                  <div className="text-xl mb-2" style={{ color: c.accent }}>{c.glyph}</div>
                  <div className="text-sm font-semibold text-white">{c.label}</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">{c.blurb}</div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────── */}
      <section className="relative border-y border-white/[0.06] py-12">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-bold gradient-text">{s.n}</div>
              <div className="mt-1 text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scrollytelling (all agents revealed here) ──────────────── */}
      <HowItWorks />

      {/* ── Try demo CTA — sits right after the animation ──────────── */}
      <section className="relative px-6 pt-10 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="max-w-3xl mx-auto rounded-3xl border border-teal-400/20 p-12 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(129,140,248,0.08))' }}
        >
          <div className="absolute inset-0 blur-3xl opacity-30" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.2), rgba(129,140,248,0.2))' }} />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Type your own note. See the magic.</h2>
            <p className="mt-4 text-slate-400 max-w-md mx-auto">
              No fixed patients, no canned demo. Paste any clinical note and watch the agents go to work.
            </p>
            <Link
              href="/demo"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-400 px-9 py-4 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300 hover:shadow-lg hover:shadow-teal-400/30"
            >
              Open the demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Data sources strip ─────────────────────────────────────── */}
      <section className="relative px-6 pb-10">
        <div className="max-w-5xl mx-auto text-center">
          <div className="text-xs uppercase tracking-wider text-slate-600 mb-3">Built on primary public data, rebuilt from source</div>
          <div className="flex flex-wrap justify-center gap-2">
            {SOURCES.map((src) => (
              <span key={src} className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-slate-400">{src}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ────────────────────────────────────────────── */}
      <section className="relative px-6 pb-20">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-4">
          {TRUST.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
              <f.icon className="h-5 w-5 text-teal-400 mb-3" />
              <div className="text-sm font-semibold text-white mb-1.5">{f.title}</div>
              <p className="text-xs text-slate-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className="relative px-6 py-24 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center">
          <Zap className="h-7 w-7 text-teal-400 mx-auto mb-5" />
          <h2 className="text-4xl sm:text-5xl font-bold text-white">Healthcare’s busywork, handled.</h2>
          <p className="mt-5 text-slate-400 max-w-lg mx-auto">
            One note used to mean four people doing four jobs in four systems. Synthure does it in one pass.
          </p>
          <Link
            href="/demo"
            className="mt-9 inline-flex items-center gap-2 rounded-xl bg-white px-9 py-4 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300"
          >
            Try the demo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="gradient-text font-bold">◈</span>
            <span>Synthure, Multi Agent Clinical AI</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/research" className="hover:text-slate-300 transition-colors">Research</Link>
            <Link href="/demo" className="hover:text-slate-300 transition-colors">Demo</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">GitHub</a>
            <a href="https://github.com/maziyarpanahi/openmed" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">NER & PII: OpenMed (Apache 2.0)</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
