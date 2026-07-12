'use client'

import { useEffect, useState } from 'react'
import { Briefcase, Lock, TrendingUp, BadgeCheck, Check, Target, Layers } from 'lucide-react'
import type { StakeholderReport } from '@/lib/synthure'
import { fmt$ } from '@/lib/engine'
import { dxFactId } from '@/lib/encounter'
import { useEncounter } from './EncounterContext'
import { ReportDrawer } from './widgets'
import Inbox from './Inbox'
import { aggregates, encounterHistory, type HistoryEntry } from '@/lib/history'

const ACCENT = '#a78bfa'

export default function BenefitsDashboard({ report }: { report?: StakeholderReport }) {
  const { state, d, setFocusFact } = useEncounter()
  const conditions = state.diagnoses.filter((x) => x.accepted)
  // Real aggregates over the encounters synthesized in this browser. No
  // fabricated trend lines: before there is history, there is an empty state.
  const [history, setHistory] = useState<HistoryEntry[]>([])
  useEffect(() => setHistory(encounterHistory()), [])
  const agg = aggregates(history)

  return (
    <div className="rounded-2xl border border-violet-400/20 bg-[#0c0a18]/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${ACCENT}22` }}>
            <Briefcase className="h-4 w-4" style={{ color: ACCENT }} />
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Benefits Analytics</div>
            <div className="text-[11px] text-slate-500">Population health · plan sponsor view</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-md border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[11px] text-violet-200">
          <Lock className="h-3 w-3" /> Aggregated & anonymized
        </span>
      </div>

      <div className="space-y-5 p-5">
        {report?.summary && <p className="text-sm leading-relaxed text-slate-400">{report.summary}</p>}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Cohort (AHRQ CCSR)</div>
            <div className="mt-1 text-lg font-semibold text-white">{d.cohortLabel}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Official clinical category of this encounter</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Published cost</div>
            <div className="mt-1 text-lg font-semibold text-white">{d.allowed ? fmt$(d.allowed) : 'None billed'}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">CMS national amounts for billed services</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Review lane</div>
            <div className={`mt-1 text-lg font-semibold ${d.route === 'frontier' ? 'text-amber-400' : 'text-emerald-400'}`}>
              {d.route === 'frontier' ? 'Frontier review' : 'Standard'}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">From the claim readiness checklist</div>
          </div>
        </div>

        {/* Real population view: this browser's synthesized encounters. */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <TrendingUp className="h-4 w-4" style={{ color: ACCENT }} /> Population aggregates
          </div>
          <div className="mb-3 text-[11px] text-slate-500">
            Real aggregates over the {agg.total || 'zero'} encounter{agg.total === 1 ? '' : 's'} synthesized in this browser. Nothing here is simulated.
          </div>
          {agg.total === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-slate-500">
              No population data yet. Aggregates appear as encounters are synthesized.
            </div>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xl font-semibold text-white">{agg.total}</div>
                  <div className="text-[11px] text-slate-500">encounters</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-white">{fmt$(agg.totalAllowed)}</div>
                  <div className="text-[11px] text-slate-500">published CMS amounts</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-white">{agg.frontierShare}%</div>
                  <div className="text-[11px] text-slate-500">routed to frontier review</div>
                </div>
              </div>
              <div className="space-y-1.5">
                {agg.byCohort.slice(0, 6).map((c) => {
                  const w = Math.max(6, Math.round((100 * c.encounters) / agg.total))
                  return (
                    <div key={c.label} className="flex items-center gap-2 text-[12px]">
                      <span className="w-44 truncate text-slate-400">{c.label}</span>
                      <span className="h-2 rounded-full" style={{ width: `${w}%`, background: `${ACCENT}88` }} />
                      <span className="text-slate-500">{c.encounters}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {conditions.length > 0 && (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Layers className="h-4 w-4" style={{ color: ACCENT }} /> Conditions in this encounter
            </div>
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setFocusFact(dxFactId(c.code))}
                  title="Follow this fact across all four portals"
                  className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[12px] text-violet-200 transition-colors hover:border-violet-400/50"
                >
                  {c.name.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Target className="h-4 w-4" style={{ color: ACCENT }} /> Benefits optimization
            </div>
            <ul className="space-y-1.5 text-[13px] text-slate-300">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: ACCENT }} />
                The Benefits Analyst report below recommends plan design changes targeted at the {d.cohortLabel.toLowerCase()} category.
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: ACCENT }} />
                Lower or zero copays on maintenance medications improve adherence and lower downstream cost.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <BadgeCheck className="h-4 w-4" style={{ color: ACCENT }} /> Compliance
            </div>
            <p className="text-[13px] leading-relaxed text-slate-400">
              ACA and COBRA obligations depend on plan enrollment data this demo does not hold, so no compliance verdict is shown. The Benefits Analyst report lists what to review with your administrator.
            </p>
          </div>
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

        <Inbox portal="employer" accent={ACCENT} />
        <ReportDrawer sections={report?.sections ?? []} accent={ACCENT} />
      </div>
    </div>
  )
}
