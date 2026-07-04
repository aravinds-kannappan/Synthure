'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Fraunces, DM_Sans } from 'next/font/google'
import { ArrowRight, User, Stethoscope, Building2, Briefcase } from 'lucide-react'
import Nav from '@/components/Nav'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['700', '900'], display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' })

const STAGES = [
  { n: '01', color: 'text-indigo-400', title: 'Intake + de-identification', desc: 'Identifiers are scrubbed on your device before anything is sent.' },
  { n: '02', color: 'text-emerald-400', title: 'Biomedical NER', desc: 'OpenMed models tag diagnoses, medications, and labs with real confidences.' },
  { n: '03', color: 'text-cyan-400', title: 'ICD-10-CM coding', desc: 'A trained retriever and reranker link each mention to its billable code.' },
  { n: '04', color: 'text-amber-400', title: 'Risk + readiness', desc: 'CMS readmission rates and a sourced claim readiness scrub, no fabricated denial score.' },
  { n: '05', color: 'text-rose-400', title: 'Generation + audit', desc: 'Four portal writers, then a verifier and a constitution critic before anything ships.' },
]

const PORTALS = [
  { id: 'patient', icon: User, color: 'indigo', title: 'Patient', desc: 'Plain-language explanations, medication guidance, and a personalized out-of-pocket estimate for the reader plan.' },
  { id: 'physician', icon: Stethoscope, color: 'emerald', title: 'Physician', desc: 'Suggested coding with sequencing, documentation prompts, prior authorization needs, and the readiness checklist.' },
  { id: 'hospital', icon: Building2, color: 'cyan', title: 'Hospital', desc: 'Claim construction with CMS amounts, review lane, expected reimbursement, and HRRP exposure.' },
  { id: 'employer', icon: Briefcase, color: 'amber', title: 'Employer', desc: 'Aggregated, anonymized population category, cost exposure, and benefit design, with no identifying detail.' },
] as const

const METRICS = [
  { count: '41', suffix: '%', label: 'exact ICD-10-CM code ranked first, on CodiEsp gold mentions (N = 3,615)' },
  { count: '49', suffix: '%', label: 'correct code within the top five' },
  { count: '0.44', suffix: '', label: 'mean reciprocal rank of the trained coder' },
]

const SAFETY = [
  { title: 'Codes cannot be invented', desc: 'Every code comes from the official ICD-10-CM index and is revalidated against the CMS tabular before it appears.' },
  { title: 'Writers are audited', desc: 'A verifier and a constitution critic check each report against the extracted facts before it is shown.' },
  { title: 'It abstains when unsure', desc: 'Below a confidence threshold the pipeline escalates to a human coder instead of auto routing.' },
]

const PORTAL_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  indigo: { border: 'border-indigo-500/20', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  cyan: { border: 'border-cyan-500/20', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/10', text: 'text-amber-400' },
}

export default function Landing() {
  useEffect(() => {
    // reveal on scroll
    const revealObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target) } }),
      { threshold: 0.12 },
    )
    document.querySelectorAll('.reveal').forEach((el) => revealObs.observe(el))

    // metric count-up
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

    // pipeline scroll progression
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
    <div className={`${dmSans.className} relative overflow-x-hidden text-white`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle, #818cf8, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #34d399, transparent 70%)' }} />
      </div>

      <Nav />

      {/* Hero */}
      <section className="relative flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <p className="hero-anim hero-d1 text-sm uppercase tracking-[0.25em] text-indigo-300">One note, four portals</p>
          <h1 className={`${fraunces.className} hero-anim hero-d2 mt-6 text-5xl font-black leading-[1.05] sm:text-7xl`}>
            One clinical note,<br /><span className="gradient-text">coded and checked.</span>
          </h1>
          <p className="hero-anim hero-d3 mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-slate-300">
            De-identified on your device, coded by a retriever and reranker trained on an A100, then audited against the extracted facts before anything reaches a portal.
          </p>
          <div className="hero-anim hero-d3 mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo" className="group inline-flex items-center gap-2 rounded-xl bg-teal-400 px-7 py-3.5 text-sm font-bold text-[#05070f] transition-all hover:bg-teal-300">
              Try the live demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/evals" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm text-slate-300 transition-all hover:border-white/20 hover:text-white">
              See the numbers
            </Link>
          </div>
        </div>
      </section>

      <main className="relative mx-auto max-w-6xl px-6">
        {/* Pipeline */}
        <section id="pipeline-section" className="py-32">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>From messy note to auditable record</h2>
          <div className="relative mt-20" style={{ minHeight: '280vh' }}>
            <div className="sticky top-16 grid items-start gap-10 lg:grid-cols-[1fr_1.5fr]">
              <div className="space-y-4">
                {STAGES.map((st) => (
                  <div key={st.n} className="pipeline-stage rounded-2xl border border-slate-700/40 bg-white/[0.02] p-6">
                    <div className={`mb-2 text-xs font-bold uppercase tracking-wider ${st.color}`}>{st.n}</div>
                    <h3 className="font-bold text-white">{st.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{st.desc}</p>
                  </div>
                ))}
              </div>

              {/* animated clinical note */}
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
        <section className="py-32">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Four portals, one shared encounter</h2>
          <p className="reveal mx-auto mt-4 max-w-2xl text-center text-slate-400" style={{ transitionDelay: '0.1s' }}>
            The same coded record, rewritten for each reader. An action in one portal ripples through the others.
          </p>
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {PORTALS.map((p, i) => {
              const s = PORTAL_STYLE[p.color]
              const Icon = p.icon
              return (
                <div key={p.id} className={`reveal rounded-3xl border ${s.border} bg-white/[0.02] p-8 ${p.id === 'patient' ? 'glow' : ''}`} style={{ transitionDelay: `${i * 0.1}s` }}>
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${s.bg}`}>
                    <Icon className={`h-6 w-6 ${s.text}`} />
                  </div>
                  <h3 className="font-bold text-white">{p.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{p.desc}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Metrics */}
        <section className="py-32">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Measured on open data</h2>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {METRICS.map((m, i) => (
              <div key={m.label} className="reveal rounded-3xl border border-slate-700/30 bg-white/[0.02] p-12 text-center" style={{ transitionDelay: `${i * 0.1}s` }}>
                <p className={`${fraunces.className} gradient-text text-6xl font-black`} data-count={m.count} data-suffix={m.suffix}>{m.count}{m.suffix}</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">{m.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety */}
        <section className="py-32 pb-40">
          <h2 className={`${fraunces.className} reveal text-center text-4xl font-bold sm:text-5xl`}>Guardrails, not vibes</h2>
          <div className="mx-auto mt-16 grid max-w-4xl gap-6 md:grid-cols-3">
            {SAFETY.map((s, i) => (
              <div key={s.title} className="reveal rounded-3xl border border-slate-700/30 bg-white/[0.02] p-8" style={{ transitionDelay: `${i * 0.1}s` }}>
                <h3 className="font-bold text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
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
