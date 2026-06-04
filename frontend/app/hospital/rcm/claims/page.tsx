'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { FileText, ChevronRight, AlertCircle, TrendingUp } from 'lucide-react'

type Patient = Record<string, unknown>

const STAGES = ['staged', 'submitted', 'acknowledged', 'adjudicated', 'paid']

function StateMachine({ current }: { current: string }) {
  const idx = STAGES.indexOf(current)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGES.map((stage, i) => (
        <div key={stage} className="flex items-center gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
            i < idx   ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' :
            i === idx  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' :
            'bg-transparent text-slate-600 border-slate-800'
          }`}>{stage}</span>
          {i < STAGES.length - 1 && <ChevronRight className="w-3 h-3 text-slate-700" />}
        </div>
      ))}
    </div>
  )
}

export default function HospitalClaims() {
  const { user, ready } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!ready || !user?.token) { setLoading(false); return }
    api.listPatients(user.token)
      .then(r => setPatients(r.patients || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ready, user])

  if (!ready || loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-400 text-sm">
        <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
        Loading claims…
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">Claims</h1>
        <AIChip label="AI-adjudicated" size="md" />
        {patients.length > 0 && (
          <span className="ml-auto text-xs text-slate-500">{patients.length} patient{patients.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-6">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {patients.length === 0 && !loading ? (
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-12 text-center text-slate-600 text-sm">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No patients yet. Physicians submit clinical notes via the Navigator to create records.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Claim state guide */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Claim state machine</p>
            <StateMachine current="staged" />
          </div>

          {/* Patient claims table */}
          <div className="bg-[#0d1525] border border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-5 px-5 py-3 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
              <span className="col-span-2">Patient</span>
              <span>Conditions</span>
              <span>Readmission Risk</span>
              <span>Actions</span>
            </div>

            {patients.map((p, i) => {
              const rr = p.readmission_risk as { level?: string; score?: number } | null
              return (
                <div key={i} className="grid grid-cols-5 px-5 py-4 items-center text-sm border-t border-slate-800 first:border-0">
                  <div className="col-span-2">
                    <p className="text-slate-200 font-medium">{p.first_name as string} {p.last_name as string}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.mrn ? `MRN: ${p.mrn as string}` : 'No MRN'}</p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {((p.conditions as unknown[]) || []).length} active
                  </span>
                  <div>
                    {rr ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              rr.level === 'high'     ? 'bg-red-500' :
                              rr.level === 'moderate' ? 'bg-amber-500' : 'bg-teal-500'
                            }`}
                            style={{ width: `${Math.round((rr.score ?? 0) * 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs ${
                          rr.level === 'high'     ? 'text-red-400' :
                          rr.level === 'moderate' ? 'text-amber-400' : 'text-teal-400'
                        }`}>{rr.level}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">No notes yet</span>
                    )}
                  </div>
                  <button
                    onClick={() => window.location.href = `/hospital/crm/patients`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 rounded-lg transition-colors w-fit"
                  >
                    View record
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <TrendingUp className="w-3 h-3" />
            Submit individual claims via the RCM API or through the physician Navigator pipeline.
          </div>
        </div>
      )}
    </div>
  )
}
