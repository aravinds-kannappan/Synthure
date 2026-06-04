'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Heart, Pill, FileText, Clock, ChevronRight, AlertCircle } from 'lucide-react'

interface Condition  { icd10_code: string; description?: string }
interface Medication { name: string; dose?: string; frequency?: string }
interface Note       { id: string; created_at: string; physician_name?: string; urgency?: string; ai_summary?: string }
interface TimelineEvent { title: string; created_at: string; detail?: string; ai_generated?: boolean }

function Spinner() {
  return <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
}

function Empty({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-slate-600 text-sm">
      <p>{message}</p>
    </div>
  )
}

export default function PatientDashboard() {
  const { user, ready } = useAuth()

  const [profile,  setProfile]  = useState<Record<string, unknown> | null>(null)
  const [notes,    setNotes]    = useState<Note[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!ready) return
    if (!user?.token) { setLoading(false); return }
    const token = user.token
    Promise.all([
      api.getMyProfile(token),
      api.getMyNotes(token),
      api.getMyTimeline(token),
    ])
      .then(([prof, notesResp, timelineResp]) => {
        setProfile(prof as Record<string, unknown>)
        // Cast through unknown: API returns Record<string,unknown>[] but we know the shape
        setNotes((notesResp as unknown as { notes: Note[] }).notes || [])
        setTimeline((timelineResp as unknown as { events: TimelineEvent[] }).events || [])
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [ready, user])

  if (!ready || loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-400 text-sm">
        <Spinner /> Loading your health data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 flex items-center gap-2 text-red-400 text-sm">
        <AlertCircle className="w-4 h-4" />{error}
      </div>
    )
  }

  const conditions  = (profile?.conditions  as Condition[])  || []
  const medications = (profile?.medications as Medication[]) || []
  const patientName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
  const dob         = profile?.date_of_birth as string | undefined

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">My Health Summary</h1>
        <AIChip label="AI-powered" size="md" />
        {notes[0] && (
          <span className="text-xs text-slate-500 ml-auto">
            Updated {new Date(notes[0].created_at).toLocaleString()}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Conditions',  value: conditions.length  || '—', icon: Heart,    color: 'teal'   },
          { label: 'Active Medications', value: medications.length || '—', icon: Pill,     color: 'indigo' },
          { label: 'Total Visits',       value: notes.length       || '—', icon: FileText, color: 'amber'  },
        ].map(card => (
          <div key={card.label} className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <card.icon className={`w-4 h-4 text-${card.color}-400`} />
              <p className="text-xs text-slate-500">{card.label}</p>
            </div>
            <p className="text-3xl font-light text-slate-100">{String(card.value)}</p>
          </div>
        ))}
      </div>

      {/* Patient info */}
      {!!profile && (
        <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-slate-100">{patientName}</p>
              {!!dob && <p className="text-xs text-slate-500 mt-0.5">DOB: {dob}</p>}
            </div>
            <StatusBadge status="active" />
          </div>
        </div>
      )}

      {/* Conditions */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Heart className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-medium text-slate-300">My Conditions</h2>
          <AIChip />
        </div>
        {conditions.length > 0 ? (
          <div className="space-y-4">
            {conditions.map((c, i) => (
              <div key={i} className="border-l-2 border-teal-500/40 pl-4">
                <p className="text-xs text-teal-400 font-mono mb-1">{c.icd10_code}</p>
                <p className="text-sm text-slate-300 leading-relaxed">{c.description ?? c.icd10_code}</p>
              </div>
            ))}
          </div>
        ) : <Empty message="No conditions recorded yet." />}
      </div>

      {/* Medications */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Pill className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-medium text-slate-300">My Medications</h2>
          <AIChip />
        </div>
        {medications.length > 0 ? (
          <div className="space-y-3">
            {medications.map((m, i) => (
              <div key={i} className="bg-[#0a1020] rounded-lg p-4 border border-slate-800">
                <p className="text-sm font-medium text-indigo-300">{m.name}</p>
                {!!(m.dose) && <p className="text-xs text-slate-400 mt-0.5">{m.dose} {m.frequency}</p>}
              </div>
            ))}
          </div>
        ) : <Empty message="No medications recorded yet." />}
      </div>

      {/* Visit history */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <FileText className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-medium text-slate-300">Visit History</h2>
        </div>
        {notes.length > 0 ? (
          <div className="space-y-3">
            {notes.map((note, i) => (
              <div key={i} className="bg-[#0a1020] rounded-lg p-4 border border-slate-800 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-slate-500">
                      {new Date(note.created_at).toLocaleDateString()}
                    </p>
                    {!!note.physician_name && (
                      <span className="text-xs text-indigo-400">{note.physician_name}</span>
                    )}
                    {!!note.urgency && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        note.urgency === 'urgent'  ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        note.urgency === 'soon'    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-teal-500/10 text-teal-400 border-teal-500/20'
                      }`}>{note.urgency}</span>
                    )}
                  </div>
                  {!!note.ai_summary && (
                    <p className="text-sm text-slate-300 leading-relaxed line-clamp-2">{note.ai_summary}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        ) : <Empty message="No visits recorded yet. Your physician will add notes after your first visit." />}
      </div>

      {/* Timeline */}
      <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-medium text-slate-300">My Health Journey</h2>
        </div>
        {timeline.length > 0 ? (
          <div className="space-y-4">
            {timeline.slice(0, 10).map((evt, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0 mt-1.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-200">{evt.title}</p>
                    {!!evt.ai_generated && <AIChip />}
                  </div>
                  {!!evt.detail && <p className="text-xs text-slate-500 mt-0.5">{evt.detail}</p>}
                  <p className="text-xs text-slate-700 mt-0.5">
                    {new Date(evt.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty message="No events yet." />}
      </div>
    </div>
  )
}
