'use client'
import { AIChip } from '@/components/shared/AIChip'

const DEMO_COVERAGE = {
  plan_name: 'Aetna Bronze HSA',
  coverage_type: 'primary',
  deductible: 3000,
  deductible_met: 850,
  oop_max: 7000,
  oop_met: 1200,
  copay: 30,
  effective_date: '2026-01-01',
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="w-full bg-slate-800 rounded-full h-2 mt-2">
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

export default function PatientCoverage() {
  const c = DEMO_COVERAGE
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-light text-slate-100">My Coverage</h1>
        <AIChip label="live data" size="md" />
      </div>

      <div className="bg-[#0d1525] border border-teal-500/20 rounded-2xl p-6 mb-6">
        <p className="text-sm font-medium text-slate-200 mb-1">{c.plan_name}</p>
        <p className="text-xs text-teal-400">Primary coverage · Effective {c.effective_date}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1">Deductible</p>
          <p className="text-sm text-slate-200">${c.deductible_met.toLocaleString()} <span className="text-slate-500">of ${c.deductible.toLocaleString()}</span></p>
          <ProgressBar value={c.deductible_met} max={c.deductible} color="#00e5c3" />
          <p className="text-xs text-slate-500 mt-2">${(c.deductible - c.deductible_met).toLocaleString()} remaining</p>
        </div>
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1">Out-of-Pocket Maximum</p>
          <p className="text-sm text-slate-200">${c.oop_met.toLocaleString()} <span className="text-slate-500">of ${c.oop_max.toLocaleString()}</span></p>
          <ProgressBar value={c.oop_met} max={c.oop_max} color="#818cf8" />
          <p className="text-xs text-slate-500 mt-2">${(c.oop_max - c.oop_met).toLocaleString()} remaining</p>
        </div>
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
          <p className="text-xs text-slate-500 mb-1">Copay</p>
          <p className="text-xl font-light text-slate-100">${c.copay} <span className="text-xs text-slate-500">per visit</span></p>
        </div>
      </div>
    </div>
  )
}
