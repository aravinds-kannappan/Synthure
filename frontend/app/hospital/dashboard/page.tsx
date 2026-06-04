'use client'
import Link from 'next/link'
import { useDemoEncounter } from '@/lib/demo-state'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AIChip } from '@/components/shared/AIChip'
import { TrendingUp, AlertTriangle, Clock, CheckCircle, DollarSign } from 'lucide-react'

export default function HospitalDashboard() {
  const enc = useDemoEncounter()

  const metrics = [
    { label: 'Claims This Month', value: enc ? '1' : '0', href: '/hospital/rcm/claims', delta: enc ? '+1 today' : null, color: 'teal' },
    { label: 'Open Denials', value: '0', href: '/hospital/rcm/denials', delta: null, color: 'teal' },
    { label: 'AR > 90 Days', value: '$0', href: '/hospital/rcm/ar-aging', delta: null, color: 'teal' },
    { label: 'Pending Prior Auths', value: enc?.priorAuthFiled ? '0' : '1', href: '/hospital/rcm/claims', delta: enc?.priorAuthFiled ? 'Auto-filed' : null, color: enc?.priorAuthFiled ? 'teal' : 'amber' },
  ]

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">Revenue Cycle Overview</h1>
        {enc && <span className="text-xs text-slate-500 ml-auto">Last encounter: {new Date(enc.timestamp).toLocaleTimeString()}</span>}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href}
            className="bg-[#0d1525] border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-colors">
            <p className="text-xs text-slate-500 mb-2">{m.label}</p>
            <p className="text-3xl font-light text-slate-100 mb-1">{m.value}</p>
            {m.delta && <p className={`text-xs text-${m.color}-400`}>{m.delta}</p>}
          </Link>
        ))}
      </div>

      {/* Recent claim */}
      {enc && (
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-medium text-slate-300">Recent Claim</h2>
            <AIChip />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-mono mb-1">{enc.claimId}</p>
              <p className="text-base font-medium text-slate-100">{enc.patientName}</p>
              <p className="text-xs text-slate-500 mt-0.5">{enc.specialty} · CPT {enc.cptCode}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-light text-slate-100">${enc.claimAmount.toFixed(2)}</p>
              <StatusBadge status="submitted" />
            </div>
          </div>

          {/* ICD-10 codes */}
          <div className="mt-4 flex flex-wrap gap-2">
            {enc.conditions.map((c, i) => (
              <span key={i} className="text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2 py-1 rounded font-mono">{c.icd10}</span>
            ))}
          </div>

          {/* Denial risk */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${enc.denialProbability < 0.4 ? 'bg-teal-500' : enc.denialProbability < 0.65 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.round(enc.denialProbability * 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">Denial risk: <span className={enc.denialProbability < 0.4 ? 'text-teal-400' : 'text-amber-400'}>{Math.round(enc.denialProbability * 100)}%</span></span>
          </div>
        </div>
      )}

      {/* Tier 1 Actions */}
      {enc && (
        <div className="bg-[#0d1525] border border-teal-500/20 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-medium text-slate-300">Autonomous Actions Completed</h2>
            <AIChip />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Prior auth filed', done: enc.priorAuthFiled, icon: CheckCircle },
              { label: 'Claim staged for submission', done: true, icon: CheckCircle },
              { label: 'Patient education SMS sent', done: enc.educationSent, icon: CheckCircle },
              { label: 'Follow-up reminder scheduled', done: true, icon: CheckCircle },
            ].map((a) => (
              <div key={a.label} className="flex items-center gap-2 text-sm text-slate-300">
                <a.icon className={`w-4 h-4 flex-shrink-0 ${a.done ? 'text-teal-400' : 'text-slate-600'}`} />
                {a.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AR Aging placeholder */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-medium text-slate-300">AR Aging Buckets</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '0–30 days', value: enc ? `$${enc.claimAmount.toFixed(2)}` : '$0', pct: enc ? 100 : 0, color: 'teal' },
            { label: '31–60 days', value: '$0', pct: 0, color: 'amber' },
            { label: '61–90 days', value: '$0', pct: 0, color: 'rose' },
            { label: '90+ days', value: '$0', pct: 0, color: 'red' },
          ].map((b) => (
            <div key={b.label} className="bg-[#0a1020] rounded-xl p-4 border border-slate-800">
              <p className="text-xs text-slate-500 mb-2">{b.label}</p>
              <p className="text-lg font-light text-slate-100 mb-2">{b.value}</p>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full bg-${b.color}-500/60 rounded-full`} style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
