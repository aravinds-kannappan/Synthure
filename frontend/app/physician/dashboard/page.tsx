'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { Compass, Users, FileText, AlertCircle, Clock } from 'lucide-react'

interface Patient {
  id: string
  first_name: string
  last_name: string
  note_count?: number
  latest_visit?: string
  latest_summary?: string
  urgency?: string
  readmission_risk?: { level?: string; score?: number } | null
}

const URGENCY_COLOR: Record<string, string> = {
  urgent:  'text-red-400 bg-red-500/10 border-red-500/20',
  soon:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
  routine: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
}

export default function PhysicianDashboard() {
  const { user, ready } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!ready || !user?.token) { setLoading(false); return }
    api.getMyPatients(user.token)
      .then(r => setPatients(r.patients as Patient[]))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [ready, user])

  const totalNotes = patients.reduce((s, p) => s + (p.note_count ?? 0), 0)
  const highRisk   = patients.filter(p => p.readmission_risk?.level === 'high').length

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light text-slate-100">Good morning, {user?.name ?? 'Doctor'}</h1>
          <p className="text-slate-400 text-sm mt-1">Select a patient to run the Navigator, or review recent results below.</p>
        </div>
        <Link
          href="/physician/navigator"
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-medium py-2.5 px-5 rounded-lg text-sm transition-colors"
        >
          <Compass className="w-4 h-4" /> Navigator
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'My Patients', value: loading ? '…' : String(patients.length), icon: Users,       color: 'indigo' },
          { label: 'Total Notes', value: loading ? '…' : String(totalNotes),       icon: FileText,    color: 'teal'   },
          { label: 'High Risk',   value: loading ? '…' : String(highRisk),         icon: AlertCircle, color: 'amber'  },
        ].map(card => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              <p className="text-xs text-slate-500">{card.label}</p>
            </div>
            <p className="text-3xl font-light text-slate-100">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Patient list */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-medium text-slate-300">My Patients</h2>
          </div>
          <AIChip label="AI-enriched" />
        </div>

        {!!error && (
          <div className="px-6 py-4 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}

        {!loading && patients.length === 0 && !error && (
          <div className="px-6 py-10 text-center text-slate-600 text-sm">
            No patients assigned yet. Submit a clinical note via Navigator to assign a patient.
          </div>
        )}

        <div className="divide-y divide-slate-800">
          {patients.map((p, i) => {
            const rr  = p.readmission_risk
            const urg = p.urgency ?? 'routine'
            return (
              <div key={i} className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-slate-100">
                      {p.first_name} {p.last_name}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${URGENCY_COLOR[urg] ?? URGENCY_COLOR.routine}`}>
                      {urg}
                    </span>
                  </div>
                  {!!p.latest_summary && (
                    <p className="text-xs text-slate-500 truncate max-w-lg">{p.latest_summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {!!p.latest_visit && (
                      <span className="text-xs text-slate-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(p.latest_visit).toLocaleDateString()}
                      </span>
                    )}
                    {!!rr && (
                      <span className={`text-xs ${
                        rr.level === 'high'     ? 'text-red-400' :
                        rr.level === 'moderate' ? 'text-amber-400' :
                        'text-teal-400'
                      }`}>
                        Readmission: {rr.level} ({((rr.score ?? 0) * 100).toFixed(0)}%)
                      </span>
                    )}
                    <span className="text-xs text-slate-600">
                      {p.note_count ?? 0} note{(p.note_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/physician/navigator?patient_id=${p.id}`}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  <Compass className="w-3 h-3" /> New note
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
