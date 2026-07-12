'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Fraunces, DM_Sans } from 'next/font/google'
import { motion } from 'framer-motion'
import {
  ArrowRight, User, Stethoscope, Building2, Briefcase,
  ShieldCheck, Database, GitBranch, RefreshCw, Layers, Cpu,
} from 'lucide-react'
import Nav from '@/components/Nav'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' })

const STAGES = [
  { n: '01', color: 'text-indigo-400', title: 'Intake + de-identification', desc: 'Identifiers are scrubbed on your device before anything is sent.' },
  { n: '02', color: 'text-emerald-400', title: 'Biomedical NER', desc: 'OpenMed models tag diagnoses, medications, and labs with real confidences.' },
  { n: '03', color: 'text-cyan-400', title: 'ICD-10-CM coding', desc: 'A trained retriever and reranker link each mention to its billable code.' },
  { n: '04', color: 'text-amber-400', title: 'Risk + readiness', desc: 'CMS readmission rates and a sourced claim readiness scrub, no fabricated denial score.' },
  { n: '05', color: 'text-rose-400', title: 'Generation + audit', desc: 'Four portal writers, then one combined verifier and constitution critic before anything ships.' },
]

const PORTALS = [
  { id: 'patient', icon: User, color: 'indigo', title: 'Patient', desc: 'Plain-language explanations, medication guidance, and a personalized out-of-pocket estimate for the reader plan.' },
  { id: 'physician', icon: Stethoscope, color: 'emerald', title: 'Physician', desc: 'Suggested coding with sequencing, documentation prompts, prior authorization needs, and the readiness checklist.' },
  { id: 'hospital', icon: Building2, color: 'cyan', title: 'Hospital', desc: 'Claim construction with CMS amounts, review lane, expected reimbursement, and HRRP exposure.' },
  { id: 'employer', icon: Briefcase, color: 'amber', title: 'Employer', desc: 'Aggregated, anonymized population category, cost exposure, and benefit design, with no identifying detail.' },
] as const

const CAPABILITIES = [
  { icon: ShieldCheck, color: '#2dd4bf', title: 'De-identified on device', desc: 'OpenMed scrubs identifiers in your browser. The raw note never leaves it.' },
  { icon: Database, color: '#34d399', title: 'Trained on real notes', desc: 'A note generator trained on open clinical corpora replaces the old hand-written templates.' },
  { icon: GitBranch, color: '#818cf8', title: 'Follow a fact anywhere', desc: 'One code or dollar, shown as each of the four readers sees it, with full provenance.' },
  { icon: ArrowRight, color: '#22d3ee', title: 'Cross-portal handoffs', desc: 'Flag a prior auth in the clinic; it lands in Revenue’s queue and ripples straight back.' },
  { icon: RefreshCw, color: '#a78bfa', title: 'Feedback flywheel', desc: 'Every human correction becomes labeled training data, exportable as JSON.' },
  { icon: Layers, color: '#fbbf24', title: 'Audited, not vibes', desc: 'One verifier and constitution critic checks every report before it ships.' },
]

const FACT_LENSES = [
  { portal: 'Patient', color: '#2dd4bf', text: 'A plain-language card: what type 2 diabetes means and how to manage it.' },
  { portal: 'Clinician', color: '#818cf8', text: 'Billable code E11.9 with provenance: linked from the note phrase.' },
  { portal: 'Revenue', color: '#22d3ee', text: 'Establishes the medical necessity for the billed services.' },
  { portal: 'Employer', color: '#a78bfa', text: 'Rolls into the diabetes CCSR cohort, anonymized and aggregated.' },
]

const METRICS = [
  { count: '41', suffix: '%', label: 'exact ICD-10-CM code ranked first, on CodiEsp gold mentions (N = 3,615)' },
  { count: '49', suffix: '%', label: 'correct code within the top five' },
  { count: '0.44', suffix: '', label: 'mean reciprocal rank of the trained coder' },
]

const SAFETY = [
  { title: 'Codes cannot be invented', desc: 'Every code comes from the official ICD-10-CM index and is revalidated against the CMS tabular before it appears.' },
  { title: 'Writers are audited', desc: 'One combined verifier and constitution critic checks each report against the extracted facts before it is shown.' },
  { title: 'It abstains when unsure', desc: 'Below a confidence threshold the pipeline escalates to a human coder instead of auto routing.' },
]

const PORTAL_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  indigo: { border: 'border-indigo-500/20', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  cyan: { border: 'border-cyan-500/20', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/10', text: 'text-amber-400' },
}

const pop = {
  initial: { opacity: 0, y: 28, scale: 0.96 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, amount: 0.3 },
}

export default function Landing() {
  useEffect(() => {
    const revealObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target) } }),
      { threshold: 0.12 },
    )
    document.querySelectorAll('.reveal').forEach((el) => revealObs.observe(el))

    const countObs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        const target = parseFloat(el.dataset.count || '0')
        const suffix = el.dataset.suffix || ''
        const isDecimal = String(el.dataset.count || '').includes('.')
        const duration = 1800
        const startT = performance.now()
        countObs.unobserve(el)
        const tick = (now: number) => {
          const p = Math.min((now - startT) / duration, 1)
          const eased = 1 - Math.pow(1 - p, 4)
          el.textContent = (isDecimal ? (target * eased).toFixed(2) : Math.round(target * eased)) + suffix
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
    }, { threshold: 0.5 })
    document.querySelectorAll('[data-count]').forEach((el) => countObs.observe(el))

    const section = document.getElementById('pipeline-section')
    const stages = document.querySelectorAll('.pipeline-stage')
    const noteLines = document.querySelectorAll<HTMLElement>('.note-line')
    const codeTags = document.querySelectorAll('.code-tag')
    const riskBars = document.querySelectorAll('.risk-bar')
    const outputLines = document.querySelectorAll('.output-line')
    const updatePipeline = () => {
      if (!section) return
      const rect = section.getBoundingClientRect()
      const scrollable = rect.height - window.innerHeight
      const progress = Math.max(0, Math.min(1, -rect.top / scrollable))
      const active = Math.min(5, Math.floor(progress * 5) + 1)
      stages.forEach((s, i) => s.classList.toggle('active', i < active))
      noteLines.forEach((l) => l.classList.toggle('revealed', parseInt(l.dataset.stage || '0') <= active))
      codeTags.forEach((t) => t.classList.toggle('shown', active >= 3))
      riskBars.forEach((b) => b.classList.toggle('filled', active >= 4))
      outputLines.forEach((l) => l.classList.toggle('typed', active >= 5))
    }
    window.addEventListener('scroll', updatePipeline, { passive: true })
    updatePipeline()

    return () => {
      revealObs.disconnect()
      countObs.disconnect()
      window.removeEventListener('scroll', updatePipeline)
    }
  }, [])

  return (
    <div className={`${dmSans.className} relative text-white`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, #818cf8, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #34d399, transparent 70%)' }} />
      </div>

      <Nav />

      {/* Hero */}
      <section className="relative flex items-center justify-center" style={{ minHeight: '92vh' }}>
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <p className="hero-anim hero-d1 text-sm uppercase tracking-[0.25em] text-indigo-300">One note, four portals</p>
          <h1 className={`${fraunces.className} hero-anim hero-d2 mt-6 text-5xl font-black leading-[1.05] sm:text-7xl`}>
            One clinical note,<br /><span className="gradient-text">coded and checked.</span>
          </h1>
          <p className="hero-anim hero-d3 mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-slate-300">
            De-identified on your device, coded by a trained retriever and reranker, then audited against the extracted facts before anything reaches a portal.
          </p>
          <div className="hero-anim hero-d3 mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo" className="group inline-flex items-center gap-2 rounded-xl bg-teal-400 px-7 py-3.5 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300">
              Try the live demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/research" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm text-slate-300 transition-all hover:border-white/20 hover:text-white">
              Research notes
            </Link>
          </div>
          {/* Hero capability chips */}
          <div className="hero-anim hero-d3 mt-12 flex flex-wrap items-center justify-center gap-2">
            {['On-device privacy', 'Trained coder', 'Follow a fact', 'Constitution audit'].map((c) => (
              <span key={c} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400">{c}</span>
            ))}
          </div>
        </div>
      </section>

      <main className="relative mx-auto max-w-6xl px-6">
        {/* Capabilities */}
        <section className="py-20">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Everything is real and traceable</h2>
          <p className="reveal mx-auto mt-4 max-w-2xl text-center text-slate-400">Six things this build does that a chat wrapper cannot.</p>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => {
              const Icon = c.icon
              return (
                <motion.div
                  key={c.title}
                  {...pop}
                  transition={{ duration: 0.6, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="group rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors hover:border-white/20"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl transition-transform group-hover:scale-110" style={{ background: `${c.color}1a` }}>
                    <Icon className="h-5 w-5" style={{ color: c.color }} />
                  </div>
                  <h3 className="font-bold text-white">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* Pipeline */}
        <section id="pipeline-section" className="py-20">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>From messy note to auditable record</h2>
          <div className="relative mt-16" style={{ minHeight: '170vh' }}>
            <div className="sticky top-24 grid items-start gap-10 lg:grid-cols-[1fr_1.5fr]">
              <div className="space-y-4">
                {STAGES.map((st) => (
                  <div key={st.n} className="pipeline-stage rounded-2xl border border-slate-700/40 bg-white/[0.02] p-6">
                    <div className={`mb-2 text-xs font-bold uppercase tracking-wider ${st.color}`}>{st.n}</div>
                    <h3 className="font-bold text-white">{st.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{st.desc}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-3xl border border-slate-700/40 bg-[#0d0d18] p-8">
                <div className="mb-6 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-rose-500/60" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/60" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
                  <span className="ml-3 font-mono text-xs text-slate-500">clinical_note.txt</span>
                </div>
                <div className="space-y-1 font-mono text-xs leading-7 text-slate-300">
                  <p className="note-line" data-stage="1">Patient: [redacted on device] · DOB: [redacted]</p>
                  <p className="note-line" data-stage="1">Encounter: 2026-07-01, follow up visit</p>
                  <p className="note-line" data-stage="2">HPI: pt presents with <span className="entity-highlight">persistent chest pain</span> radiating to left arm x 3 days.</p>
                  <p className="note-line" data-stage="2">PMH: <span className="entity-highlight">Type 2 diabetes</span>, <span className="entity-highlight">hypertension</span>, prior <span className="entity-highlight">MI 2019</span>.</p>
                  <p className="note-line" data-stage="2">Meds: <span className="entity-highlight">Metformin 1000mg</span>, <span className="entity-highlight">Lisinopril 20mg</span>, <span className="entity-highlight">Aspirin 81mg</span></p>
                  <p className="note-line" data-stage="3">Codes: <span className="code-tag">I20.9 Angina pectoris</span> <span className="code-tag">E11.9 T2DM</span> <span className="code-tag">I10 HTN</span></p>
                  <p className="note-line" data-stage="3"><span className="code-tag">CPT 99214</span> <span className="code-tag">CPT 93000 EKG</span></p>
                  <p className="note-line" data-stage="4">Risk: HRRP readmission rate <span className="text-amber-400">0.23</span></p>
                  <p className="note-line" data-stage="4"><span className="risk-bar mt-1 block" /></p>
                  <p className="note-line" data-stage="4">Claim readiness: <span className="text-emerald-400">PASS</span></p>
                  <p className="note-line output-line" data-stage="5" style={{ color: '#818cf8' }}>&#9656; Patient summary generated</p>
                  <p className="note-line output-line" data-stage="5" style={{ color: '#34d399' }}>&#9656; Prior auth packet ready</p>
                  <p className="note-line output-line" data-stage="5" style={{ color: '#fbbf24' }}>&#9656; Claim submitted to payer</p>
                  <p className="note-line output-line" data-stage="5" style={{ color: '#f87171' }}>&#9656; Constitution audit: PASSED</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Portals */}
        <section className="py-20">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Four portals, one shared encounter</h2>
          <p className="reveal mx-auto mt-4 max-w-2xl text-center text-slate-400">
            The same coded record, rewritten for each reader. An action in one portal ripples through the others.
          </p>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PORTALS.map((p, i) => {
              const s = PORTAL_STYLE[p.color]
              const Icon = p.icon
              return (
                <motion.div
                  key={p.id}
                  {...pop}
                  transition={{ duration: 0.6, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                  className={`rounded-3xl border ${s.border} bg-white/[0.02] p-7 ${p.id === 'patient' ? 'glow' : ''}`}
                >
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${s.bg}`}>
                    <Icon className={`h-6 w-6 ${s.text}`} />
                  </div>
                  <h3 className="font-bold text-white">{p.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* One fact, four lenses */}
        <section className="py-20">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>One fact, four lenses</h2>
          <p className="reveal mx-auto mt-4 max-w-2xl text-center text-slate-400">
            Click any code, dollar, or check in the demo and see the same truth as each reader sees it, with its provenance.
          </p>
          <div className="mt-14 flex flex-col items-center">
            <motion.div
              {...pop}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-2xl border border-teal-400/30 bg-teal-400/[0.06] px-5 py-3"
            >
              <GitBranch className="h-4 w-4 text-teal-300" />
              <span className="font-mono text-sm text-teal-200">E11.9</span>
              <span className="text-sm text-slate-300">Type 2 diabetes</span>
            </motion.div>
            <div className="mt-3 h-8 w-px bg-gradient-to-b from-teal-400/40 to-transparent" />
            <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FACT_LENSES.map((l, i) => (
                <motion.div
                  key={l.portal}
                  {...pop}
                  transition={{ duration: 0.55, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
                  style={{ borderTop: `2px solid ${l.color}` }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: l.color }}>{l.portal}</div>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{l.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="py-20">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Measured on open data</h2>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {METRICS.map((m, i) => (
              <motion.div
                key={m.label}
                {...pop}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-3xl border border-slate-700/30 bg-white/[0.02] p-10 text-center"
              >
                <p className={`${fraunces.className} gradient-text text-6xl font-black`} data-count={m.count} data-suffix={m.suffix}>{m.count}{m.suffix}</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">{m.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Safety */}
        <section className="py-20 pb-32">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Guardrails, not vibes</h2>
          <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-3">
            {SAFETY.map((s, i) => (
              <motion.div
                key={s.title}
                {...pop}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-3xl border border-slate-700/30 bg-white/[0.02] p-7"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-teal-400/10">
                  <Cpu className="h-4 w-4 text-teal-300" />
                </div>
                <h3 className="font-bold text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-slate-600 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="gradient-text font-bold">◈</span>
            <span>Synthure, clinical note normalization and claim readiness (research prototype)</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/research" className="transition-colors hover:text-slate-300">Research</Link>
            <Link href="/demo" className="transition-colors hover:text-slate-300">Demo</Link>
            <a href="https://github.com/aravinds-kannappan/Synthure" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-slate-300">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
