'use client'
import { useState } from 'react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AIChip } from '@/components/shared/AIChip'
import { AlertCircle, Zap } from 'lucide-react'

const DEMO_DENIALS = [
  { id: 'd-1', carc_code: 'CO-4', denial_reason: 'Service not covered under plan',
    amount_at_stake: 28000, appeal_status: 'pending', appeal_deadline: '2026-08-01' },
  { id: 'd-2', carc_code: 'CO-16', denial_reason: 'Missing prior authorization',
    amount_at_stake: 4500, appeal_status: 'filed', appeal_deadline: '2026-07-15' },
  { id: 'd-3', carc_code: 'CO-50', denial_reason: 'Not medically necessary',
    amount_at_stake: 1200, appeal_status: 'won', appeal_deadline: '2026-06-30' },
]

export default function DenialsPage() {
  const [denials] = useState(DEMO_DENIALS)
  const [generating, setGenerating] = useState<string | null>(null)

  const totalAtStake = denials.filter(d => d.appeal_status === 'pending')
    .reduce((s, d) => s + d.amount_at_stake, 0)

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-slate-100">Denial Management</h1>
          {totalAtStake > 0 && (
            <p className="text-sm text-amber-400 mt-1">
              <AlertCircle className="inline w-3.5 h-3.5 mr-1" />
              ${totalAtStake.toLocaleString()} awaiting appeal
            </p>
          )}
        </div>
        <AIChip label="Auto-appeal" size="md" />
      </div>

      <div className="space-y-3">
        {denials.map((d) => (
          <div key={d.id} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">{d.carc_code}</code>
                  <StatusBadge status={d.appeal_status} />
                </div>
                <p className="text-sm text-slate-200">{d.denial_reason}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Appeal deadline: {d.appeal_deadline}
                  &nbsp;&middot;&nbsp;
                  <span className="text-amber-400">${d.amount_at_stake.toLocaleString()} at stake</span>
                </p>
              </div>
              {d.appeal_status === 'pending' && (
                <button
                  onClick={() => setGenerating(d.id)}
                  className="flex items-center gap-2 text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 px-3 py-2 rounded-lg transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {generating === d.id ? 'Generating…' : 'Auto-appeal'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
