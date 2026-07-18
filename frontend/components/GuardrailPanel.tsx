'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, CheckCircle2, Layers } from 'lucide-react'
import type { GuardrailReport, GuardSeverity, GuardLayer } from '@/lib/guardrails'

const DECISION: Record<GuardrailReport['decision'], { label: string; color: string; icon: typeof ShieldCheck }> = {
  ship: { label: 'Ship', color: '#34d399', icon: ShieldCheck },
  revise: { label: 'Revise', color: '#fbbf24', icon: ShieldAlert },
  escalate: { label: 'Escalate to human', color: '#a78bfa', icon: ShieldAlert },
  block: { label: 'Block', color: '#f87171', icon: ShieldX },
}
const SEV_COLOR: Record<GuardSeverity, string> = { blocking: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#94a3b8' }
const LAYER_ORDER: GuardLayer[] = ['input', 'grounding', 'policy', 'consistency', 'style', 'quality']
const LAYER_LABEL: Record<GuardLayer, string> = {
  input: 'Input', grounding: 'Grounding', policy: 'Policy', consistency: 'Consistency', style: 'Style', quality: 'Quality',
}

// Observability for the guardrail layer: a per run, per layer verdict with a
// score and a ship / revise / block / escalate decision. Deterministic, so it
// holds with or without an API key, and it is the thing that answers "is this
// output actually right and safe" beyond a single LLM opinion.
export default function GuardrailPanel({ report }: { report: GuardrailReport }) {
  const d = DECISION[report.decision]
  const DIcon = d.icon
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#080d18]/80">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${d.color}22` }}>
          <DIcon className="h-4 w-4" style={{ color: d.color }} />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">Guardrails</div>
          <div className="text-[11px] text-slate-500">Deterministic, layered output verification</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}44` }}>
            {d.label}
          </span>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums" style={{ color: d.color }}>{Math.round(report.score * 100)}%</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">safety score</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-[13px] leading-relaxed text-slate-400">{report.summary}</p>

        {/* Per layer pass/flag */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
            <Layers className="h-3.5 w-3.5" /> Layers
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {LAYER_ORDER.map((l) => {
              const s = report.byLayer[l]
              const clean = s.flag === 0
              return (
                <div key={l} className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: clean ? 'rgba(52,211,153,0.25)' : 'rgba(251,146,60,0.35)', background: clean ? 'rgba(52,211,153,0.05)' : 'rgba(251,146,60,0.06)' }}>
                  <div className="text-[11px] font-medium text-slate-300">{LAYER_LABEL[l]}</div>
                  <div className="mt-0.5 text-[11px]" style={{ color: clean ? '#34d399' : '#fb923c' }}>
                    {clean ? `${s.pass} pass` : `${s.flag} flagged`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Findings */}
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">
            {report.flagged.length ? `${report.flagged.length} finding${report.flagged.length === 1 ? '' : 's'}` : 'No findings'}
          </div>
          {report.flagged.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2.5 text-[13px] text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Every layer passed. Nothing was flagged in this run.
            </div>
          ) : (
            <div className="space-y-1.5">
              {report.flagged.map((f, i) => (
                <motion.div
                  key={f.id + i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-lg border px-3 py-2.5"
                  style={{ borderColor: `${SEV_COLOR[f.severity]}44`, background: `${SEV_COLOR[f.severity]}0d` }}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <AlertTriangle className="h-3.5 w-3.5" style={{ color: SEV_COLOR[f.severity] }} />
                    <span className="font-mono text-slate-400">{f.id}</span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: `${SEV_COLOR[f.severity]}22`, color: SEV_COLOR[f.severity] }}>{f.severity}</span>
                    <span className="text-slate-500">target: {f.target}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-600">{f.layer}</span>
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-slate-300">{f.detail}</div>
                  {f.evidence && f.evidence.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {f.evidence.slice(0, 6).map((e, j) => (
                        <span key={j} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{e}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] leading-relaxed text-slate-600">
          Layers run in process, with no API call: input (injection), grounding (codes, numbers, billability), policy (denial probability, prescribing, aggregate privacy, labeled costs), consistency, style, and quality. Blocking findings stop a report from shipping; high and medium findings feed the revision pass.
        </p>
      </div>
    </div>
  )
}
