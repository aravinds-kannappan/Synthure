'use client'

import { motion } from 'framer-motion'
import {
  ShieldCheck, AlertTriangle, Check, Ban, ArrowRight, Scale,
  FileSearch, Sparkles, UserCheck, Bot, BookOpen,
} from 'lucide-react'
import type { SafetyResult } from '@/lib/synthure'

const ACCENT = '#fb7185'

// The inference time alignment flow, drawn as a small pipeline.
const FLOW = [
  { id: 'gen', label: 'Generate', icon: Bot, color: '#818cf8' },
  { id: 'critique', label: 'Critique', icon: FileSearch, color: '#fb7185' },
  { id: 'revise', label: 'Revise', icon: Sparkles, color: '#f43f5e' },
  { id: 'gate', label: 'Autonomy gate', icon: Scale, color: '#f59e0b' },
]

const REFERENCES = [
  'Constitutional AI: Harmlessness from AI Feedback, Bai et al. 2022',
  'Training language models to follow instructions with human feedback (InstructGPT / RLHF), Ouyang et al. 2022',
  'AI Safety via Debate, Irving et al. 2018',
  'Red Teaming Language Models to Reduce Harms, Ganguli et al. 2022',
  "Let's Verify Step by Step (process supervision), Lightman et al. 2023",
  'Selective Prediction (Selective Classification with a Reject Option), Geifman and El-Yaniv 2017',
]

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-center">
      <div className="text-xl font-bold" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  )
}

const TIERS = [
  { tier: 1, label: 'Tier 1 · Automated', color: '#34d399', decision: 'auto' as const },
  { tier: 2, label: 'Tier 2 · Human approval', color: '#f59e0b', decision: 'human approval' as const },
  { tier: 3, label: 'Tier 3 · Prohibited', color: '#f43f5e', decision: 'prohibited' as const },
]

export default function SafetyConsole({ safety, live }: { safety: SafetyResult; live: boolean | null }) {
  const clean = safety.caughtViolations === 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-rose-400/20 bg-[#0c0810]/80"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${ACCENT}22` }}>
            <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} />
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Alignment & Safety layer</div>
            <div className="text-[11px] text-slate-500">Inference time safeguards from the alignment literature</div>
          </div>
        </div>
        <span
          className="rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
          style={{ background: `${ACCENT}14`, color: ACCENT, border: `1px solid ${ACCENT}33` }}
        >
          {safety.mode === 'claude assisted' ? 'Claude critic + rules' : 'deterministic rules'}
        </span>
      </div>

      <div className="space-y-6 p-5">
        {/* Alignment flow diagram */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
          <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">The alignment pass</div>
          <div className="flex items-center justify-between gap-1 overflow-x-auto">
            {FLOW.map((step, i) => (
              <div key={step.id} className="flex items-center gap-1">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * i }}
                  className="flex min-w-[88px] flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5"
                  style={{ borderColor: `${step.color}33`, background: `${step.color}0d` }}
                >
                  <step.icon className="h-4 w-4" style={{ color: step.color }} />
                  <span className="text-[11px] font-medium text-slate-200">{step.label}</span>
                </motion.div>
                {i < FLOW.length - 1 && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />}
              </div>
            ))}
            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
            <div
              className="flex min-w-[88px] flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5"
              style={{ borderColor: clean ? '#34d39933' : '#f59e0b33', background: clean ? '#34d3990d' : '#f59e0b0d' }}
            >
              {clean ? <Check className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <span className="text-[11px] font-medium text-slate-200">{clean ? 'Cleared' : 'Revised'}</span>
            </div>
          </div>
        </div>

        {/* Scorecard */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={`${safety.passed}/${safety.total}`} label="Principles passed" tone={safety.passed === safety.total ? '#34d399' : '#f59e0b'} />
          <Stat value={String(safety.caughtViolations)} label="Violations caught" tone={clean ? '#34d399' : '#fb7185'} />
          <Stat value={safety.abstained ? 'Escalated' : 'Proceed'} label="Selective prediction" tone={safety.abstained ? '#f59e0b' : '#34d399'} />
          <Stat value="3" label="Autonomy tiers" tone="#818cf8" />
        </div>

        {/* Constitution checklist */}
        <div>
          <div className="mb-2.5 text-[11px] uppercase tracking-wider text-slate-500">Clinical constitution</div>
          <div className="space-y-2">
            {safety.constitution.map((c) => (
              <div key={c.id} className="flex gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
                <span className="mt-0.5 flex-shrink-0">
                  {c.status === 'pass'
                    ? <Check className="h-4 w-4 text-emerald-400" />
                    : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] text-slate-200">{c.principle}</div>
                  <div className="text-[11px] text-slate-500">{c.detail}</div>
                  <div className="mt-0.5 text-[10px] italic text-slate-600">{c.basis}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Critique and revision */}
        <div>
          <div className="mb-2.5 text-[11px] uppercase tracking-wider text-slate-500">Critique and revise</div>
          {clean ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-[13px] text-emerald-200">
              <Check className="h-4 w-4 flex-shrink-0" /> The critic found no constitution violations. No revision was needed.
            </div>
          ) : (
            <div className="space-y-2">
              {safety.critiques.map((cr, i) => (
                <div key={i} className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: '#f43f5e22', color: '#fb7185' }}>{cr.severity}</span>
                    <span className="text-slate-300">{cr.target}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">{cr.action}</span>
                  </div>
                  <div className="mt-1 text-[13px] text-slate-300">{cr.issue}</div>
                </div>
              ))}
              {safety.revision && (
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-3 py-2.5">
                  <div className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Revision</div>
                  <div className="text-[13px] text-rose-300/80 line-through">{safety.revision.before}</div>
                  <div className="text-[13px] text-emerald-300">{safety.revision.after}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{safety.revision.note}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selective prediction / escalation */}
        {safety.abstained && safety.abstainReason && (
          <div className="flex gap-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-3">
            <UserCheck className="h-4 w-4 flex-shrink-0 text-amber-400" />
            <div>
              <div className="text-[13px] font-medium text-amber-200">Abstained and escalated to a human</div>
              <div className="text-[12px] text-slate-400">{safety.abstainReason}</div>
              <div className="mt-0.5 text-[10px] italic text-slate-600">Selective prediction, Geifman and El-Yaniv 2017</div>
            </div>
          </div>
        )}

        {/* Autonomy gate */}
        <div>
          <div className="mb-2.5 text-[11px] uppercase tracking-wider text-slate-500">Autonomy gate</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const actions = safety.autonomy.filter((a) => a.decision === t.decision)
              return (
                <div key={t.tier} className="rounded-xl border bg-white/[0.015] p-3" style={{ borderColor: `${t.color}2e` }}>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: t.color }}>
                    {t.tier === 3 ? <Ban className="h-3.5 w-3.5" /> : t.tier === 2 ? <UserCheck className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    {t.label}
                  </div>
                  <ul className="space-y-1.5">
                    {actions.map((a, i) => (
                      <li key={i} className="flex gap-1.5 text-[12px] text-slate-300">
                        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className={t.tier === 3 ? 'text-slate-500 line-through' : ''}>{a.action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Tier 3 actions are a design prohibition, never generated. Clinical decisions stay with the physician.
          </p>
        </div>

        {/* References */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            <BookOpen className="h-3.5 w-3.5" /> Research this layer draws on
          </div>
          <ul className="space-y-1">
            {REFERENCES.map((r, i) => (
              <li key={i} className="text-[11px] text-slate-500">{r}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            These are inference time mechanisms from this research. Synthure does not train a reward model; the writer
            agents run on Claude, which Anthropic aligned with RLHF, and this layer adds a constitution, a critique and
            revise pass, an autonomy gate, and selective prediction on top. {live === false && 'Offline, the critic runs as deterministic rule checks.'}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
