'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPortalHome } from '@/lib/portal'
import type { PortalRole } from '@/lib/types'

const PORTALS = [
  {
    label: 'Patient',
    icon: '◎',
    desc: 'Understand your diagnosis, medications, and next steps in plain language. No medical degree required.',
    accent: 'teal',
    border: 'border-teal-500/20 hover:border-teal-500/50',
    glow: 'hover:shadow-teal-500/10',
    text: 'text-teal-400',
    bg: 'bg-teal-500/5',
  },
  {
    label: 'Physician',
    icon: '◈',
    desc: 'AI Navigator decodes clinical notes, routes prior auths, and matches insurance — in parallel.',
    accent: 'indigo',
    border: 'border-indigo-500/20 hover:border-indigo-500/50',
    glow: 'hover:shadow-indigo-500/10',
    text: 'text-indigo-400',
    bg: 'bg-indigo-500/5',
  },
  {
    label: 'Hospital',
    icon: '⬡',
    desc: 'Revenue cycle, CRM, denial management, and real-time operational intelligence in one view.',
    accent: 'cyan',
    border: 'border-cyan-500/20 hover:border-cyan-500/50',
    glow: 'hover:shadow-cyan-500/10',
    text: 'text-cyan-400',
    bg: 'bg-cyan-500/5',
  },
  {
    label: 'Employer',
    icon: '◇',
    desc: 'Population health trends, benefits optimization, COBRA management, and cost forecasting.',
    accent: 'violet',
    border: 'border-violet-500/20 hover:border-violet-500/50',
    glow: 'hover:shadow-violet-500/10',
    text: 'text-violet-400',
    bg: 'bg-violet-500/5',
  },
]

const STATS = [
  { value: '1.4M+', label: 'ICD-10 codes indexed' },
  { value: '4', label: 'clinical portals' },
  { value: '107', label: 'NER entity types' },
  { value: '<2s', label: 'avg pipeline latency' },
]

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      const raw = localStorage.getItem('synthure_user')
      if (raw) {
        const user = JSON.parse(raw)
        if (user?.role) {
          router.replace(getPortalHome(user.role as PortalRole))
        }
      }
    } catch {
      localStorage.removeItem('synthure_user')
    }
  }, [router])

  return (
    <div className="min-h-screen bg-[#04091a] text-slate-100">

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-slate-800/60 bg-[#04091a]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-teal-400 font-light tracking-widest text-lg">◈ SYNTHURE</span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-sm bg-teal-500 hover:bg-teal-400 text-[#04091a] font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-24 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-400 text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
          Clinical AI — four portals, one engine
        </div>
        <h1 className="text-5xl sm:text-6xl font-extralight tracking-tight mb-6 max-w-3xl mx-auto leading-tight">
          Healthcare intelligence{' '}
          <span className="text-teal-400">that actually works</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Synthure connects patients, physicians, hospitals, and employers through
          real AI pipelines — semantic search, NER, denial prediction, and
          plain-language translation of clinical complexity.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/login"
            className="bg-teal-500 hover:bg-teal-400 text-[#04091a] font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            Try the demo
          </Link>
          <a
            href="https://github.com/aravinds-kannappan/Synthure"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-slate-100 px-8 py-3 rounded-xl text-sm transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-slate-800/60">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-light text-teal-400 mb-1">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Portals */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-light mb-3">Four portals. One platform.</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Every stakeholder in the healthcare chain gets a tailored AI-powered view.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PORTALS.map((p) => (
              <Link
                key={p.label}
                href="/login"
                className={`group rounded-2xl border p-6 transition-all duration-200 hover:shadow-lg ${p.border} ${p.glow} ${p.bg}`}
              >
                <div className={`text-3xl mb-4 ${p.text}`}>{p.icon}</div>
                <h3 className={`text-base font-medium mb-2 ${p.text}`}>{p.label}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{p.desc}</p>
                <div className={`mt-4 text-xs font-medium ${p.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                  Enter portal →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="py-24 px-6 border-t border-slate-800/60">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-light mb-4">Real AI, not just prompts</h2>
          <p className="text-slate-400 text-sm mb-16 max-w-xl mx-auto">
            Every clinical note runs through a five-stage pipeline with real trained models.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { step: '1', label: 'Quality Gate', sub: 'ICD-10 / CPT validation + dedup' },
              { step: '2', label: 'HF NER', sub: 'd4data biomedical-ner-all (107 entities)' },
              { step: '3', label: 'pgvector RAG', sub: '1.4M codes — semantic similarity' },
              { step: '4', label: 'Denial ML', sub: 'GradientBoosting on 38K transcriptions' },
              { step: '5', label: 'Claude', sub: 'Haiku / Sonnet with citation grounding' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="bg-[#0d1525] border border-slate-700 rounded-xl p-4 w-44 text-left">
                  <span className="text-xs text-teal-400 font-mono">0{item.step}</span>
                  <p className="text-sm font-medium text-slate-200 mt-1">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>
                </div>
                {i < 4 && <span className="text-slate-700 text-lg">→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-slate-800/60">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-light mb-4">Ready to explore?</h2>
          <p className="text-slate-400 text-sm mb-8">
            All four portals are available in demo mode — no account required.
          </p>
          <Link
            href="/login"
            className="inline-block bg-teal-500 hover:bg-teal-400 text-[#04091a] font-semibold px-10 py-3 rounded-xl text-sm transition-colors"
          >
            Enter Synthure →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-8 px-6 text-center">
        <p className="text-xs text-slate-600">
          ◈ Synthure · Clinical AI platform ·{' '}
          <a
            href="https://github.com/aravinds-kannappan/Synthure"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-400 transition-colors"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}
