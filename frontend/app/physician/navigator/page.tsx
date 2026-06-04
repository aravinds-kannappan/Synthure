'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { AIChip } from '@/components/shared/AIChip'
import { Compass, Send } from 'lucide-react'

interface NavigatorResult {
  pipelines?: {
    jargon?: unknown
    insurance?: unknown
    [key: string]: unknown
  }
}

export default function NavigatorPage() {
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<NavigatorResult | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = JSON.parse(localStorage.getItem('synthure_user') || '{}')
      const out = await api.navigator({ notes }, user.token) as NavigatorResult
      setResult(out)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pipeline error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Compass className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-light text-slate-100">Navigator</h1>
        <AIChip label="Multi-pipeline" size="md" />
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          className="w-full bg-[#0d1525] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 resize-none"
          placeholder="Paste clinical note here… (jargon decoder, insurance matcher, claim routing run in parallel)"
          required
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <button
          type="submit"
          disabled={loading || !notes.trim()}
          className="mt-3 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Running pipelines…' : 'Run Navigator'}
        </button>
      </form>

      {result && (
        <div className="space-y-4">
          {!!result.pipelines?.jargon && (
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-medium text-slate-300">Jargon Decoder</h2>
                <AIChip />
              </div>
              <pre className="text-xs text-slate-400 overflow-auto">
                {JSON.stringify(result.pipelines.jargon, null, 2)}
              </pre>
            </div>
          )}
          {!!result.pipelines?.insurance && (
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-medium text-slate-300">Insurance Matcher</h2>
                <AIChip />
              </div>
              <pre className="text-xs text-slate-400 overflow-auto">
                {JSON.stringify(result.pipelines.insurance, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
