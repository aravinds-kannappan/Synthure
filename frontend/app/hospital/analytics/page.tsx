'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AIChip } from '@/components/shared/AIChip'
import { DeadlineMonitor, type Deadline } from '@/components/shared/DeadlineMonitor'

const BENCHMARKS = [
  { metric: 'Denial Rate', yours: 8.2, cms: 11.4, unit: '%' },
  { metric: 'Days to Pay', yours: 22, cms: 28, unit: 'd' },
  { metric: 'Clean Claim %', yours: 91.2, cms: 87.5, unit: '%' },
]

const DEADLINES: Deadline[] = [
  { id: '1', title: 'Appeal deadline — CO-16 denial', due_date: new Date(Date.now() + 86400000 * 5).toISOString(), owner: 'hospital', amount_at_stake: 8400, urgency: 'critical' },
  { id: '2', title: 'Aetna contract renewal', due_date: new Date(Date.now() + 86400000 * 28).toISOString(), owner: 'hospital', urgency: 'warning' },
  { id: '3', title: 'Dr. Johnson license expiration', due_date: new Date(Date.now() + 86400000 * 85).toISOString(), owner: 'hospital', urgency: 'info' },
]

export default function HospitalAnalytics() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">Analytics</h1>
        <AIChip label="vs CMS benchmarks" size="md" />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-5">Performance vs CMS</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={BENCHMARKS} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis dataKey="metric" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={90} />
              <Tooltip contentStyle={{ background: '#0d1525', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0' }} />
              <Bar dataKey="yours" name="Your practice" fill="#00e5c3" radius={[0, 3, 3, 0]} />
              <Bar dataKey="cms" name="CMS national" fill="#334155" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Smart Deadline Monitor</h2>
          <DeadlineMonitor deadlines={DEADLINES} />
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <AIChip label="Benchmark finding" size="md" />
        </div>
        <p className="text-sm text-slate-200">Your Aetna 99215 reimbursement is <span className="text-red-400">14% below</span> the Medicare rate in your region.</p>
        <p className="text-xs text-slate-400 mt-1">Consider renegotiating Aetna contract at next renewal window (28 days).</p>
      </div>
    </div>
  )
}
