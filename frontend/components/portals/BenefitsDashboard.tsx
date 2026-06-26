'use client'

import { Briefcase, Lock, TrendingUp, Network, BadgeCheck, Check, Target } from 'lucide-react'
import type { StakeholderReport } from '@/lib/synthure'
import { useEncounter } from './EncounterContext'
import { Sparkline, Donut, ReportDrawer } from './widgets'
import Inbox from './Inbox'

const ACCENT = '#a78bfa'

export default function BenefitsDashboard({ report }: { report?: StakeholderReport }) {
  const { state, d } = useEncounter()
  const conditions = state.diagnoses.filter((x) => x.accepted && x.known).map((x) => x.name)
  const compliance = [
    { label: 'ACA reporting (1095 C)', ok: true },
    { label: 'COBRA notices', ok: true },
    { label: 'Audit readiness', ok: true },
  ]

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
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Cohort</div>
            <div className="mt-1 text-lg font-semibold text-white">{d.cohortLabel}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">A major driver of long term plan spend</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Cost tier</div>
            <div className={`mt-1 text-lg font-semibold ${d.costTier === 'Higher' ? 'text-amber-400' : 'text-white'}`}>{d.costTier}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Relative to typical maintenance care</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Network status</div>
            <div className="mt-1 text-lg font-semibold text-emerald-400">In network</div>
            <div className="mt-0.5 text-[11px] text-slate-500">No out of network leakage detected</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <TrendingUp className="h-4 w-4" style={{ color: ACCENT }} /> Cohort spend trend
            </div>
            <div className="mb-2 text-[11px] text-slate-500">Indexed, illustrative · reacts to the encounter risk profile</div>
            <Sparkline data={d.trend} color={ACCENT} />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>8Q ago</span>
              <span>projected</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Network className="h-4 w-4" style={{ color: ACCENT }} /> Network utilization
            </div>
            <Donut percent={d.inNetwork} color={ACCENT} label="In network care" sub="Steering similar care in network lowers plan cost" />
          </div>
        </div>

        {conditions.length > 0 && (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Conditions in this cohort</div>
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((c) => (
                <span key={c} className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[12px] text-violet-200">
                  {c.toLowerCase()}
                </span>
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
                {d.cohort === 'cardiometabolic'
                  ? 'A cardiometabolic or diabetes prevention program directly targets this cohort.'
                  : 'A chronic care management benefit would support this population.'}
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: ACCENT }} />
                Lower or zero copays on maintenance medications improve adherence and lower downstream cost.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <BadgeCheck className="h-4 w-4" style={{ color: ACCENT }} /> Compliance posture
            </div>
            <div className="space-y-2">
              {compliance.map((c) => (
                <div key={c.label} className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-300">{c.label}</span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> {c.ok ? 'Clear' : 'Action'}
                  </span>
                </div>
              ))}
            </div>
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
