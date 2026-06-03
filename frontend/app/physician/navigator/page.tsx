'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { AIChip } from '@/components/shared/AIChip'
import { JourneyTimeline } from '@/components/shared/JourneyTimeline'
import { Compass, Send, AlertTriangle, Heart, DollarSign, Zap } from 'lucide-react'
import type { CareEvent } from '@/lib/types'

export default function NavigatorPage() {
  const [notes, setNotes] = useState('')
  const [age, setAge] = useState('')
  const [income, setIncome] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = JSON.parse(localStorage.getItem('synthure_user') || '{}')
      const out = await api.navigator({
        notes,
        ...(age ? { age: parseInt(age) } : {}),
        ...(income ? { annual_income: parseInt(income) } : {}),
        ...(phone ? { patient_phone: phone } : {}),
      }, user.token) as Record<string, unknown>
      setResult(out)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pipeline error')
    } finally {
      setLoading(false)
    }
  }

  const jargon = (result?.pipelines as Record<string, unknown>)?.jargon as Record<string, unknown>
  const insurance = (result?.pipelines as Record<string, unknown>)?.insurance as Record<string, unknown>
  const readmissionRisk = result?.readmission_risk as number | undefined
  const actionsQueued = (result?.actions_queued as unknown[]) || []

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Compass className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-light text-slate-100">Navigator</h1>
        <AIChip label="All pipelines parallel" size="md" />
      </div>

      {!result ? (
        <form onSubmit={handleSubmit} className="max-w-3xl">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={10}
            className="w-full bg-[#0d1525] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 resize-none mb-4"
            placeholder="Paste clinical note… All pipelines run simultaneously: ✔ Jargon decoder  ✔ Insurance matcher  ✔ Claim adjudication  ✔ Readmission risk  ✔ Patient education queued"
            required
          />
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Patient Age</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)}
                className="w-full bg-[#0d1525] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="e.g. 54" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Annual Income</label>
              <input type="number" value={income} onChange={e => setIncome(e.target.value)}
                className="w-full bg-[#0d1525] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="e.g. 42000" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Patient Phone (SMS)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full bg-[#0d1525] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="+1 555 000 0000" />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <button type="submit" disabled={loading || !notes.trim()}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors">
            <Send className="w-4 h-4" />
            {loading ? 'Running all pipelines…' : 'Run Navigator'}
          </button>
        </form>
      ) : (
        <div className="max-w-5xl">
          {/* Readmission risk badge */}
          {readmissionRisk !== undefined && (
            <div className={`mb-6 flex items-center gap-3 p-4 rounded-xl border ${
              readmissionRisk > 60 ? 'bg-red-500/5 border-red-500/20' :
              readmissionRisk > 30 ? 'bg-amber-500/5 border-amber-500/20' :
              'bg-green-500/5 border-green-500/20'
            }`}>
              <AlertTriangle className={`w-5 h-5 ${
                readmissionRisk > 60 ? 'text-red-400' :
                readmissionRisk > 30 ? 'text-amber-400' : 'text-green-400'
              }`} />
              <div>
                <p className="text-sm font-medium text-slate-200">30-day readmission risk: {readmissionRisk.toFixed(0)}%</p>
                <p className="text-xs text-slate-400">
                  {readmissionRisk > 60 ? 'High risk — consider discharge planning + close follow-up' :
                   readmissionRisk > 30 ? 'Moderate risk — recommend follow-up within 2 weeks' :
                   'Low risk — standard care pathway'}
                </p>
              </div>
              <AIChip />
            </div>
          )}

          {/* 3-panel output */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Clinical panel */}
            <div className="col-span-2 bg-[#0d1525] border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Heart className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-medium text-slate-300">Clinical Summary</h2>
                <AIChip />
              </div>
              {jargon && (
                <div className="space-y-4">
                  {(jargon.data as Record<string, unknown>)?.summary && (
                    <p className="text-sm text-slate-300">{String((jargon.data as Record<string, unknown>).summary)}</p>
                  )}
                  {((jargon.data as Record<string, unknown>)?.conditions as Array<Record<string,string>> || []).map((c, i) => (
                    <div key={i} className="pl-3 border-l-2 border-indigo-500/30">
                      <p className="text-xs font-medium text-indigo-300">{c.term}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.plain}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial panel */}
            <div className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-teal-400" />
                <h2 className="text-sm font-medium text-slate-300">Insurance</h2>
                <AIChip />
              </div>
              {insurance ? (
                <div className="space-y-2">
                  {((insurance.recommendations as Array<Record<string, unknown>>) || []).slice(0, 3).map((r, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-slate-200 font-medium">{String(r.plan)}</span>
                      <span className="ml-2 text-teal-400">{String(r.match_score)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Add age + income to run insurance matcher</p>
              )}
            </div>
          </div>

          {/* Actions panel */}
          {actionsQueued.length > 0 && (
            <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-teal-400" />
                <h2 className="text-sm font-medium text-teal-300">{actionsQueued.length} autonomous action{actionsQueued.length > 1 ? 's' : ''} executed</h2>
                <AIChip label="Tier 1" />
              </div>
              {actionsQueued.map((a: unknown, i) => (
                <p key={i} className="text-xs text-slate-400">
                  ✓ {String((a as Record<string,unknown>).action_type || 'action')} — {String((a as Record<string,unknown>).status)}
                </p>
              ))}
            </div>
          )}

          <button onClick={() => setResult(null)}
            className="text-sm text-slate-400 hover:text-slate-200 underline">
            ← New note
          </button>
        </div>
      )}
    </div>
  )
}
