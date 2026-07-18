'use client'

import { motion } from 'framer-motion'
import { Cpu, ShieldCheck, ShieldX, UserCheck, HelpCircle, GitCompareArrows, ScanSearch, Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { HarnessReport } from '@/lib/harness'

const ACTION: Record<HarnessReport['action'], { label: string; color: string; icon: typeof Cpu }> = {
  auto: { label: 'Automated', color: '#34d399', icon: Cpu },
  human_review: { label: 'Human review', color: '#a78bfa', icon: UserCheck },
  abstain: { label: 'Abstained', color: '#fbbf24', icon: HelpCircle },
  block: { label: 'Blocked', color: '#f87171', icon: ShieldX },
}
const RISK: Record<HarnessReport['riskTier'], string> = { low: '#34d399', elevated: '#fbbf24', high: '#f87171' }

// The agent harness verdict: the seven safety mechanisms folded into one
// decision. This is the scaffolding the blog calls the moat: everything around
// the model that decides whether its output can be trusted, revised, or must go
// to a human.
export default function HarnessPanel({ report }: { report: HarnessReport }) {
  const a = ACTION[report.action]
  const AIcon = a.icon

  const mechanisms: { icon: typeof Cpu; label: string; ok: boolean; detail: string }[] = [
    { icon: ScanSearch, label: 'Retrieval only', ok: report.retrievalOnly.enforced, detail: report.retrievalOnly.detail },
    { icon: HelpCircle, label: 'Confidence abstention', ok: !report.abstain.should, detail: report.abstain.should ? (report.abstain.reason ?? 'Abstaining.') : 'Confidence and agreement are above the abstention thresholds.' },
    { icon: ShieldCheck, label: 'Policy engine', ok: report.action !== 'block', detail: report.action === 'block' ? 'A blocking policy violation stopped the output.' : 'No blocking policy violation.' },
    { icon: AlertTriangle, label: 'Adversarial input', ok: !report.input.findings.some((f) => f.severity === 'block' || f.id === 'input.injection'), detail: report.input.findings.length ? report.input.findings.map((f) => f.id).join(', ') : 'No injection or malformed input detected.' },
    { icon: GitCompareArrows, label: 'Model agreement', ok: report.agreement.available ? report.agreement.findings.length === 0 : true, detail: report.agreement.detail },
    { icon: Lock, label: 'Immutable audit', ok: true, detail: 'This run is sealed into the hash chained audit log.' },
    { icon: UserCheck, label: 'Human in the loop', ok: !report.hitl.required, detail: report.hitl.required ? (report.hitl.reason ?? 'Routed to a human.') : 'No human sign-off required for this run.' },
  ]

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#080d18]/80">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${a.color}22` }}>
          <AIcon className="h-4 w-4" style={{ color: a.color }} />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">Agent harness</div>
          <div className="text-[11px] text-slate-500">Seven safety mechanisms, one decision</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ background: `${a.color}18`, color: a.color, border: `1px solid ${a.color}44` }}>{a.label}</span>
          <span className="rounded-md px-2.5 py-1 text-[11px] font-medium" style={{ background: `${RISK[report.riskTier]}14`, color: RISK[report.riskTier], border: `1px solid ${RISK[report.riskTier]}33` }}>{report.riskTier} risk</span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Prominent banner for abstain / block / human review */}
        {(report.abstain.should || report.action === 'block' || report.hitl.required) && (
          <div className="flex items-start gap-2.5 rounded-xl border px-4 py-3" style={{ borderColor: `${a.color}44`, background: `${a.color}0d` }}>
            <AIcon className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: a.color }} />
            <div className="text-[13px] leading-relaxed" style={{ color: a.color }}>
              {report.action === 'block' ? report.summary : report.abstain.should ? report.abstain.reason : report.hitl.reason}
            </div>
          </div>
        )}

        {/* The seven mechanisms */}
        <div className="grid gap-2 sm:grid-cols-2">
          {mechanisms.map((m) => {
            const MIcon = m.icon
            return (
              <motion.div key={m.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border px-3 py-2.5" style={{ borderColor: m.ok ? 'rgba(52,211,153,0.2)' : 'rgba(251,146,60,0.35)', background: m.ok ? 'rgba(52,211,153,0.04)' : 'rgba(251,146,60,0.06)' }}>
                <div className="flex items-center gap-1.5">
                  <MIcon className="h-3.5 w-3.5" style={{ color: m.ok ? '#34d399' : '#fb923c' }} />
                  <span className="text-[12px] font-medium text-slate-200">{m.label}</span>
                  {m.ok ? <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="ml-auto h-3.5 w-3.5 text-amber-400" />}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-slate-400">{m.detail}</div>
              </motion.div>
            )
          })}
        </div>

        {/* Model agreement detail */}
        {report.agreement.available && report.agreement.findings.length > 0 && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300"><GitCompareArrows className="h-3.5 w-3.5" /> Coder disagreement</div>
            {report.agreement.findings.map((f) => (
              <div key={f.id} className="text-[12px] leading-relaxed text-slate-300">
                {f.detail} <span className="font-mono text-amber-200/80">{f.codes.join(', ')}</span>
              </div>
            ))}
          </div>
        )}

        {report.reasons.length > 0 && (
          <div className="text-[11px] leading-relaxed text-slate-500">
            <span className="uppercase tracking-wider text-slate-600">Why: </span>
            {report.reasons.join('; ')}.
          </div>
        )}
      </div>
    </div>
  )
}
