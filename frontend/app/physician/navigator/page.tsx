'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { SAMPLE_NOTE } from '@/lib/demo-state'
import { Compass, Send, Clock, CheckCircle, AlertTriangle, Sparkles, User } from 'lucide-react'

type Patient = { id: string; first_name: string; last_name: string }

interface JargonData {
  summary?:    string
  conditions?: { term: string; plain: string; source_doc_id: string }[]
  medications?: { name: string; purpose: string; instructions: string }[]
  followup?:   string
  urgency?:    string
  readmission_risk?: { score: number; level: string; driving_codes: string[] }
}

interface PipelineResult {
  pipelines?: {
    jargon?: {
      data?: JargonData
      entity_confidence?: number
      source?: string
      pipeline_trace?: { stage: string; duration_ms: number; confidence?: number }[]
    }
    insurance?: {
      recommendations?: { plan: string; match_score: number; reason: string }[]
      ai_insight?: { ai_insight: string; key_consideration: string; warning?: string }
    }
  }
  note_id?: string
  patient_id?: string
}

function UrgencyBadge({ level }: { level: string }) {
  const map: Record<string, { cls: string }> = {
    urgent:  { cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
    soon:    { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    routine: { cls: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
  }
  const { cls } = map[level] ?? map.routine
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>
      <Clock className="w-3 h-3" />{level}
    </span>
  )
}

export default function NavigatorPage() {
  const { user, ready } = useAuth()
  const searchParams = useSearchParams()
  const preselectedPatientId = searchParams.get('patient_id') ?? ''

  const [patients,   setPatients]   = useState<Patient[]>([])
  const [patientId,  setPatientId]  = useState(preselectedPatientId)
  const [notes,      setNotes]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<PipelineResult | null>(null)
  const [error,      setError]      = useState('')

  // Load patient list
  useEffect(() => {
    if (!ready || !user?.token) return
    api.listPatients(user.token)
      .then(r => setPatients(
        (r.patients as Patient[]).filter(p => p.id && p.first_name)
      ))
      .catch(() => {/* non-fatal */})
  }, [ready, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.token) { setError('Not authenticated'); return }
    if (!patientId)   { setError('Select a patient first'); return }

    setLoading(true); setError(''); setResult(null)
    try {
      const out = await api.navigator({ notes, patient_id: patientId }, user.token) as PipelineResult
      setResult(out)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pipeline error')
    } finally {
      setLoading(false)
    }
  }

  const jargon = result?.pipelines?.jargon
  const jData  = jargon?.data
  const trace  = jargon?.pipeline_trace ?? []
  const ins    = result?.pipelines?.insurance

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <Compass className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-light text-slate-100">Navigator</h1>
        <AIChip label="Multi-agent" size="md" />
      </div>

      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        {/* Patient selector */}
        <div>
          <label className="text-xs text-slate-500 block mb-1.5 flex items-center gap-1.5">
            <User className="w-3 h-3" /> Patient <span className="text-red-400">*</span>
          </label>
          <select
            value={patientId}
            onChange={e => setPatientId(e.target.value)}
            required
            className="w-full bg-[#0d1525] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Select patient…</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
        </div>

        {/* Clinical note */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500">Clinical note</span>
            <button
              type="button"
              onClick={() => setNotes(SAMPLE_NOTE)}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-500/20 bg-indigo-500/5 px-3 py-1 rounded-lg"
            >
              <Sparkles className="w-3 h-3" /> Load example
            </button>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={9}
            className="w-full bg-[#0d1525] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Paste clinical note here — or click ‘Load example’ above."
            required
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !notes.trim() || !patientId}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Running agents…' : 'Run Navigator'}
          </button>
          {result?.note_id && (
            <span className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-lg">
              <CheckCircle className="w-3.5 h-3.5" />
              Saved — note {result.note_id.slice(0, 8)}…
            </span>
          )}
        </div>
      </form>

      {result && jData && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: main results */}
          <div className="col-span-2 space-y-4">
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-medium text-slate-300">Visit Summary</h2>
                <AIChip />
                {jData.urgency && <UrgencyBadge level={jData.urgency} />}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{jData.summary}</p>
              {jData.readmission_risk && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${
                    jData.readmission_risk.level === 'high'     ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    jData.readmission_risk.level === 'moderate' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-teal-500/10 text-teal-400 border-teal-500/20'
                  }`}>
                    30-day readmission risk: {jData.readmission_risk.level} ({(jData.readmission_risk.score * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>

            {!!jData.conditions?.length && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-medium text-slate-300">Conditions Explained</h2><AIChip />
                </div>
                <div className="space-y-4">
                  {jData.conditions.map((c, i) => (
                    <div key={i} className="border-l-2 border-teal-500/40 pl-4">
                      <p className="text-xs text-teal-400 font-mono mb-1">{c.term}</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{c.plain}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!jData.medications?.length && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-medium text-slate-300">Medications</h2><AIChip />
                </div>
                <div className="space-y-3">
                  {jData.medications.map((m, i) => (
                    <div key={i} className="bg-[#0a1020] rounded-lg p-4 border border-slate-800">
                      <p className="text-sm font-medium text-indigo-300 mb-1">{m.name}</p>
                      <p className="text-xs text-slate-400 mb-1">{m.purpose}</p>
                      <p className="text-xs text-slate-500 italic">{m.instructions}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {jData.followup && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
                <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Follow-Up</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{jData.followup}</p>
              </div>
            )}

            {/* Insurance match */}
            {ins?.recommendations && ins.recommendations.length > 0 && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-medium text-slate-300">Insurance Match</h2><AIChip />
                </div>
                <div className="space-y-3">
                  {ins.recommendations.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-slate-200">{r.plan}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.reason}</p>
                      </div>
                      <span className="text-sm font-mono text-teal-400 flex-shrink-0">{r.match_score}%</span>
                    </div>
                  ))}
                </div>
                {ins.ai_insight && (
                  <div className="mt-4 pt-4 border-t border-slate-800">
                    <p className="text-xs text-slate-400 leading-relaxed">{ins.ai_insight.ai_insight}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: agent trace */}
          <div className="space-y-4">
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">Agent Trace</h2>
              <div className="space-y-3">
                {trace.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400 truncate">{step.stage.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-slate-600 font-mono flex-shrink-0">{step.duration_ms}ms</span>
                      </div>
                      {step.confidence !== undefined && (
                        <div className="mt-1 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500/60 rounded-full"
                            style={{ width: `${Math.round(step.confidence * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {jargon?.entity_confidence !== undefined && (
                <div className="mt-5 pt-4 border-t border-slate-800">
                  <div className="text-xs text-slate-500 mb-1">Entity confidence</div>
                  <div className="text-2xl font-light text-white">{jargon.entity_confidence.toFixed(2)}</div>
                  <div className="text-xs text-slate-600">biomedical-ner-all</div>
                </div>
              )}
            </div>

            <div className="bg-[#0d1525] border border-teal-500/20 rounded-xl p-5">
              <h2 className="text-xs font-medium text-teal-400 uppercase tracking-wider mb-3">Persisted</h2>
              <div className="space-y-2">
                {[
                  'Note saved to patient record',
                  'Conditions updated',
                  'Medications updated',
                  'Care event logged',
                  result?.pipelines?.insurance ? 'Insurance match stored' : null,
                ].filter(Boolean).map(action => (
                  <div key={action} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle className="w-3 h-3 text-teal-400 flex-shrink-0" />{action}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
