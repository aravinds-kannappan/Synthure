'use client'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AIChip } from '@/components/shared/AIChip'
import { TrendingDown, Users, DollarSign, Zap } from 'lucide-react'

const COST_TREND = [
  { month: 'Jan', cost: 890 }, { month: 'Feb', cost: 862 },
  { month: 'Mar', cost: 842 }, { month: 'Apr', cost: 831 },
  { month: 'May', cost: 821 }, { month: 'Jun', cost: 815 },
]

export default function EmployerDashboard() {
  const [optimizerOpen, setOptimizerOpen] = useState(false)

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-light text-slate-100 mb-1">Benefits Overview</h1>
      <p className="text-slate-400 text-sm mb-8">Workforce health data analyzed continuously. Optimizations surfaced automatically.</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Enrolled Employees', value: '247', icon: Users, color: 'violet' },
          { label: 'Avg Monthly Cost', value: '$815', icon: DollarSign, color: 'violet' },
          { label: 'Cost Trend', value: '−8.4%', icon: TrendingDown, color: 'success' },
          { label: 'Open Enrollment', value: 'Oct 15', icon: Zap, color: 'amber' },
        ].map((m) => (
          <div key={m.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 mb-1">{m.label}</p>
            <p className="text-2xl font-light text-slate-100">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Cost per Employee (Monthly)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={COST_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0d1525', border: '1px solid #1e293b', borderRadius: 8 }} />
              <Line type="monotone" dataKey="cost" stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div
          className="bg-violet-500/5 border border-violet-500/20 rounded-2xl p-6 cursor-pointer hover:border-violet-500/40 transition-colors"
          onClick={() => setOptimizerOpen(!optimizerOpen)}
        >
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-medium text-violet-300">Benefits Optimizer</h2>
            <AIChip />
          </div>
          <p className="text-2xl font-light text-slate-100 mb-1">$18,400</p>
          <p className="text-xs text-slate-400">projected annual savings identified</p>
          {optimizerOpen && (
            <div className="mt-4 p-3 bg-violet-500/10 rounded-lg">
              <p className="text-xs text-slate-300">Switch 40% of low-utilization employees to HDHP + HSA. Employees under 40 with no chronic conditions average $420/yr in claims vs $2,800 PPO premium.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Utilization Rate', value: '67.3%' },
          { label: 'Top Cost: Mental Health', value: '23%' },
          { label: 'COBRA Active', value: '3' },
        ].map((m) => (
          <div key={m.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{m.label}</p>
            <p className="text-xl font-light text-slate-100">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
