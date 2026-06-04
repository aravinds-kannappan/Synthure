'use client'
import { useEffect, useState } from 'react'
import { JourneyTimeline } from '@/components/shared/JourneyTimeline'
import { AIChip } from '@/components/shared/AIChip'
import type { CareEvent } from '@/lib/types'

export default function PatientDashboard() {
  const [events] = useState<CareEvent[]>([])

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">My Health Summary</h1>
        <AIChip label="AI-powered" size="md" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Conditions', value: '—', color: 'teal' },
          { label: 'Active Medications', value: '—', color: 'indigo' },
          { label: 'Open Claims', value: '—', color: 'amber' },
        ].map((card) => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className="text-3xl font-light text-slate-100">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-slate-300 mb-5">Your Health Journey</h2>
        <JourneyTimeline events={events} />
      </div>
    </div>
  )
}
