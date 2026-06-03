'use client'
import { useEffect, useState } from 'react'
import { JourneyTimeline } from '@/components/shared/JourneyTimeline'
import { AIChip } from '@/components/shared/AIChip'
import { DeadlineMonitor } from '@/components/shared/DeadlineMonitor'
import { api } from '@/lib/api'
import type { CareEvent } from '@/lib/types'
import { subscribeToPortalEvents } from '@/lib/realtime'

const DEMO_EVENTS: CareEvent[] = [
  { id: '1', patient_id: 'p', event_type: 'visit', title: 'Visit — Heart Failure + Hypertension', detail: 'Dr. Sarah Chen', actor: 'Dr. Sarah Chen', ai_generated: false, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '2', patient_id: 'p', event_type: 'education', title: 'Health education sent to your phone', detail: '3 guides: Heart Failure, Hypertension, Lisinopril', actor: 'Synthure', ai_generated: true, tier: '1', created_at: new Date(Date.now() - 86400000 * 2 + 60000).toISOString() },
  { id: '3', patient_id: 'p', event_type: 'claim', title: 'Your insurance claim — being processed', detail: 'Office visit · $350 billed to Aetna', actor: 'Synthure', ai_generated: true, tier: '1', created_at: new Date(Date.now() - 86400000 * 2 + 120000).toISOString() },
  { id: '4', patient_id: 'p', event_type: 'payment', title: 'Insurance paid your claim — $285', detail: 'Your share: $45 · Statement sent', actor: 'Aetna', ai_generated: false, created_at: new Date(Date.now() - 86400000).toISOString() },
]

export default function PatientDashboard() {
  const [events, setEvents] = useState<CareEvent[]>(DEMO_EVENTS)

  useEffect(() => {
    const raw = localStorage.getItem('synthure_user')
    if (!raw) return
    const user = JSON.parse(raw)
    const unsub = subscribeToPortalEvents('patient', user.org_id || 'demo', (ev) => {
      setEvents((prev) => [{
        id: Date.now().toString(),
        patient_id: ev.patient_id || '',
        event_type: ev.event_type,
        title: ev.payload.title as string || ev.event_type,
        ai_generated: true,
        tier: '1',
        created_at: new Date().toISOString(),
      }, ...prev])
    })
    return unsub
  }, [])

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">My Health</h1>
        <AIChip label="AI-powered" size="md" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Conditions', value: '3' },
          { label: 'Active Medications', value: '4' },
          { label: 'Open Claims', value: '1' },
        ].map((card) => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className="text-3xl font-light text-slate-100">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0d1525] border border-teal-500/20 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-slate-200">Your share for last visit: <span className="text-teal-400">$45</span></p>
          <AIChip label="calculated" />
        </div>
        <p className="text-xs text-slate-500">Aetna Bronze HSA · Deductible met: $850 / $3,000</p>
      </div>

      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-slate-300 mb-5">Your Health Journey</h2>
        <JourneyTimeline events={events} />
      </div>

      <p className="text-xs text-slate-600 mt-4 text-center">
        Updates arrive live as your care team takes action — no refresh needed.
      </p>
    </div>
  )
}
