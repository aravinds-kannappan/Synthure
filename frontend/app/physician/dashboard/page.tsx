'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Compass, ArrowRight, Zap, CheckCircle } from 'lucide-react'
import { AIChip } from '@/components/shared/AIChip'
import { StatusBadge } from '@/components/shared/StatusBadge'

const DEMO_ONE_TAP = [
  { id: 'a-1', action_type: 'send_referral_letter', tier: '2', payload: { specialist: 'Dr. Kim (Cardiology)', patient: 'Jane Smith' } },
  { id: 'a-2', action_type: 'send_discharge_summary', tier: '2', payload: { pcp: 'Dr. Jones', patient: 'Bob Lee' } },
]

const DEMO_COMPLETED = [
  { action_type: 'send_patient_education', status: 'completed', tier: '1' },
  { action_type: 'submit_prior_auth', status: 'completed', tier: '1' },
  { action_type: 'stage_claim', status: 'completed', tier: '1' },
  { action_type: 'verify_eligibility', status: 'completed', tier: '1' },
]

export default function PhysicianDashboard() {
  const [taps, setTaps] = useState(DEMO_ONE_TAP)

  function dismiss(id: string) {
    setTaps((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-light text-slate-100 mb-1">Good morning, Doctor</h1>
      <p className="text-slate-400 text-sm mb-8">
        {DEMO_COMPLETED.length} actions completed autonomously today. {taps.length > 0 ? `${taps.length} await your approval.` : 'Nothing awaiting approval.'}
      </p>

      {/* One-tap queue */}
      {taps.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Awaiting your approval</p>
          <div className="space-y-2">
            {taps.map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-5 py-4">
                <div>
                  <p className="text-sm text-slate-200">{t.action_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {Object.values(t.payload).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">Tier 2</span>
                  <button onClick={() => dismiss(t.id)}
                    className="bg-indigo-500 hover:bg-indigo-400 text-white text-xs px-4 py-2 rounded-lg transition-colors">
                    Approve
                  </button>
                  <button onClick={() => dismiss(t.id)}
                    className="text-slate-500 hover:text-slate-300 text-xs px-2 py-2">
                    Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigator CTA */}
      <Link href="/physician/navigator"
        className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/30 hover:border-indigo-500/50 rounded-2xl p-6 mb-6 transition-colors group">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <Compass className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="font-medium text-slate-100">Navigator</p>
            <p className="text-sm text-slate-400">One note → all pipelines → all actions automatic</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
      </Link>

      {/* Completed today feed */}
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Completed autonomously today</p>
      <div className="space-y-1">
        {DEMO_COMPLETED.map((a, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#0d1525] border border-slate-800 rounded-xl">
            <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-sm text-slate-300">{a.action_type.replace(/_/g, ' ')}</span>
            <AIChip label={`Tier ${a.tier}`} />
          </div>
        ))}
      </div>
    </div>
  )
}
