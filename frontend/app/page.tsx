'use client'

// Landing, rebuilt to the ops identity: near black canvas, acid lime accent,
// Space Grotesk display over JetBrains Mono data, editorial section markers.
// It frames Synthure as an operations console for a clinical note, matching the
// /demo it links into, rather than a generic marketing scroll.

import Link from 'next/link'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, ShieldCheck, Lock, Layers } from 'lucide-react'
import UnderTheHood from '@/components/UnderTheHood'
import { STAKEHOLDERS, STAKEHOLDER_ORDER } from '@/lib/synthure'

const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' })

const LIME = '#b6f400'

const TRACE = [
  { g: '✓', c: '#2dd4bf', s: 'de identification', m: 'openmed pii 33m', v: '142ms' },
  { g: '✓', c: '#2dd4bf', s: 'biomedical ner', m: 'tinymed 65m', v: '318ms' },
  { g: '✓', c: '#22d3ee', s: 'code linking', m: 'reranker + index', v: 'E11.9' },
  { g: '✓', c: '#f59e0b', s: 'readiness', m: 'synthure gbm', v: '0.86' },
  { g: '✓', c: '#34d399', s: 'constitution audit', m: 'claude sonnet 4.6', v: 'pass' },
  { g: '›', c: '#818cf8', s: 'write patient', m: 'claude haiku 4.5', v: '', active: true },
]

const STATS = [
  { n: '98,186', l: 'ICD 10 CM codes, never generated' },
  { n: '13', l: 'pipeline stages, streamed live' },
  { n: '4', l: 'portals from one shared encounter' },
  { n: '41%', l: 'trained coder acc@1 on CodiEsp' },
]

const SAFETY = [
  { icon: Lock, title: 'Codes cannot be invented', desc: 'Every code is retrieved from the official ICD 10 CM index and revalidated against the CMS tabular before it appears.' },
  { icon: ShieldCheck, title: 'Writers are audited', desc: 'A verifier and a constitution critic check every report against the extracted facts, and a revise pass removes violations.' },
  { icon: Layers, title: 'It abstains when unsure', desc: 'Below a confidence threshold the pipeline escalates to a human coder instead of auto routing.' },
]

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.3 },
}

function Marker({ children }: { children: string }) {
  return <div className={`${mono.className} mb-4 text-[11px] font-semibold uppercase tracking-[0.3em]`} style={{ color: LIME }}>{children}</div>
}

export default function Landing() {
  return (
    <div className={`${mono.className} relative min-h-screen bg-[#08080b] text-zinc-300`}>
      <div className="pointer-events-none fixed inset-0 opacity-[0.4]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
      <div className="pointer-events-none fixed -top-40 left-1/4 h-[520px] w-[520px] rounded-full opacity-[0.07]" style={{ background: `radial-gradient(circle, ${LIME}, transparent 70%)` }} />

      {/* nav */}
      <nav className="relative z-20 flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg" style={{ color: '#4d7cff' }}>◈</span>
          <span className={`${grotesk.className} text-sm font-bold tracking-[0.16em] text-white`}>SYNTHURE</span>
          <span className="text-[10px] tracking-[0.3em] text-zinc-600">// OPS</span>
        </Link>
        <div className="hidden items-center gap-6 text-[12px] text-zinc-400 sm:flex">
          <Link href="/evals" className="hover:text-white">evals</Link>
          <Link href="/observability" className="hover:text-white">observability</Link>
          <Link href="/research" className="hover:text-white">research</Link>
          <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="hover:text-white">github</a>
        </div>
        <Link href="/demo" className={`${grotesk.className} flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-black transition-all hover:brightness-110`} style={{ background: LIME }}>
          Launch ops <ArrowRight className="h-4 w-4" />
        </Link>
      </nav>

      <main className="relative z-10 mx-auto max-w-6xl px-5">
        {/* hero */}
        <section className="grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <div className={`${mono.className} mb-5 text-[11px] font-semibold uppercase tracking-[0.3em]`} style={{ color: LIME }}>// clinical note operations</div>
            <h1 className={`${grotesk.className} text-5xl font-bold leading-[0.98] tracking-tight text-white sm:text-7xl`}>
              One note in.<br />Four portals out.<br /><span style={{ color: LIME }}>Watched live.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-zinc-400">
              Synthure de identifies a clinical note on your device, codes it against the official ICD 10 CM index, writes four role specific portals, and audits every line. The whole backend runs in front of you in the ops console.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/demo" className={`${grotesk.className} inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-sm font-bold text-black transition-all hover:brightness-110`} style={{ background: LIME }}>
                Launch the ops console <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/evals" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3.5 text-sm text-zinc-300 transition-all hover:border-white/30 hover:text-white">
                See the evals
              </Link>
            </div>
          </div>

          {/* hero terminal */}
          <motion.div {...reveal} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-[#050507] shadow-2xl shadow-black/60">
            <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-2 text-[11px] text-zinc-600">synthure backend</span>
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400">POST /api/synthesize</span>
              <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: LIME }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: LIME }} /> streaming
              </span>
            </div>
            <div className="space-y-1 px-4 py-4 text-[12px] leading-relaxed">
              {TRACE.map((l) => (
                <div key={l.s} className="flex items-baseline gap-2">
                  <span style={{ color: l.c }}>{l.g}</span>
                  <span className="w-36 flex-shrink-0 text-zinc-300">{l.s}</span>
                  <span className="hidden flex-1 truncate text-zinc-600 sm:block">{l.m}</span>
                  {l.active ? <span className="ml-auto inline-block h-3.5 w-2 animate-pulse" style={{ background: LIME }} />
                    : <span className="ml-auto flex-shrink-0 tabular-nums" style={{ color: l.c }}>{l.v}</span>}
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* stat band */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="bg-[#08080b] p-6">
              <div className={`${grotesk.className} text-4xl font-bold text-white`}>{s.n}</div>
              <div className="mt-2 text-[11px] leading-snug text-zinc-500">{s.l}</div>
            </div>
          ))}
        </section>

        {/* under the hood */}
        <section id="how" className="py-20">
          <Marker>// under the hood</Marker>
          <h2 className={`${grotesk.className} max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl`}>The actual backend, end to end.</h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
            On device models, an edge pipeline of Claude agents, an optional trained coder service, per run guardrails and an audit chain, and a CI gate on every change. No black boxes.
          </p>
          <UnderTheHood />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/demo" className={`${grotesk.className} inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-black transition-all hover:brightness-110`} style={{ background: LIME }}>
              Watch it run <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/evals" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3 text-sm text-zinc-300 transition-all hover:border-white/30 hover:text-white">
              See the evals
            </Link>
          </div>
        </section>

        {/* portals */}
        <section className="border-t border-white/10 py-20">
          <Marker>// four portals, one encounter</Marker>
          <h2 className={`${grotesk.className} max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl`}>The same coded record, rewritten for each reader.</h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
            An action in one portal ripples through the others. Approve a prior authorization in the clinic and it clears the claim, advances reimbursement, and flips the patient view to covered.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STAKEHOLDER_ORDER.map((s, i) => {
              const cfg = STAKEHOLDERS[s]
              return (
                <motion.div key={s} {...reveal} transition={{ duration: 0.55, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-2xl border bg-white/[0.02] p-6" style={{ borderColor: `${cfg.accent}33`, borderTop: `2px solid ${cfg.accent}` }}>
                  <div className="text-2xl" style={{ color: cfg.accent }}>{cfg.glyph}</div>
                  <div className={`${grotesk.className} mt-3 text-lg font-bold text-white`}>{cfg.label}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em]" style={{ color: cfg.accent }}>{cfg.agent}</div>
                  <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">{cfg.blurb}.</p>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* guardrails */}
        <section className="border-t border-white/10 py-20">
          <Marker>// guardrails, not vibes</Marker>
          <div className="grid gap-6 md:grid-cols-3">
            {SAFETY.map((s, i) => {
              const Icon = s.icon
              return (
                <motion.div key={s.title} {...reveal} transition={{ duration: 0.55, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${LIME}14` }}>
                    <Icon className="h-4 w-4" style={{ color: LIME }} />
                  </span>
                  <h3 className={`${grotesk.className} mt-4 font-bold text-white`}>{s.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{s.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* cta */}
        <section className="border-t border-white/10 py-24 text-center">
          <h2 className={`${grotesk.className} text-4xl font-bold tracking-tight text-white sm:text-6xl`}>Run a note through it.</h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] text-zinc-400">No account. Paste any clinical note and watch the backend execute, stage by stage, in the ops console.</p>
          <Link href="/demo" className={`${grotesk.className} mt-9 inline-flex items-center gap-2 rounded-lg px-8 py-4 text-base font-bold text-black transition-all hover:brightness-110`} style={{ background: LIME }}>
            Launch the ops console <ArrowUpRight className="h-5 w-5" />
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[11px] text-zinc-600 sm:flex-row">
          <span>Synthure. Clinical note normalization and claim readiness. Research prototype, not a medical device.</span>
          <div className="flex items-center gap-5">
            <Link href="/evals" className="hover:text-zinc-300">evals</Link>
            <Link href="/research" className="hover:text-zinc-300">research</Link>
            <Link href="/demo" className="hover:text-zinc-300">demo</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300">github</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
