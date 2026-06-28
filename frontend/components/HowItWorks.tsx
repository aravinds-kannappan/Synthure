'use client'

import { useRef, useState } from 'react'
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion'
import { FileText, ShieldCheck, Check, ChevronDown, Database, Activity, ScanLine, PenLine } from 'lucide-react'
import { STAKEHOLDERS, STAKEHOLDER_ORDER, type Stakeholder } from '@/lib/synthure'

// ── The fixed demo note, broken into tokens. Entity tokens get highlighted and
//    pulled out by the NER agent as you scroll. ──────────────────────────────
type EType = 'vital' | 'lab' | 'dx' | 'med' | 'proc'
const ETYPE_COLOR: Record<EType, string> = {
  vital: '#2dd4bf',
  lab: '#fbbf24',
  dx: '#818cf8',
  med: '#a78bfa',
  proc: '#22d3ee',
}
const ETYPE_LABEL: Record<EType, string> = {
  vital: 'VITAL',
  lab: 'LAB',
  dx: 'DIAGNOSIS',
  med: 'MEDICATION',
  proc: 'PROCEDURE',
}

type Tok = string | { t: string; e: EType }
const TOKENS: Tok[] = [
  '55yo M, ',
  { t: 'BP 152/96', e: 'vital' },
  '. ',
  { t: 'A1C 7.2%', e: 'lab' },
  ', ',
  { t: 'LDL 165', e: 'lab' },
  '. Dx: essential hypertension (',
  { t: 'I10', e: 'dx' },
  '), type 2 diabetes (',
  { t: 'E11.9', e: 'dx' },
  '). Started ',
  { t: 'lisinopril', e: 'med' },
  ' 10mg, ',
  { t: 'atorvastatin', e: 'med' },
  ' 20mg. Ordered lipid panel (',
  { t: 'CPT 80061', e: 'proc' },
  ').',
]
const FULL = TOKENS.map((x) => (typeof x === 'string' ? x : x.t)).join('')
const TOTAL = FULL.length
const ENTITIES = TOKENS.filter((x): x is { t: string; e: EType } => typeof x !== 'string')

const CODE_RESOLVE = [
  { code: 'I10', label: 'Essential hypertension' },
  { code: 'E11.9', label: 'Type 2 diabetes mellitus' },
  { code: '80061', label: 'Lipid panel (CPT)' },
]

const WRITER_LINES: Record<Stakeholder, string[]> = {
  patient: [
    'You have high blood pressure and high cholesterol.',
    'Two once daily medicines will help control them.',
    'Keep your follow up lab appointment in 6 weeks.',
  ],
  physician: [
    'Dx I10, E11.9 · Rx lisinopril, atorvastatin',
    'No prior auth required, standard submission',
    'Order pre validated: lipid panel (80061)',
  ],
  hospital: [
    'Claim routed → standard review lane',
    'Readmission 18% (CMS HRRP) · clean claim',
    'Est. reimbursement within expected band',
  ],
  employer: [
    'Cardiometabolic cohort utilization +1',
    'In network · moderate cost tier',
    'No ACA / COBRA action triggered',
  ],
}

// sub-progress within [a,b]
const sub = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)))

// Phase ranges across scroll progress 0..1
const R = {
  type: [0.0, 0.16] as const,
  extract: [0.16, 0.34] as const,
  knowledge: [0.34, 0.46] as const,
  risk: [0.46, 0.56] as const,
  writers: [0.56, 0.86] as const,
  verify: [0.86, 0.94] as const,
  orch: [0.94, 1.0] as const,
}

const VERIFY_CHECKS = [
  'ICD-10 codes resolve in knowledge base',
  'CPT 80061 validated',
  'Every claim traces to a note entity',
  'No fabricated clinical facts',
]

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [p, setP] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setP(v))

  // ── Derived scrub values ───────────────────────────────────────────────────
  const charsShown = Math.round(sub(p, R.type[0], R.type[1]) * TOTAL)
  const typing = p < R.type[1] && charsShown < TOTAL

  const extractN = Math.round(sub(p, R.extract[0], R.extract[1]) * ENTITIES.length)
  const knowledgeN = Math.round(sub(p, R.knowledge[0], R.knowledge[1]) * CODE_RESOLVE.length)
  const reviewFill = Math.round(sub(p, R.risk[0], R.risk[1]) * 12)
  const readmitFill = Math.round(sub(p, R.risk[0], R.risk[1]) * 18)

  const writersP = sub(p, R.writers[0], R.writers[1])
  const activeWriter = Math.min(3, Math.floor(writersP * 4))
  const writerLineP = (writersP * 4) % 1 // progress within current writer
  const verifyN = Math.round(sub(p, R.verify[0], R.verify[1]) * VERIFY_CHECKS.length)
  const orch = p >= R.orch[0]

  // which phase are we in
  const phase: keyof typeof R =
    p < R.type[1] ? 'type'
      : p < R.extract[1] ? 'extract'
        : p < R.knowledge[1] ? 'knowledge'
          : p < R.risk[1] ? 'risk'
            : p < R.writers[1] ? 'writers'
              : p < R.verify[1] ? 'verify'
                : 'orch'

  // highlight an entity token once the extractor has reached it
  const entityRevealed = (entityIdx: number) => p >= R.extract[0] && entityIdx < extractN

  // build typed-note JSX with running entity index
  let cum = 0
  let eIdx = -1
  const noteNodes = TOKENS.map((tok, i) => {
    const text = typeof tok === 'string' ? tok : tok.t
    const start = cum
    cum += text.length
    const shown = Math.max(0, Math.min(text.length, charsShown - start))
    const slice = text.slice(0, shown)
    if (typeof tok === 'string') return <span key={i}>{slice}</span>
    eIdx += 1
    const myIdx = eIdx
    const lit = entityRevealed(myIdx)
    return (
      <span
        key={i}
        className="rounded px-0.5 transition-colors duration-300"
        style={{
          background: lit ? `${ETYPE_COLOR[tok.e]}26` : 'transparent',
          color: lit ? ETYPE_COLOR[tok.e] : undefined,
          boxShadow: lit ? `inset 0 -2px 0 ${ETYPE_COLOR[tok.e]}` : 'none',
        }}
      >
        {slice}
      </span>
    )
  })

  const captions: Record<keyof typeof R, string> = {
    type: 'A clinician writes a note. Synthure starts reading instantly.',
    extract: 'The NER agent scans the text and pulls out every clinical entity.',
    knowledge: 'The knowledge agent resolves each code against the medical knowledge base.',
    risk: 'Readmission is the CMS HRRP published rate; prior authorization is sourced from payer policy.',
    writers: `The ${STAKEHOLDERS[STAKEHOLDER_ORDER[activeWriter]].agent} writes the ${STAKEHOLDERS[STAKEHOLDER_ORDER[activeWriter]].label.toLowerCase()}’s report…`,
    verify: 'The Verifier audits every statement against the extracted facts.',
    orch: 'The Orchestrator ties all four tailored reports together.',
  }

  const STRIP = [
    { id: 'ner', label: 'NER', on: phase === 'extract', done: p >= R.extract[1], c: '#2dd4bf', Icon: ScanLine },
    { id: 'rag', label: 'Knowledge', on: phase === 'knowledge', done: p >= R.knowledge[1], c: '#818cf8', Icon: Database },
    { id: 'risk', label: 'Risk', on: phase === 'risk', done: p >= R.risk[1], c: '#fbbf24', Icon: Activity },
    { id: 'write', label: 'Writers', on: phase === 'writers', done: p >= R.writers[1], c: '#a78bfa', Icon: PenLine },
    { id: 'verify', label: 'Verify', on: phase === 'verify' || phase === 'orch', done: orch, c: '#34d399', Icon: ShieldCheck },
  ]

  return (
    <section ref={ref} id="how" className="relative" style={{ height: '600vh' }}>
      <div className="sticky top-0 h-screen flex flex-col overflow-hidden">
        <div className="pt-16 pb-2 text-center px-6">
          <div className="text-xs uppercase tracking-[0.22em] text-teal-400 mb-2">How it works</div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Watch the agents work. <span className="gradient-text">One note, four reports.</span>
          </h2>
        </div>

        {/* pipeline strip */}
        <div className="flex justify-center gap-1.5 sm:gap-2 px-4 mb-2 flex-wrap">
          {STRIP.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all duration-300"
              style={{
                borderColor: s.on || s.done ? `${s.c}66` : 'rgba(255,255,255,0.08)',
                background: s.on ? `${s.c}1f` : 'transparent',
                color: s.on || s.done ? s.c : '#64748b',
              }}
            >
              <s.Icon className="h-3 w-3" />
              {s.label}
              {s.done && <Check className="h-3 w-3" />}
            </div>
          ))}
        </div>

        {/* stage */}
        <div className="flex-1 w-full max-w-5xl mx-auto px-5 grid lg:grid-cols-2 gap-5 items-center min-h-0">
          {/* LEFT — the note being typed + highlighted */}
          <div className="relative rounded-2xl border border-white/[0.09] bg-[#0a1120] p-5 h-[300px] sm:h-[340px] overflow-hidden">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 border-b border-white/[0.06] pb-3">
              <FileText className="h-3.5 w-3.5" /> clinical_note.txt
              {phase === 'extract' && (
                <span className="ml-auto flex items-center gap-1 text-teal-400"><ScanLine className="h-3 w-3" /> scanning…</span>
              )}
            </div>
            <p className="font-mono text-[13px] sm:text-sm leading-7 text-slate-300">
              {noteNodes}
              {typing && <span className="inline-block w-1.5 h-4 -mb-0.5 bg-teal-400 animate-pulse" />}
            </p>

            {/* scan line sweep during extraction */}
            {phase === 'extract' && (
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 h-12 pointer-events-none"
                style={{ background: 'linear-gradient(180deg, transparent, rgba(45,212,191,0.12), transparent)' }}
                animate={{ top: ['18%', '85%', '18%'] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
              />
            )}
          </div>

          {/* RIGHT — the active agent's live work */}
          <div className="relative h-[300px] sm:h-[340px]">
            <AnimatePresence mode="popLayout">
              {/* EXTRACT: entity pills fly out */}
              {phase === 'extract' && (
                <motion.div key="extract" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <StageTitle color="#2dd4bf" Icon={ScanLine} title="NER Extractor" sub="pulling clinical entities" />
                  <div className="flex flex-wrap gap-2 content-start">
                    {ENTITIES.slice(0, extractN).map((e, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.6, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                        className="rounded-lg border px-2.5 py-1.5"
                        style={{ borderColor: `${ETYPE_COLOR[e.e]}55`, background: `${ETYPE_COLOR[e.e]}14` }}
                      >
                        <div className="text-[9px] tracking-wider" style={{ color: ETYPE_COLOR[e.e] }}>{ETYPE_LABEL[e.e]}</div>
                        <div className="text-sm text-white font-medium">{e.t}</div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* KNOWLEDGE: code resolutions */}
              {phase === 'knowledge' && (
                <motion.div key="knowledge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <StageTitle color="#818cf8" Icon={Database} title="Knowledge Retrieval" sub="resolving codes → guidelines" />
                  <div className="space-y-2.5">
                    {CODE_RESOLVE.slice(0, knowledgeN).map((c, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 rounded-lg border border-indigo-400/25 bg-indigo-400/5 px-3 py-2.5"
                      >
                        <span className="font-mono text-sm text-indigo-300">{c.code}</span>
                        <span className="text-slate-600">→</span>
                        <span className="text-sm text-slate-200">{c.label}</span>
                        <Check className="ml-auto h-4 w-4 text-emerald-400" />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* RISK: gauges */}
              {phase === 'risk' && (
                <motion.div key="risk" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <StageTitle color="#fbbf24" Icon={Activity} title="Risk & Readiness" sub="CMS readmission · prior auth" />
                  <div className="space-y-5 mt-2">
                    <Gauge label="Claim review load" value={reviewFill} color="#fbbf24" />
                    <Gauge label="Readmission (CMS HRRP)" value={readmitFill} color="#22d3ee" />
                  </div>
                </motion.div>
              )}

              {/* WRITERS: the active agent typing a report */}
              {phase === 'writers' && (
                <motion.div key="writers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                  {(() => {
                    const s = STAKEHOLDER_ORDER[activeWriter]
                    const c = STAKEHOLDERS[s]
                    const lines = WRITER_LINES[s]
                    const linesShown = Math.max(1, Math.ceil(writerLineP * lines.length))
                    return (
                      <>
                        <StageTitle color={c.accent} Icon={PenLine} title={c.agent} sub={`writing the ${c.label.toLowerCase()} report`} />
                        <div className="rounded-xl border p-4 flex-1" style={{ borderColor: `${c.accent}44`, background: `${c.accent}0a` }}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg" style={{ color: c.accent }}>{c.glyph}</span>
                            <span className="text-sm font-semibold text-white">{c.label}</span>
                          </div>
                          <div className="space-y-2">
                            {lines.slice(0, linesShown).map((ln, i) => (
                              <motion.p
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-[13px] text-slate-300 leading-relaxed"
                              >
                                {ln}
                                {i === linesShown - 1 && <span className="inline-block w-1.5 h-3.5 -mb-0.5 ml-0.5 animate-pulse" style={{ background: c.accent }} />}
                              </motion.p>
                            ))}
                          </div>
                        </div>
                      </>
                    )
                  })()}
                  {/* progress dots for the four writers */}
                  <div className="flex gap-2 mt-3">
                    {STAKEHOLDER_ORDER.map((s, i) => {
                      const c = STAKEHOLDERS[s]
                      const done = i < activeWriter
                      const on = i === activeWriter
                      return (
                        <div key={s} className="flex-1 rounded-lg border px-2 py-1.5 flex items-center gap-1.5"
                          style={{ borderColor: done || on ? `${c.accent}66` : 'rgba(255,255,255,0.07)', background: on ? `${c.accent}14` : 'transparent' }}>
                          <span style={{ color: done || on ? c.accent : '#475569' }}>{c.glyph}</span>
                          <span className="text-[10px]" style={{ color: done || on ? '#e2e8f0' : '#475569' }}>{c.label}</span>
                          {done && <Check className="ml-auto h-3 w-3 text-emerald-400" />}
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}

              {/* VERIFY */}
              {phase === 'verify' && (
                <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <StageTitle color="#34d399" Icon={ShieldCheck} title="Verifier" sub="auditing against the facts" />
                  <div className="space-y-2">
                    {VERIFY_CHECKS.slice(0, verifyN).map((ck, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5">
                        <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-[13px] text-slate-300">{ck}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ORCHESTRATE */}
              {phase === 'orch' && (
                <motion.div key="orch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <StageTitle color="#fbbf24" Icon={ShieldCheck} title="Orchestrator" sub="tailored across all four" />
                  <div className="grid grid-cols-2 gap-2.5">
                    {STAKEHOLDER_ORDER.map((s, i) => {
                      const c = STAKEHOLDERS[s]
                      return (
                        <motion.div key={s} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                          className="rounded-xl border p-3" style={{ borderColor: `${c.accent}55`, background: `${c.accent}0d` }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <span style={{ color: c.accent }}>{c.glyph}</span>
                            <span className="text-xs font-semibold text-white">{c.label}</span>
                            <Check className="ml-auto h-3.5 w-3.5 text-emerald-400" />
                          </div>
                          <div className="h-1 rounded-full" style={{ width: '85%', background: `${c.accent}66` }} />
                        </motion.div>
                      )
                    })}
                  </div>
                  <div className="mt-3 text-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-xs text-emerald-300">
                    4 reports verified and cross tailored
                  </div>
                </motion.div>
              )}

              {/* TYPE phase placeholder */}
              {phase === 'type' && (
                <motion.div key="type" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.6 }}
                      className="mx-auto mb-3 h-16 w-16 rounded-2xl border border-teal-400/40 bg-[#0a1120] flex items-center justify-center text-2xl gradient-text font-bold">◈</motion.div>
                    <div className="text-sm text-slate-400">Synthure is reading the note…</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* caption + progress */}
        <div className="pb-10 px-6">
          <div className="max-w-2xl mx-auto text-center min-h-[2.5rem]">
            <AnimatePresence mode="wait">
              <motion.p key={phase === 'writers' ? `w${activeWriter}` : phase}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="text-slate-300 text-sm sm:text-base">
                {captions[phase]}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="mt-4 mx-auto max-w-xs h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-indigo-400" style={{ width: `${Math.round(p * 100)}%` }} />
          </div>
          <AnimatePresence>
            {p < 0.02 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                <span>scroll to watch the agents work</span>
                <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function StageTitle({ color, Icon, title, sub }: { color: string; Icon: typeof Database; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1f`, color }}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-sm font-semibold text-white leading-tight">{title}</div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}
