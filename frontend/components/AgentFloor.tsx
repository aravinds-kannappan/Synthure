'use client'

// ── The agent floor ──────────────────────────────────────────────────────────
// A self-running showcase where the ten pipeline agents visibly act on a
// rotating clinical note. The Synthure trained models (note type, sections,
// missing info, readiness) run LIVE in the browser from their exported JSON, so
// what you see is real model output, not a scripted animation. OpenMed and the
// Claude writer stages are depicted (they need a model download / API key that a
// landing page should not trigger), and are labeled as such.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, ScanLine, FileType2, ListTree, Boxes, AlertTriangle,
  Gauge, Sigma, UserCheck, LayoutGrid, Cpu, Sparkles,
} from 'lucide-react'
import { classifyNoteType, detectMissing, predictReadiness } from '@/lib/models/synthure'
import { parseSections } from '@/lib/models/sections'
import { NOTE_TYPE_LABELS } from '@/lib/schema'

type Owner = 'OpenMed' | 'Synthure' | 'rule' | 'Claude'
const OWNER_STYLE: Record<Owner, string> = {
  OpenMed: 'border-cyan-400/40 text-cyan-300 bg-cyan-400/10',
  Synthure: 'border-teal-400/40 text-teal-300 bg-teal-400/10',
  rule: 'border-slate-400/40 text-slate-300 bg-slate-400/10',
  Claude: 'border-violet-400/40 text-violet-300 bg-violet-400/10',
}
const OWNER_LABEL: Record<Owner, string> = { OpenMed: 'OpenMed', Synthure: 'Synthure trained', rule: 'rule based', Claude: 'Claude (narration)' }

// Rotating notes. deid/entities/code are display metadata; note type, sections,
// missing info, and readiness are computed live from the trained models below.
const SAMPLES = [
  {
    title: 'Emergency note',
    raw: '62yo F. Chief complaint: substernal chest pressure, diaphoresis. HPI: onset acute. Medical decision making: NSTEMI, type 2 diabetes. Started aspirin 325mg, heparin, atorvastatin.',
    redactions: ['age'],
    entities: [
      { t: 'chest pressure', k: 'sx' }, { t: 'diaphoresis', k: 'sx' },
      { t: 'NSTEMI', k: 'dx' }, { t: 'type 2 diabetes', k: 'dx' },
      { t: 'aspirin', k: 'rx' }, { t: 'heparin', k: 'rx' }, { t: 'atorvastatin', k: 'rx' },
    ],
    codes: ['I21.4', 'E11.9'],
    nDx: 2, nProc: 1,
  },
  {
    title: 'SOAP note',
    raw: 'S: Reports headache, dizziness. O: Vitals stable. Labs: A1C, LDL. A: essential hypertension, mixed hyperlipidemia. P: Start lisinopril 10mg, atorvastatin 20mg.',
    redactions: [],
    entities: [
      { t: 'headache', k: 'sx' }, { t: 'dizziness', k: 'sx' },
      { t: 'hypertension', k: 'dx' }, { t: 'hyperlipidemia', k: 'dx' },
      { t: 'lisinopril', k: 'rx' }, { t: 'atorvastatin', k: 'rx' },
    ],
    codes: ['I10', 'E78.2'],
    nDx: 2, nProc: 1,
  },
  {
    title: 'Discharge summary',
    raw: 'Discharge diagnosis: COPD exacerbation, pneumonia. Hospital course: admitted with dyspnea and productive cough, treated and improved. Discharge medications: albuterol, azithromycin, prednisone. Disposition: home.',
    redactions: [],
    entities: [
      { t: 'COPD exacerbation', k: 'dx' }, { t: 'pneumonia', k: 'dx' },
      { t: 'dyspnea', k: 'sx' }, { t: 'productive cough', k: 'sx' },
      { t: 'albuterol', k: 'rx' }, { t: 'azithromycin', k: 'rx' }, { t: 'prednisone', k: 'rx' },
    ],
    codes: ['J44.1', 'J18.9'],
    nDx: 2, nProc: 1,
  },
  {
    title: 'Referral',
    raw: 'Reason for referral: evaluation of knee osteoarthritis. History: symptoms include knee pain, stiffness. Request: please evaluate and advise. Ordered knee xray.',
    redactions: [],
    entities: [
      { t: 'knee osteoarthritis', k: 'dx' }, { t: 'knee pain', k: 'sx' }, { t: 'stiffness', k: 'sx' },
    ],
    codes: ['M17.9'],
    nDx: 1, nProc: 1,
  },
]

const ENT_COLOR: Record<string, string> = { dx: '#818cf8', rx: '#a78bfa', sx: '#2dd4bf' }

interface Agent {
  id: string
  name: string
  owner: Owner
  Icon: typeof Cpu
  blurb: string
}
const AGENTS: Agent[] = [
  { id: 'deid', name: 'De identification', owner: 'OpenMed', Icon: ShieldCheck, blurb: 'scrubs identifiers on device' },
  { id: 'ner', name: 'Biomedical NER', owner: 'OpenMed', Icon: ScanLine, blurb: 'extracts entities with confidences' },
  { id: 'notetype', name: 'Note type', owner: 'Synthure', Icon: FileType2, blurb: 'classifies the document' },
  { id: 'sections', name: 'Section parser', owner: 'rule', Icon: ListTree, blurb: 'spans clinical sections' },
  { id: 'coding', name: 'Code reranker', owner: 'Synthure', Icon: Boxes, blurb: 'ranks ICD candidates' },
  { id: 'missing', name: 'Missing info', owner: 'Synthure', Icon: AlertTriangle, blurb: 'flags absent documentation' },
  { id: 'readiness', name: 'Readiness', owner: 'Synthure', Icon: Gauge, blurb: 'scores claim readiness' },
  { id: 'calibration', name: 'Calibration', owner: 'Synthure', Icon: Sigma, blurb: 'calibrates and abstains' },
  { id: 'review', name: 'Human review', owner: 'rule', Icon: UserCheck, blurb: 'approval gate' },
  { id: 'portals', name: 'Portal outputs', owner: 'Claude', Icon: LayoutGrid, blurb: 'four narrated views' },
]

export default function AgentFloor() {
  const [sampleIdx, setSampleIdx] = useState(0)
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const sample = SAMPLES[sampleIdx]

  // Live trained-model inference on the current note.
  const pred = useMemo(() => {
    const nt = classifyNoteType(sample.raw)
    const sections = parseSections(sample.raw)
    const missing = detectMissing(sample.raw, nt.type, sample.nDx, sample.nProc).filter((m) => m.present)
    const readiness = predictReadiness(sample.raw, nt.type, sample.nDx, sample.nProc)
    return { nt, sections, missing, readiness }
  }, [sample])

  useEffect(() => {
    timer.current = setInterval(() => {
      setActive((a) => {
        if (a >= AGENTS.length - 1) {
          setSampleIdx((s) => (s + 1) % SAMPLES.length)
          return 0
        }
        return a + 1
      })
    }, 1300)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const activeId = AGENTS[active].id

  return (
    <section id="how" className="relative px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wider text-teal-300">
          <Sparkles className="h-4 w-4" /> Ten agents, trained to act
        </div>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">Watch the pipeline run itself</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-slate-400">
          One note flows through ten agents. The Synthure trained models below run live in your browser,
          so the note type, sections, missing information, and readiness you see are real model output, not
          a scripted animation.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Agent grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-2">
            {AGENTS.map((ag, i) => {
              const on = i === active
              const done = i < active
              return (
                <motion.button
                  key={ag.id}
                  onClick={() => setActive(i)}
                  animate={{
                    borderColor: on ? 'rgba(45,212,191,0.6)' : done ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                    backgroundColor: on ? 'rgba(45,212,191,0.06)' : 'rgba(255,255,255,0.015)',
                  }}
                  className="flex items-start gap-3 rounded-xl border p-3.5 text-left"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: on ? 'rgba(45,212,191,0.18)' : 'rgba(255,255,255,0.04)' }}
                  >
                    <ag.Icon className="h-4 w-4" style={{ color: on ? '#2dd4bf' : '#94a3b8' }} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold ${on ? 'text-white' : 'text-slate-300'}`}>{ag.name}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{ag.blurb}</div>
                    <span className={`mt-1.5 inline-block rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${OWNER_STYLE[ag.owner]}`}>
                      {OWNER_LABEL[ag.owner]}
                    </span>
                  </div>
                  {on && (
                    <motion.span layoutId="pulse" className="ml-auto mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-teal-400" />
                  )}
                </motion.button>
              )
            })}
          </div>

          {/* Live output panel */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a1120]/70 p-5 lg:sticky lg:top-24">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-slate-500">Now processing</span>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300">{sample.title}</span>
            </div>

            {/* The note with de-id + entity highlights */}
            <div className="mb-4 rounded-lg border border-white/[0.06] bg-[#070c18] p-3 text-[12px] leading-relaxed text-slate-300">
              <NoteView sample={sample} reveal={activeId} />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeId + sampleIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="min-h-[110px]"
              >
                <Output id={activeId} sample={sample} pred={pred} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

function NoteView({ sample, reveal }: { sample: (typeof SAMPLES)[number]; reveal: string }) {
  // Highlight entities once NER has run; show redaction chips after de-id.
  const showEnt = reveal !== 'deid'
  let text = sample.raw
  const chips: { t: string; k: string }[] = showEnt ? sample.entities : []
  return (
    <div>
      <p>
        {text.split(/(\s+)/).map((tok, i) => {
          const hit = chips.find((c) => tok.replace(/[^A-Za-z0-9]/g, '').toLowerCase().includes(c.t.split(' ')[0].toLowerCase()) && c.t.split(' ')[0].length > 2)
          if (hit) {
            return (
              <span key={i} className="rounded px-0.5" style={{ background: `${ENT_COLOR[hit.k]}22`, color: ENT_COLOR[hit.k] }}>
                {tok}
              </span>
            )
          }
          return <span key={i}>{tok}</span>
        })}
      </p>
      {reveal === 'deid' && sample.redactions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sample.redactions.map((r) => (
            <span key={r} className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-300">[{r.toUpperCase()}] scrubbed</span>
          ))}
        </div>
      )}
    </div>
  )
}

interface Pred {
  nt: { type: keyof typeof NOTE_TYPE_LABELS; confidence: number }
  sections: ReturnType<typeof parseSections>
  missing: { field: string; probability: number }[]
  readiness: { raw: number; calibrated: number; band: 'ready' | 'needs_work' | 'not_ready' }
}

function Output({ id, sample, pred }: { id: string; sample: (typeof SAMPLES)[number]; pred: Pred }) {
  const live = (
    <span className="ml-2 rounded bg-teal-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-teal-300">live model</span>
  )
  switch (id) {
    case 'deid':
      return <Line label="De identification (OpenMed, on device)">Identifiers replaced with typed placeholders before anything leaves the browser.</Line>
    case 'ner':
      return (
        <Line label="Biomedical NER (OpenMed, on device)">
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sample.entities.map((e, i) => (
              <span key={i} className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: `${ENT_COLOR[e.k]}1a`, color: ENT_COLOR[e.k] }}>{e.t}</span>
            ))}
          </div>
        </Line>
      )
    case 'notetype':
      return (
        <Line label={<>Note type classifier {live}</>}>
          <div className="mt-1 text-lg font-semibold text-white">{NOTE_TYPE_LABELS[pred.nt.type]}</div>
          <div className="text-[11px] text-slate-500">{Math.round(pred.nt.confidence * 100)}% confidence</div>
        </Line>
      )
    case 'sections':
      return (
        <Line label="Section parser (rule based)">
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pred.sections.map((s, i) => (
              <span key={i} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-slate-300">{s.label}</span>
            ))}
          </div>
        </Line>
      )
    case 'coding':
      return (
        <Line label="Code reranker (Synthure trained)">
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sample.codes.map((c) => (
              <span key={c} className="rounded bg-indigo-400/15 px-1.5 py-0.5 font-mono text-[12px] text-indigo-300">{c}</span>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">ranked from the official ICD 10 CM index; codes outside it are impossible</div>
        </Line>
      )
    case 'missing':
      return (
        <Line label={<>Missing information detector {live}</>}>
          {pred.missing.length ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {pred.missing.map((mm) => (
                <span key={mm.field} className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[11px] text-amber-300">{mm.field.replace(/_/g, ' ')} ({Math.round(mm.probability * 100)}%)</span>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[12px] text-emerald-300">No required fields flagged.</div>
          )}
        </Line>
      )
    case 'readiness':
      return (
        <Line label={<>Readiness predictor {live}</>}>
          <ReadinessGauge value={pred.readiness.calibrated} band={pred.readiness.band} />
        </Line>
      )
    case 'calibration':
      return (
        <Line label="Calibration and abstention (Synthure)">
          <div className="mt-1 text-[12px] text-slate-300">
            Raw score {Math.round(pred.readiness.raw * 100)}% calibrated to {Math.round(pred.readiness.calibrated * 100)}% (isotonic). Low confidence records abstain to human review.
          </div>
        </Line>
      )
    case 'review':
      return <Line label="Human review gate">A clinician approves or rejects the record before it is used. Nothing auto submits.</Line>
    case 'portals':
      return (
        <Line label="Portal outputs (Claude narrates the record)">
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {['Patient', 'Physician', 'Hospital', 'Employer'].map((p) => (
              <span key={p} className="rounded border border-violet-400/20 bg-violet-400/[0.06] px-2 py-1 text-[11px] text-violet-200">{p}</span>
            ))}
          </div>
        </Line>
      )
    default:
      return null
  }
}

function Line({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1.5 text-slate-300">{children}</div>
    </div>
  )
}

function ReadinessGauge({ value, band }: { value: number; band: string }) {
  const color = band === 'ready' ? '#34d399' : band === 'needs_work' ? '#fbbf24' : '#f87171'
  return (
    <div className="mt-1 flex items-center gap-3">
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <motion.circle
            cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 15}
            initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 15 * (1 - value) }}
            transition={{ duration: 0.8 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{Math.round(value * 100)}</span>
      </div>
      <div>
        <div className="text-sm font-semibold capitalize" style={{ color }}>{band.replace('_', ' ')}</div>
        <div className="text-[11px] text-slate-500">calibrated claim readiness</div>
      </div>
    </div>
  )
}
