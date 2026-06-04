'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { Building2, Users, FileText, AlertCircle, TrendingUp, Activity } from 'lucide-react'

interface Overview  { hospitals?: number; patients?: number; clinical_notes?: number; high_readmission_count?: number; avg_readmission_risk?: number }
interface Hospital  { hospital_id: string; name: string; patient_count: number; physician_count: number; note_count: number }
interface Condition { code: string; count: number; prevalence_pct: number }

export default function EmployerDashboard() {
  const { user, ready } = useAuth()
  const [overview,   setOverview]   = useState<Overview | null>(null)
  const [hospitals,  setHospitals]  = useState<Hospital[]>([])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (!ready || !user?.token) { setLoading(false); return }
    const t = user.token
    Promise.all([
      api.employerOverview(t),
      api.employerHospitals(t),
      api.populationConditions(t),
    ])
      .then(([ov, hosp, cond]) => {
        setOverview(ov as unknown as Overview)
        setHospitals((hosp as unknown as { hospitals: Hospital[] }).hospitals || [])
        setConditions((cond as unknown as { conditions: Condition[] }).conditions || [])
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [ready, user])

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">Population Health Overview</h1>
        <AIChip label="Aggregated" size="md" />
      </div>

      {!!error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-6">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Hospitals',          value: overview?.hospitals,               icon: Building2,   color: 'violet' },
          { label: 'Covered Patients',   value: overview?.patients,                icon: Users,       color: 'indigo' },
          { label: 'Clinical Notes',     value: overview?.clinical_notes,          icon: FileText,    color: 'teal'   },
          { label: 'High Risk Patients', value: overview?.high_readmission_count,  icon: AlertCircle, color: 'amber'  },
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
        {/* Avg readmission risk */}
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-medium text-slate-300">Avg Readmission Risk</h2>
            <AIChip />
          </div>
          <p className="text-4xl font-light text-white mb-1">
            {loading ? '…' : `${((overview?.avg_readmission_risk ?? 0) * 100).toFixed(1)}%`}
          </p>
          <p className="text-xs text-slate-500">across all covered hospitals</p>
        </div>

        {/* Population conditions */}
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-medium text-slate-300">Top Conditions</h2>
            <AIChip />
          </div>
          {conditions.length > 0 ? (
            <div className="space-y-2">
              {conditions.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs font-mono text-teal-400">{c.code}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{c.count} patients</span>
                    <span className="text-xs text-slate-500">{c.prevalence_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">No data yet.</p>
          )}
        </div>
      </div>

      {/* Hospital breakdown */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium text-slate-300">Covered Hospitals</h2>
        </div>
        {hospitals.length === 0 && !loading && (
          <div className="px-6 py-8 text-center text-slate-600 text-sm">
            No hospitals linked to this employer account yet.
          </div>
        )}
        <div className="divide-y divide-slate-800">
          {hospitals.map((h, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm text-slate-100">{h.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {h.patient_count} patient{h.patient_count !== 1 ? 's' : ''} · 
                  {h.physician_count} physician{h.physician_count !== 1 ? 's' : ''} · 
                  {h.note_count} note{h.note_count !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
