'use client'
import Link from 'next/link'

const METRICS = [
  { label: 'Claims This Month', value: '—', href: '/hospital/rcm/claims' },
  { label: 'Open Denials', value: '—', href: '/hospital/rcm/denials' },
  { label: 'AR > 90 Days', value: '—', href: '/hospital/rcm/ar-aging' },
  { label: 'Pending Prior Auths', value: '—', href: '/hospital/rcm/claims' },
]

export default function HospitalDashboard() {
  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-light text-slate-100 mb-8">Revenue Cycle Overview</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {METRICS.map((m) => (
          <Link key={m.label} href={m.href}
            className="bg-[#0d1525] border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-colors"
          >
            <p className="text-xs text-slate-500 mb-1">{m.label}</p>
            <p className="text-3xl font-light text-slate-100">{m.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">AR Aging</h2>
          <p className="text-slate-500 text-sm">Recharts waterfall — Phase 2 (RCM Core).</p>
        </div>
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Payer Scorecard</h2>
          <p className="text-slate-500 text-sm">Live denial/payment metrics — Phase 8.</p>
        </div>
      </div>
    </div>
  )
}
