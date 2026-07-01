'use client'

import { motion } from 'framer-motion'
import {
  Stethoscope, Check, FileCheck2, ClipboardList, ShieldCheck, Zap, Plus,
} from 'lucide-react'
import type { StakeholderReport } from '@/lib/synthure'
import { useEncounter } from './EncounterContext'
import { Gauge, ReportDrawer, ChecksPanel } from './widgets'
import Inbox from './Inbox'

const ACCENT = '#818cf8'
const riskColor = (r: number) => (r >= 55 ? '#f87171' : r >= 35 ? '#fbbf24' : '#34d399')

export default function ClinicianConsole({ report }: { report?: StakeholderReport }) {
  const { state, d, dispatch } = useEncounter()

  const meds = state.medications.filter((m) => m.active).map((m) => m.name)
  const labs = state.labs.map((l) => l.label)
  const docPrompts = [
    'Confirm laterality and acuity so codes reach their highest specificity.',
    meds.length ? `Document the indication for each medication started (${meds.join(', ')}).` : 'Note any medication changes and their indications.',
    labs.length ? `Tie ordered tests to the diagnoses they evaluate (${labs.join(', ')}).` : 'Link each ordered test to a supporting diagnosis.',
    state.diagnoses.some((x) => x.accepted) ? 'Sequence the primary diagnosis first to support medical necessity.' : 'Confirm at least one diagnosis to support the services billed.',
  ]

  const row = (kind: 'ICD' | 'CPT', code: string, label: string, tag: string, tagTone: string, on: boolean, onClick: () => void) => (
    <button
      key={kind + code}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors"
      style={{ borderColor: on ? `${ACCENT}55` : 'rgba(255,255,255,0.07)', background: on ? `${ACCENT}14` : 'rgba(255,255,255,0.015)' }}
    >
      <span
        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border"
        style={{ borderColor: on ? ACCENT : 'rgba(255,255,255,0.15)', background: on ? ACCENT : 'transparent' }}
      >
        {on && <Check className="h-3 w-3 text-[#05070f]" />}
      </span>
      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-indigo-300">{code}</span>
      <span className="truncate text-[13px] text-slate-300">{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider" style={{ color: tagTone }}>
        {tag}
      </span>
    </button>
  )

  return (
    <div className="rounded-2xl border border-indigo-400/20 bg-[#0a1020]/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${ACCENT}22` }}>
            <Stethoscope className="h-4 w-4" style={{ color: ACCENT }} />
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Care Navigator</div>
            <div className="text-[11px] text-slate-500">Clinician workspace · chart assist</div>
          </div>
        </div>
        <span className="rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1 font-mono text-[11px] text-indigo-300">
          {d.route === 'frontier' ? 'FRONTIER LANE' : 'STANDARD LANE'}
        </span>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_200px]">
        <div className="space-y-5">
          {report?.summary && <p className="text-sm leading-relaxed text-slate-400">{report.summary}</p>}

          <div>
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <FileCheck2 className="h-4 w-4" style={{ color: ACCENT }} /> Coding · toggle what belongs in the claim
            </div>
            <div className="space-y-1.5">
              {state.diagnoses.map((c) =>
                row(
                  'ICD',
                  c.code,
                  c.name,
                  !c.billable ? 'not billable' : c.source === 'linked' ? `linked: "${c.entity ?? 'entity'}"` : 'in note',
                  !c.billable ? '#fbbf24' : c.source === 'linked' ? '#34d399' : '#94a3b8',
                  c.accepted,
                  () => dispatch({ type: 'toggleDx', code: c.code }),
                ),
              )}
              {state.procedures.map((c) =>
                row(
                  'CPT',
                  c.code,
                  c.label,
                  c.price != null ? `CMS ${c.schedule}` : 'no CMS price',
                  c.price != null ? '#34d399' : '#94a3b8',
                  c.accepted,
                  () => dispatch({ type: 'toggleProc', code: c.code }),
                ),
              )}
              {state.diagnoses.length === 0 && state.procedures.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-[13px] text-slate-500">
                  No codes detected in the note. Add at least one diagnosis to support billing.
                </div>
              )}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {d.acceptedCodes} of {d.totalCodes} codes in the claim · changes recompute cost, reimbursement, and claim readiness live
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} /> Claim readiness checklist
            </div>
            <ChecksPanel checks={d.checks} accent={ACCENT} />
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} /> Prior authorization
            </div>
            {d.anyAuthNeeded ? (
              <>
                <ul className="mb-3 space-y-1.5">
                  {state.procedures.filter((p) => p.accepted && p.authNeeded).map((p) => (
                    <li key={p.code} className="flex gap-2 text-[13px] text-slate-300">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: ACCENT }} />
                      {p.label} commonly requires prior authorization.
                    </li>
                  ))}
                  {state.procedures.filter((p) => p.accepted && p.authNeeded).length === 0 && (
                    <li className="text-[13px] text-slate-400">A claim readiness flag is open. A drafted packet is ready for approval.</li>
                  )}
                </ul>
                <button
                  onClick={() => dispatch({ type: 'approvePriorAuth' })}
                  disabled={state.priorAuthApproved}
                  className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-100"
                  style={{ background: state.priorAuthApproved ? '#0f2a22' : ACCENT, color: state.priorAuthApproved ? '#34d399' : '#05070f' }}
                >
                  {state.priorAuthApproved ? <Check className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  {state.priorAuthApproved ? 'Packet approved & filed' : 'Approve drafted packet'}
                </button>
              </>
            ) : (
              <span className="text-[13px] text-slate-500">Standard submission is appropriate. No packet required.</span>
            )}
          </div>

          <div>
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ClipboardList className="h-4 w-4" style={{ color: ACCENT }} /> Documentation prompts
            </div>
            <ul className="space-y-1.5">
              {docPrompts.map((p, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-slate-300">
                  <Plus className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                  {p}
                </li>
              ))}
            </ul>
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

          <Inbox portal="physician" accent={ACCENT} />
          <ReportDrawer sections={report?.sections ?? []} accent={ACCENT} />
        </div>

        <div className="space-y-4 lg:border-l lg:border-white/[0.06] lg:pl-5">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 text-center">
            <Gauge value={d.reviewRisk} color={riskColor(d.reviewRisk)} label="Review load" />
          </motion.div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 text-center">
            <Gauge value={d.readmissionRisk} color={riskColor(d.readmissionRisk)} label="Readmission · CMS" />
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              {d.readmissionCalibrated ? `Published rate, ${d.readmissionDriver} cohort` : 'National hospital wide published rate'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
            Decision support only. Synthure never prescribes or diagnoses. Every suggestion traces to the note.
          </div>
        </div>
      </div>
    </div>
  )
}
