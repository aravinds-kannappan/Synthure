'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  HeartPulse, Pill, Activity, Wallet, ListChecks, ShieldAlert,
  MessageCircleQuestion, CheckCircle2, Sparkles, BadgeCheck, FileClock, HandCoins,
} from 'lucide-react'
import type { StakeholderReport } from '@/lib/synthure'
import { fmt$ } from '@/lib/engine'
import { PAYERS, PAYER_ORDER, type Payer } from '@/lib/pricing'
import { useEncounter } from './EncounterContext'
import { ReportDrawer } from './widgets'
import Inbox from './Inbox'

const fade = (i = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: i * 0.04 },
})

const BILLING: Record<string, string> = {
  review: 'Your claim is being prepared by your care team.',
  ready: 'Your claim is ready and your procedure is authorized.',
  submitted: 'Your claim was submitted to your insurer.',
  reimbursed: 'Your claim has been processed.',
}

export default function PatientPortal({ report }: { report?: StakeholderReport }) {
  const { state, d, dispatch } = useEncounter()
  const diagnoses = state.diagnoses.filter((x) => x.accepted)
  const meds = state.medications.filter((m) => m.active)
  const covered = state.priorAuthApproved && d.anyAuthNeeded

  return (
    <div className="rounded-2xl overflow-hidden border border-teal-200/40 bg-gradient-to-b from-white to-[#f3fbf9] text-slate-700 shadow-[0_20px_60px_-20px_rgba(13,148,136,0.45)]">
      <div className="flex items-center justify-between bg-teal-600 px-6 py-4 text-white">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
            <HeartPulse className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">My Health Portal</div>
            <div className="text-[11px] text-teal-100">Your recent visit, explained simply</div>
          </div>
        </div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">Patient view</span>
      </div>

      <div className="space-y-5 p-6">
        {report?.summary && (
          <motion.p {...fade(0)} className="text-[15px] leading-relaxed text-slate-600">{report.summary}</motion.p>
        )}

        {/* Live status banners reacting to other portals */}
        {covered && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <BadgeCheck className="h-5 w-5 flex-shrink-0 text-emerald-600" />
            <span>Good news: your procedure was authorized by your care team, so it is covered. Your estimate below reflects that.</span>
          </motion.div>
        )}

        {/* Cost estimator */}
        <motion.div {...fade(1)} className="rounded-2xl border border-teal-200 bg-teal-50/70 p-5">
          <div className="flex items-center gap-2 text-teal-700">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Your estimated cost</span>
            {state.financialAssistance && (
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">assistance screening requested</span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <motion.span key={d.estPay} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold text-teal-800">
              {d.estPay}
            </motion.span>
            <span className="text-xs text-slate-500">estimated out of pocket</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {d.services.map((s) => (
              <div key={s.code} className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600">{s.label}</span>
                {s.payerPrice != null ? (
                  <span className="text-slate-500">{fmt$(s.payerPrice)} {PAYERS[state.plan.payer].label}{s.patient != null && <> · <span className="font-medium text-teal-700">~{fmt$(s.patient)} you</span></>}</span>
                ) : (
                  <span className="text-slate-400">no published amount</span>
                )}
              </div>
            ))}
            {meds.length > 0 && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600">{meds.length} prescription{meds.length > 1 ? 's' : ''}</span>
                <span className="text-slate-400">cost depends on your plan formulary</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!state.financialAssistance ? (
              <button
                onClick={() => dispatch({ type: 'applyFinancialAssistance' })}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-teal-700"
              >
                <HandCoins className="h-4 w-4" /> Apply for financial assistance
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-[13px] text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Assistance request sent to the billing team.
              </span>
            )}
          </div>
          <div className="mt-2 space-y-0.5">
            {d.assumptions.map((a, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-slate-400">{a}</p>
            ))}
          </div>
          <PlanEditor />
        </motion.div>

        {/* Billing status */}
        <motion.div {...fade(2)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-600">
          <FileClock className="h-4 w-4 text-teal-600" />
          <span><span className="font-medium text-slate-800">Billing status:</span> {BILLING[state.claimStatus]}</span>
        </motion.div>

        {/* Diagnoses */}
        {diagnoses.length > 0 && (
          <motion.div {...fade(3)}>
            <SectionTitle icon={<HeartPulse className="h-4 w-4" />} title="What this means for you" />
            <div className="grid gap-3 sm:grid-cols-2">
              {diagnoses.map((dx) => (
                <div key={dx.code} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{dx.name}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{dx.code}</span>
                  </div>
                  {dx.plain ? (
                    <>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{dx.plain}</p>
                      {dx.plainSource && <p className="mt-1 text-[10px] text-slate-400">Source: {dx.plainSource}</p>}
                    </>
                  ) : (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">Your report below explains this in plain language.</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Medications */}
        {meds.length > 0 && (
          <motion.div {...fade(4)}>
            <SectionTitle icon={<Pill className="h-4 w-4" />} title="Your medications" />
            <div className="space-y-2.5">
              {meds.map((m) => (
                <div key={m.name} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-100">
                    <Pill className="h-4 w-4 text-teal-700" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold capitalize text-slate-800">{m.name}</span>
                      {m.verified && (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">RxNorm verified</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">Your medication guide below explains what it does and how to take it.</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Results */}
        {state.labs.length > 0 && (
          <motion.div {...fade(5)}>
            <SectionTitle icon={<Activity className="h-4 w-4" />} title="Your results" />
            <div className="grid gap-2 sm:grid-cols-2">
              {state.labs.map((r) => (
                <div key={r.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <span className="text-sm font-semibold text-slate-800">{r.label}</span>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">Explained in your results section below.</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Next steps + red flags */}
        <div className="grid gap-4 sm:grid-cols-2">
          <motion.div {...fade(6)} className="rounded-xl border border-slate-200 bg-white p-4">
            <SectionTitle icon={<ListChecks className="h-4 w-4" />} title="Your next steps" />
            <ul className="space-y-2">
              {[
                'Take each medication every day as prescribed, even when you feel fine.',
                state.procedures.length ? 'Complete the ordered labs or tests so your team can confirm the plan is working.' : 'Keep your follow up appointment so your team can track your progress.',
                'Small daily habits help: balanced meals, regular movement, and good sleep.',
              ].map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...fade(7)} className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
            <div className="mb-2.5 flex items-center gap-2 text-rose-700">
              <ShieldAlert className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">When to seek care</span>
            </div>
            <ul className="space-y-2">
              {[
                state.symptoms.includes('chest pain') || state.symptoms.includes('chest pressure')
                  ? 'New or worsening chest pain or pressure, especially with sweating or arm pain.'
                  : 'Symptoms that are new, severe, or quickly getting worse.',
                'Trouble breathing, fainting, or confusion.',
                'Side effects from a medication that worry you.',
              ].map((s, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-rose-900/80">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-rose-500" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.div {...fade(8)} className="rounded-xl border border-slate-200 bg-white p-4">
          <SectionTitle icon={<MessageCircleQuestion className="h-4 w-4" />} title="Questions worth asking" />
          <ul className="space-y-1.5">
            {['What is my target for blood pressure, sugar, or cholesterol?', 'Are there lower cost versions of my medications?', 'What lifestyle change would help me the most right now?'].map((q, i) => (
              <li key={i} className="text-[13px] text-slate-600">“{q}”</li>
            ))}
          </ul>
        </motion.div>

        {report?.actions && report.actions.length > 0 && (
          <motion.div {...fade(9)} className="rounded-xl border border-teal-200 bg-teal-50/60 p-4">
            <div className="mb-2.5 flex items-center gap-2 text-teal-700">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">What Synthure did for you</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {report.actions.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-slate-700">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-teal-600" /> {a}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <Inbox portal="patient" accent="#0d9488" tone="light" />
        <ReportDrawer sections={report?.sections ?? []} accent="#0d9488" tone="light" />
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-slate-700">
      <span className="text-teal-600">{icon}</span>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  )
}

function PlanEditor() {
  const { state, dispatch } = useEncounter()
  const p = state.plan
  const upd = (k: 'deductibleRemaining' | 'coinsurance' | 'oopMaxRemaining', v: number) =>
    dispatch({ type: 'setPlan', plan: { ...p, [k]: v } })
  return (
    <div className="mt-3 rounded-lg border border-teal-200/70 bg-white/70 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-teal-700">Your coverage (editable)</div>
      <select
        value={p.payer}
        onChange={(e) => {
          const payer = e.target.value as Payer
          dispatch({ type: 'setPlan', plan: { ...p, payer, coinsurance: PAYERS[payer].coinsurance } })
        }}
        className="mb-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
      >
        {PAYER_ORDER.map((k) => (
          <option key={k} value={k}>{PAYERS[k].label}</option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-slate-500">
          Deductible left
          <input
            type="number"
            min={0}
            value={p.deductibleRemaining}
            onChange={(e) => upd('deductibleRemaining', Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
          />
        </label>
        <label className="text-[11px] text-slate-500">
          Coinsurance %
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(p.coinsurance * 100)}
            onChange={(e) => upd('coinsurance', Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
          />
        </label>
        <label className="text-[11px] text-slate-500">
          OOP max left
          <input
            type="number"
            min={0}
            value={p.oopMaxRemaining}
            onChange={(e) => upd('oopMaxRemaining', Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800"
          />
        </label>
      </div>
    </div>
  )
}
