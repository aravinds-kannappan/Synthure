'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react'
import {
  STAKEHOLDERS,
  STAKEHOLDER_ORDER,
  type ReportMetric,
  type Stakeholder,
  type StakeholderReport,
  type Synthesis,
  type Verification,
} from '@/lib/synthure'

const toneColor: Record<NonNullable<ReportMetric['tone']>, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-rose-400',
  neutral: 'text-slate-200',
}

function Metric({ m }: { m: ReportMetric }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{m.label}</div>
      <div className={`text-lg font-semibold ${toneColor[m.tone ?? 'neutral']}`}>{m.value}</div>
    </div>
  )
}

function ReportBody({ report }: { report: StakeholderReport }) {
  const cfg = STAKEHOLDERS[report.stakeholder]
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 text-xs font-medium mb-2" style={{ color: cfg.accent }}>
          <Sparkles className="h-3.5 w-3.5" /> {cfg.agent}
        </div>
        <h3 className="text-2xl font-semibold text-white">{report.headline}</h3>
        <p className="text-slate-400 mt-2 leading-relaxed">{report.summary}</p>
      </div>

      {report.metrics?.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {report.metrics.map((m, i) => (
            <Metric key={i} m={m} />
          ))}
        </div>
      )}

      <div className="space-y-4">
        {report.sections.map((sec, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
            <h4 className="text-sm font-semibold text-white mb-2">{sec.heading}</h4>
            <p className="text-sm text-slate-400 leading-relaxed">{sec.body}</p>
            {sec.bullets && sec.bullets.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0" style={{ background: cfg.accent }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {report.actions?.length > 0 && (
        <div className="rounded-xl border p-5" style={{ borderColor: `${cfg.accent}33`, background: `${cfg.accent}0d` }}>
          <div className="text-xs uppercase tracking-wider mb-3 font-medium" style={{ color: cfg.accent }}>
            Agent actions
          </div>
          <div className="space-y-2">
            {report.actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: cfg.accent }} />
                {a}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function ReportView({
  reports,
  verification,
  synthesis,
}: {
  reports: Partial<Record<Stakeholder, StakeholderReport>>
  verification: Verification | null
  synthesis: Synthesis | null
}) {
  const available = STAKEHOLDER_ORDER.filter((s) => reports[s])
  const [active, setActive] = useState<Stakeholder>(available[0] ?? 'patient')
  const current = reports[active]
  const cfg = STAKEHOLDERS[active]

  return (
    <div className="space-y-6">
      {/* Orchestrator synthesis ribbon */}
      {synthesis && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-400/25 p-6"
          style={{ background: 'linear-gradient(120deg, rgba(251,191,36,0.07), rgba(167,139,250,0.06))' }}
        >
          <div className="flex items-center gap-2 text-amber-300 text-xs font-medium uppercase tracking-wider mb-3">
            <Sparkles className="h-4 w-4" /> Orchestrator, tailored across all four reports
          </div>
          <p className="text-slate-200 leading-relaxed mb-4">{synthesis.summary}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {synthesis.connections.map((c, i) => (
              <div key={i} className="flex gap-2 text-sm text-slate-400 rounded-lg bg-white/[0.02] border border-white/[0.05] p-3">
                <ArrowRight className="h-4 w-4 text-amber-400/70 flex-shrink-0 mt-0.5" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Verification badge */}
      {verification && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5"
        >
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-2 text-emerald-300 font-medium text-sm">
              <ShieldCheck className="h-4 w-4" /> Verifier
            </div>
            <span className="text-xs text-slate-400">
              {verification.sourcesChecked} sources checked · {Math.round(verification.confidence * 100)}% confidence
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {verification.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {c.status === 'pass' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                )}
                <span className="text-slate-300">
                  <span className="text-slate-200">{c.label}.</span>{' '}
                  <span className="text-slate-500">{c.note}</span>
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stakeholder tabs */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#0a1120]/70 overflow-hidden">
        <div className="flex border-b border-white/[0.06] overflow-x-auto">
          {available.map((s) => {
            const c = STAKEHOLDERS[s]
            const on = s === active
            return (
              <button
                key={s}
                onClick={() => setActive(s)}
                className="relative flex items-center gap-2 px-5 py-4 text-sm font-medium whitespace-nowrap transition-colors"
                style={{ color: on ? c.accent : '#94a3b8' }}
              >
                <span className="text-base">{c.glyph}</span>
                {c.label}
                {on && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute bottom-0 inset-x-3 h-0.5 rounded-full"
                    style={{ background: c.accent }}
                  />
                )}
              </button>
            )
          })}
        </div>
        <div className="p-6 sm:p-8" style={{ background: `radial-gradient(120% 100% at 0% 0%, ${cfg.accent}0a, transparent 60%)` }}>
          <AnimatePresence mode="wait">
            {current ? (
              <ReportBody key={active} report={current} />
            ) : (
              <div key="empty" className="text-slate-500 text-sm py-10 text-center">Report pending…</div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
