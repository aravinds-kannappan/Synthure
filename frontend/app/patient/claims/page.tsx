'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AIChip } from '@/components/shared/AIChip'
import { FileText, ShieldCheck, AlertCircle, Clock } from 'lucide-react'

type Note = Record<string, unknown>

function Empty() {
  return (
    <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-10 text-center text-slate-600 text-sm">
      <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
      <p>No claims yet.</p>
      <p className="text-xs mt-1">Claims appear here after your physician processes a clinical note.</p>
    </div>
  )
}

export default function PatientClaims() {
  const { user, ready } = useAuth()
  const [notes,   setNotes]   = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!ready || !user?.token) { setLoading(false); return }
    api.getMyNotes(user.token)
      .then(r => setNotes(r.notes || []))
      .catch(e => setError((e as Error).message))
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
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-light text-slate-100">My Claims</h1>
        <AIChip label="AI-analysed" size="md" />
      </div>

      {!!error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-6">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {notes.length === 0 ? <Empty /> : (
        <div className="space-y-4">
          {notes.map((note, i) => {
            const urgency     = (note.urgency as string) || 'routine'
            const physicianName = note.physician_name as string | undefined
            const aiSummary     = note.ai_summary as string | undefined
            const visitDate   = new Date(note.created_at as string).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
            })

            return (
              <div key={i} className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-500 font-mono mb-1">
                      {(note.id as string).slice(0, 8).toUpperCase()}…
                    </p>
                    <p className="text-base font-medium text-slate-100">
                      Visit on {visitDate}
                    </p>
                    {!!physicianName && (
                      <p className="text-xs text-slate-500 mt-0.5">Dr. {physicianName}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${
                    urgency === 'urgent'  ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    urgency === 'soon'    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-teal-500/10 text-teal-400 border-teal-500/20'
                  }`}>{urgency}</span>
                </div>

                {!!aiSummary && (
                  <div className="border-t border-slate-800 pt-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="w-4 h-4 text-teal-400" />
                      <p className="text-xs font-medium text-slate-400">AI Visit Summary</p>
                      <AIChip />
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{aiSummary}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  Processed {new Date(note.created_at as string).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
