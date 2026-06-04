'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { Users, FileText, Activity, AlertCircle, ChevronRight, TrendingUp } from 'lucide-react'

type Overview  = Record<string, unknown>
type Physician = Record<string, unknown>

export default function HospitalDashboard() {
  const { user, ready } = useAuth()
  const [overview,    setOverview]    = useState<Overview | null>(null)
  const [physicians,  setPhysicians]  = useState<Physician[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!ready || !user?.token) { setLoading(false); return }
    const t = user.token
    Promise.all([
      api.hospitalOverview(t),
      api.hospitalPhysicians(t),
    ])
      .then(([ov, phys]) => {
        setOverview(ov)
        setPhysicians((phys as { physicians: Physician[] }).physicians || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [ready, user])

  const topConditions = (overview?.top_conditions as { code: string; count: number }[]) || []

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">Hospital Overview</h1>
        <AIChip label="Live data" size="md" />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-6">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Patients',      value: overview?.patients,        icon: Users,      color: 'indigo' },
          { label: 'Clinical Notes', value: overview?.clinical_notes, icon: FileText,   color: 'teal'   },
          { label: 'Physicians',    value: overview?.physicians,       icon: Activity,   color: 'violet' },
          { label: 'High Risk',     value: overview?.high_readmission_count, icon: AlertCircle, color: 'amber' },
        ].map(card => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              <p className="text-xs text-slate-500">{card.label}</p>
            </div>
            <p className="text-3xl font-light text-slate-100">
              {loading ? '…' : String(card.value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Readmission risk */}
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-medium text-slate-300">Avg Readmission Risk</h2>
            <AIChip />
          </div>
          <p className="text-4xl font-light text-white mb-1">
            {loading ? '…' : `${((overview?.avg_readmission_risk as number ?? 0) * 100).toFixed(1)}%`}
          </p>
          <p className="text-xs text-slate-500">across all patients with AI-processed notes</p>
        </div>

        {/* Top conditions */}
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Top Conditions</h2>
          {topConditions.length > 0 ? (
            <div className="space-y-2">
              {topConditions.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs font-mono text-teal-400">{c.code}</span>
                  <span className="text-xs text-slate-400">{c.count} patient{c.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">No conditions recorded yet.</p>
          )}
        </div>
      </div>

      {/* Physicians table */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-medium text-slate-300">Physicians</h2>
        </div>
        {physicians.length === 0 && !loading && (
          <div className="px-6 py-8 text-center text-slate-600 text-sm">No physicians in this hospital yet.</div>
        )}
        <div className="divide-y divide-slate-800">
          {physicians.map((p, i) => (
            <Link
              key={i}
              href={`/hospital/crm?physician_id=${p.physician_id as string}`}
              className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/30 transition-colors"
            >
              <div>
                <p className="text-sm text-slate-100">{p.name as string}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.patient_count as number} patient{(p.patient_count as number) !== 1 ? 's' : ''} · 
                  {p.note_count as number} note{(p.note_count as number) !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
