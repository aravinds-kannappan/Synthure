'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Building2, Check, Loader2, Circle, TrendingUp, FileText, Send } from 'lucide-react'
import type { StakeholderReport } from '@/lib/synthure'
import { fmt$ } from '@/lib/engine'
import { useEncounter } from './EncounterContext'
import { Gauge, ReportDrawer, ChecksPanel } from './widgets'
import Inbox from './Inbox'

const ACCENT = '#22d3ee'
const riskColor = (r: number) => (r >= 55 ? '#f87171' : r >= 35 ? '#fbbf24' : '#34d399')

export default function RevenueDashboard({ report }: { report?: StakeholderReport }) {
  const { state, d, dispatch } = useEncounter()
  const procedures = state.procedures.filter((p) => p.accepted)
  const dxCodes = state.diagnoses.filter((x) => x.accepted).map((x) => x.code)
  const submitted = state.claimStatus === 'submitted' || state.claimStatus === 'reimbursed'


  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-[#08111a]/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${ACCENT}22` }}>
            <Building2 className="h-4 w-4" style={{ color: ACCENT }} />
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Revenue Cycle</div>
            <div className="text-[11px] text-slate-500">Claim operations · prior authorization & readiness</div>
          </div>
        </div>
        <span className="rounded-md px-2.5 py-1 font-mono text-[11px]" style={{ background: `${ACCENT}14`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
          {d.route === 'frontier' ? 'FRONTIER ADJUDICATION' : 'STANDARD ADJUDICATION'}
        </span>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Kpi label="CMS allowed" value={d.allowed ? fmt$(d.allowed) : '$0'} tone="neutral" />
          <Kpi label="Expected reimb." value={fmt$(d.expectedReimb)} tone="good" icon={<TrendingUp className="h-3.5 w-3.5" />} />
          <Kpi label="At risk" value={d.atRisk ? fmt$(d.atRisk) : '$0'} tone={d.atRisk ? 'warn' : 'neutral'} />
          <Kpi label="Linked Dx" value={String(dxCodes.length)} tone="neutral" />
        </div>

        {/* Claim pipeline + submit */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Claim status</div>
            <button
              onClick={() => dispatch({ type: 'submitClaim' })}
              disabled={submitted}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-100"
              style={{ background: submitted ? '#0e2a2f' : ACCENT, color: submitted ? ACCENT : '#05070f' }}
            >
              {submitted ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {submitted ? 'Submitted to payer' : 'Submit claim'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {d.pipeline.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-1.5">
                <div
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]"
                  style={{
                    borderColor: stage.state === 'todo' ? 'rgba(255,255,255,0.08)' : `${ACCENT}40`,
                    background: stage.state === 'active' ? `${ACCENT}14` : 'transparent',
                    color: stage.state === 'todo' ? '#64748b' : '#e2e8f0',
                  }}
                >
                  {stage.state === 'done' ? (
                    <Check className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                  ) : stage.state === 'active' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: ACCENT }} />
                  ) : (
                    <Circle className="h-3 w-3 text-slate-600" />
                  )}
                  {stage.label}
                </div>
                {i < d.pipeline.length - 1 && <span className="text-slate-700">→</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {report?.summary && <p className="text-sm leading-relaxed text-slate-400">{report.summary}</p>}

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <FileText className="h-4 w-4" style={{ color: ACCENT }} /> Claim line items
              </div>
              {d.services.length ? (
                d.services.map((p) => (
                  <div key={p.code} className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2.5 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-cyan-300">{p.code}</span>
                      <span className="text-[13px] text-slate-300">{p.label}</span>
                      {p.atRisk && (
                        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300" title={p.atRiskWhy ?? ''}>at risk</span>
                      )}
                    </div>
                    <span className="font-mono text-[13px] text-slate-200">{p.price != null ? fmt$(p.price) : 'no CMS amount'}</span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-3 text-[13px] text-slate-500">No procedure lines. Office visit billing applies.</div>
              )}
              {dxCodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 text-[12px] text-slate-500">
                  Linked Dx:
                  {dxCodes.map((c) => (
                    <span key={c} className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-cyan-300/80">{c}</span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Claim readiness checklist</div>
              <ChecksPanel checks={d.checks} accent={ACCENT} />
            </div>

            {report?.actions && report.actions.length > 0 && (
              <div className="rounded-xl border p-4" style={{ borderColor: `${ACCENT}33`, background: `${ACCENT}0d` }}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: ACCENT }}>Agent actions</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {report.actions.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px] text-slate-300">
                      <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: ACCENT }} /> {a}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Inbox portal="hospital" accent={ACCENT} />
            <ReportDrawer sections={report?.sections ?? []} accent={ACCENT} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 text-center">
              <Gauge value={d.reviewRisk} color={riskColor(d.reviewRisk)} label="Review load" />
              <p className="mt-1 text-[11px] text-slate-500">
                {state.priorAuthApproved ? 'Prior auth on file, review load reduced.' : d.reviewRisk >= 45 ? 'Front load authorization and documentation.' : 'Clean claim, standard turnaround expected.'}
              </p>
            </motion.div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 text-center">
              <Gauge value={d.readmissionRisk} color={riskColor(d.readmissionRisk)} label="Readmission · CMS HRRP" />
              <p className="mt-1 text-[11px] text-slate-500">
                {d.readmissionCalibrated ? `CMS published rate for the ${d.readmissionDriver} cohort.` : 'National hospital wide published rate; no condition cohort matched.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: 'good' | 'neutral' | 'warn'; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 text-lg font-semibold ${tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-white'}`}>
        {icon}
        {value}
      </div>
    </div>
  )
}
