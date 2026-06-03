'use client'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AIChip } from '@/components/shared/AIChip'

const DEMO_CLAIMS = [
  { id: 'clm-1', procedure: 'Office visit (99215)', date: 'Jun 2, 2026', billed: 350, insurance_paid: 285, your_share: 45, status: 'paid', status_plain: 'Paid' },
  { id: 'clm-2', procedure: 'Echocardiogram (93306)', date: 'May 15, 2026', billed: 1200, insurance_paid: null, your_share: null, status: 'submitted', status_plain: 'Sent to your insurance' },
]

export default function PatientClaims() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-light text-slate-100">My Claims</h1>
        <AIChip label="plain English" size="md" />
      </div>
      <div className="space-y-3">
        {DEMO_CLAIMS.map((c) => (
          <div key={c.id} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{c.procedure}</p>
                <p className="text-xs text-slate-500 mt-0.5">{c.date}</p>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-slate-300">{c.status_plain}</p>
            <div className="mt-3 flex gap-6 text-xs">
              <span className="text-slate-500">Billed: <span className="text-slate-300">${c.billed}</span></span>
              {c.insurance_paid !== null && <span className="text-slate-500">Insurance paid: <span className="text-teal-400">${c.insurance_paid}</span></span>}
              {c.your_share !== null && <span className="text-slate-500">Your share: <span className="text-amber-400">${c.your_share}</span></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
