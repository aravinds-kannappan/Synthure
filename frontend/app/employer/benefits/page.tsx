'use client'
import { AIChip } from '@/components/shared/AIChip'
import { Zap } from 'lucide-react'

const PLANS = [
  { name: 'Aetna PPO Gold', type: 'Medical', premium_ee: 280, premium_er: 820, enrolled: 142, deductible: 1500 },
  { name: 'Aetna PPO Silver', type: 'Medical', premium_ee: 180, premium_er: 620, enrolled: 89, deductible: 3000 },
  { name: 'Cigna HDHP + HSA', type: 'Medical', premium_ee: 95, premium_er: 420, enrolled: 16, deductible: 5000 },
]

export default function EmployerBenefits() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light text-slate-100">Benefit Plans</h1>
        <button className="flex items-center gap-2 bg-violet-500/10 text-violet-300 border border-violet-500/30 px-4 py-2 rounded-lg text-sm hover:bg-violet-500/20">
          <Zap className="w-4 h-4" />
          Run Optimizer
          <AIChip />
        </button>
      </div>
      <div className="space-y-3">
        {PLANS.map((p) => (
          <div key={p.name} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-200">{p.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{p.type} · Deductible: ${p.deductible.toLocaleString()}</p>
              </div>
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{p.enrolled} enrolled</span>
            </div>
            <div className="flex gap-6 mt-3 text-xs">
              <span className="text-slate-500">Employee premium: <span className="text-slate-200">${p.premium_ee}/mo</span></span>
              <span className="text-slate-500">Employer cost: <span className="text-violet-400">${p.premium_er}/mo</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
