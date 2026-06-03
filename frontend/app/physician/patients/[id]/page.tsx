'use client'
import { useParams } from 'next/navigation'
import { JourneyTimeline } from '@/components/shared/JourneyTimeline'
import { AIChip } from '@/components/shared/AIChip'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { CareEvent } from '@/lib/types'

const DEMO_EVENTS: CareEvent[] = [
  { id: '1', patient_id: 'p-1', event_type: 'visit', title: 'Visit — CHF + HTN', detail: 'Dr. Chen', actor: 'Dr. Chen', ai_generated: false, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '2', patient_id: 'p-1', event_type: 'prior_auth', title: 'Prior auth filed — Furosemide', detail: 'Aetna', actor: 'Synthure', ai_generated: true, tier: '1', created_at: new Date(Date.now() - 86400000 * 2 + 60000).toISOString() },
  { id: '3', patient_id: 'p-1', event_type: 'claim', title: 'Claim staged — 99215 · $350', detail: 'Complexity 45 · Standard route', actor: 'Synthure', ai_generated: true, tier: '1', created_at: new Date(Date.now() - 86400000 * 2 + 120000).toISOString() },
  { id: '4', patient_id: 'p-1', event_type: 'education', title: 'Patient education sent via SMS', detail: '3 materials: CHF, HTN, medications', actor: 'Synthure', ai_generated: true, tier: '1', created_at: new Date(Date.now() - 86400000 * 2 + 180000).toISOString() },
  { id: '5', patient_id: 'p-1', event_type: 'payment', title: 'Claim adjudicated — approved · $285', detail: 'Aetna', actor: 'Aetna', ai_generated: false, created_at: new Date(Date.now() - 86400000 * 1).toISOString() },
]

export default function PatientDetailPage() {
  const { id } = useParams()

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light text-slate-100">Patient Record</h1>
          <p className="text-slate-500 text-sm mt-1">ID: {id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
            Readmission risk: 38% — Moderate
          </span>
          <AIChip />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Conditions', value: '3', items: ['CHF (I50.9)', 'HTN (I10)', 'DM Type 2 (E11.9)'] },
          { label: 'Active Medications', value: '4', items: ['Furosemide 40mg', 'Lisinopril 10mg', 'Metformin 500mg', 'Atorvastatin 20mg'] },
          { label: 'Open Claims', value: '1', items: ['99215 · $350 · Submitted'] },
        ].map((card) => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className="text-2xl font-light text-slate-100 mb-3">{card.value}</p>
            {card.items.map((item) => (
              <p key={item} className="text-xs text-slate-400">{item}</p>
            ))}
          </div>
        ))}
      </div>

      <div className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-medium text-slate-300 mb-5">Journey Timeline</h2>
        <JourneyTimeline events={DEMO_EVENTS} />
      </div>
    </div>
  )
}
