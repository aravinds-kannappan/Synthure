'use client'
import Link from 'next/link'
import { Compass, ArrowRight } from 'lucide-react'

export default function PhysicianDashboard() {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-light text-slate-100 mb-2">Good morning, Doctor</h1>
      <p className="text-slate-400 text-sm mb-8">Enter a clinical note to trigger all pipelines simultaneously.</p>

      <Link
        href="/physician/navigator"
        className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/30 hover:border-indigo-500/50 rounded-2xl p-6 mb-6 transition-colors group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <Compass className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="font-medium text-slate-100">Navigator</p>
            <p className="text-sm text-slate-400">One note → prior auth + claim + education + referral</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
      </Link>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending One-tap', value: '0', color: 'amber' },
          { label: 'Prior Auths', value: '0', color: 'teal' },
          { label: 'Patients', value: '0', color: 'indigo' },
        ].map((card) => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className="text-3xl font-light text-slate-100">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
