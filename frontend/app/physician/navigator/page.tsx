'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { AIChip } from '@/components/shared/AIChip'
import { Compass, Send, Clock, CheckCircle, AlertTriangle } from 'lucide-react'

interface NavigatorResult {
  pipelines?: {
    jargon?: {
      data?: {
        summary?: string
        conditions?: { term: string; plain: string; source_doc_id: string }[]
        medications?: { name: string; purpose: string; instructions: string }[]
        followup?: string
        urgency?: string
      }
      entity_confidence?: number
      source?: string
      pipeline_trace?: { stage: string; duration_ms: number; confidence?: number }[]
    }
    insurance?: {
      recommendations?: { plan: string; match_score: number; reason: string }[]
      ai_insight?: { ai_insight: string; key_consideration: string; warning?: string }
      source?: string
    }
  }
  patient_id?: string
  physician?: string
}

// ── Demo-mode pipeline simulation ─────────────────────────────────────────────
function simulatePipeline(notes: string): NavigatorResult {
  const lower = notes.toLowerCase()

  // Extract entity hints from text
  const hasPneumonia  = lower.includes('pneumon') || lower.includes('consolidat') || lower.includes('crackle')
  const hasHTN        = lower.includes('hypertens') || lower.includes('htn') || lower.includes('blood pressure')
  const hasDiabetes   = lower.includes('diabet') || lower.includes('a1c') || lower.includes('glucose')
  const hasCOPD       = lower.includes('copd') || lower.includes('emphysema') || lower.includes('airflow')
  const hasCardiac    = lower.includes('cardiac') || lower.includes('heart') || lower.includes('tachycardi')
  const hasInflamm    = lower.includes('inflamm') || lower.includes('crp') || lower.includes('esr') || lower.includes('leukocyt')

  const conditions: { term: string; plain: string; source_doc_id: string }[] = []
  const medications: { name: string; purpose: string; instructions: string }[] = []

  if (hasPneumonia) {
    conditions.push({
      term: 'Community-acquired pneumonia (J18.9)',
      plain: 'Your lungs have an infection causing the air sacs to fill with fluid. The patchy shadow on your chest X-ray confirms inflammation in the lower right part of your lung.',
      source_doc_id: 'icd10_J18_9',
    })
    medications.push({
      name: 'Amoxicillin-clavulanate 875mg',
      purpose: 'Antibiotic to clear the bacterial lung infection',
      instructions: 'Take twice daily with food for 7 days. Do not skip doses even if you feel better early.',
    })
  }
  if (hasHTN || hasCardiac) {
    conditions.push({
      term: 'Essential hypertension (I10)',
      plain: 'Your heart is working harder than it should to pump blood. Over time this can strain your heart and blood vessels — which is why your doctor wants it treated.',
      source_doc_id: 'icd10_I10',
    })
    medications.push({
      name: 'Lisinopril 10mg',
      purpose: 'Relaxes your blood vessels so your heart doesn\'t have to work as hard',
      instructions: 'Take once every morning with or without food. Do not stop without talking to your doctor.',
    })
  }
  if (hasDiabetes) {
    conditions.push({
      term: 'Type 2 Diabetes Mellitus (E11.9)',
      plain: 'Your body isn\'t using insulin efficiently, causing blood sugar to run higher than normal. Your A1C shows your 3-month average blood sugar.',
      source_doc_id: 'icd10_E11_9',
    })
    medications.push({
      name: 'Metformin 500mg',
      purpose: 'Helps your body respond better to insulin and lowers blood sugar',
      instructions: 'Take twice daily with meals to reduce stomach upset.',
    })
  }
  if (hasInflamm && conditions.length === 0) {
    conditions.push({
      term: 'Acute inflammatory process',
      plain: 'Your blood tests show signs that your immune system is actively fighting something — your white blood cell count and inflammation markers are elevated.',
      source_doc_id: 'general_knowledge',
    })
  }

  // Fallback if nothing matched
  if (conditions.length === 0) {
    conditions.push({
      term: 'Clinical findings documented',
      plain: 'Your doctor has documented the findings from your visit. The details are being reviewed for the most appropriate next steps in your care.',
      source_doc_id: 'general_knowledge',
    })
  }

  const urgency = hasPneumonia || hasCardiac ? 'soon' : 'routine'
  const followup = hasPneumonia
    ? 'Return in 7–10 days for repeat chest X-ray to confirm clearing. Call immediately if fever rises above 39°C, breathing worsens, or you develop chest pain.'
    : hasHTN
    ? 'Follow up in 4 weeks. Get fasting bloodwork before that visit (nothing to eat for 8 hours before the blood draw).'
    : 'Follow up as directed. Contact your care team if symptoms worsen or you have questions about your medications.'

  const trace = [
    { stage: 'quality_gate',       duration_ms: 11,  confidence: 0.97 },
    { stage: 'entity_extraction',  duration_ms: 312, confidence: 0.94 },
    { stage: 'rag_retrieval',      duration_ms: 78,  confidence: 0.91 },
    { stage: 'denial_ml',          duration_ms: 19,  confidence: 0.82 },
    { stage: 'generation',         duration_ms: 834, confidence: 0.96 },
    { stage: 'citation_validation',duration_ms: 4,   confidence: 1.00 },
  ]

  return {
    pipelines: {
      jargon: {
        data: {
          summary: conditions.length > 0
            ? `Your visit covered ${conditions.length} condition${conditions.length > 1 ? 's' : ''}. ${urgency === 'soon' ? 'Follow-up is needed within the next 1–2 weeks.' : 'Your care plan includes routine monitoring and medication management.'}`
            : 'Your physician has documented your visit findings and will review next steps with you.',
          conditions,
          medications,
          followup,
          urgency,
        },
        entity_confidence: 0.94,
        source: 'demo-pipeline',
        pipeline_trace: trace,
      },
    },
    physician: 'Dr. Sarah Chen',
  }
}

// ── Urgency badge ─────────────────────────────────────────────────────────────
function UrgencyBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    urgent:  { label: 'Urgent',  cls: 'bg-red-500/10 text-red-400 border-red-500/30',  Icon: AlertTriangle },
    soon:    { label: 'Soon',    cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', Icon: Clock },
    routine: { label: 'Routine', cls: 'bg-teal-500/10 text-teal-400 border-teal-500/30', Icon: CheckCircle },
  }
  const { label, cls, Icon } = map[level] ?? map.routine
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function NavigatorPage() {
  const [notes, setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<NavigatorResult | null>(null)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      let raw: Record<string, unknown> | null = null
      try { raw = JSON.parse(localStorage.getItem('synthure_user') || '{}') } catch { raw = {} }
      const user = raw as Record<string, unknown>

      if (user?.demo) {
        // Demo mode — simulate pipeline locally
        await new Promise((r) => setTimeout(r, 1400))
        setResult(simulatePipeline(notes))
      } else {
        const out = await api.navigator({ notes }, user?.token as string) as NavigatorResult
        setResult(out)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pipeline error')
    } finally {
      setLoading(false)
    }
  }

  const jargon   = result?.pipelines?.jargon
  const jData    = jargon?.data
  const trace    = jargon?.pipeline_trace ?? []

  return (
    <div className="p-8 max-w-5xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Compass className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-light text-slate-100">Navigator</h1>
        <AIChip label="Multi-pipeline" size="md" />
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          className="w-full bg-[#0d1525] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500 resize-none"
          placeholder="Paste clinical note here… the jargon decoder, insurance matcher, and claim routing agents run in parallel."
          required
        />
        {error && (
          <div className="mt-2 flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !notes.trim()}
          className="mt-3 flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Running agents…' : 'Run Navigator'}
        </button>
      </form>

      {/* Results */}
      {result && jData && (
        <div className="grid grid-cols-3 gap-6">

          {/* Left: jargon output */}
          <div className="col-span-2 space-y-4">

            {/* Summary + urgency */}
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-medium text-slate-300">Visit Summary</h2>
                <AIChip />
                {jData.urgency && <UrgencyBadge level={jData.urgency} />}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{jData.summary}</p>
            </div>

            {/* Conditions */}
            {!!jData.conditions?.length && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-medium text-slate-300">Conditions Explained</h2>
                  <AIChip />
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

            {/* Medications */}
            {!!jData.medications?.length && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-medium text-slate-300">Medications</h2>
                  <AIChip />
                </div>
                <div className="space-y-4">
                  {jData.medications.map((m, i) => (
                    <div key={i} className="bg-[#0a1020] rounded-lg p-4 border border-slate-800">
                      <p className="text-sm font-medium text-indigo-300 mb-1">{m.name}</p>
                      <p className="text-xs text-slate-400 mb-2">{m.purpose}</p>
                      <p className="text-xs text-slate-500 italic">{m.instructions}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up */}
            {jData.followup && (
              <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
                <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Follow-Up Instructions</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{jData.followup}</p>
              </div>
            )}
          </div>

          {/* Right: pipeline trace */}
          <div className="space-y-4">
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">Agent Trace</h2>
              <div className="space-y-3">
                {trace.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400 truncate">
                          {step.stage.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-slate-600 font-mono flex-shrink-0">
                          {step.duration_ms}ms
                        </span>
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
                  <div className="text-2xl font-light text-white">
                    {jargon.entity_confidence.toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-600">biomedical-ner-all</div>
                </div>
              )}
            </div>

            {/* Tier 1 actions */}
            <div className="bg-[#0d1525] border border-slate-800 rounded-xl p-5">
              <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Tier 1 Actions Queued</h2>
              <div className="space-y-2">
                {['Prior auth filed', 'Claim staged', 'Patient education sent', 'Follow-up reminder set'].map((action) => (
                  <div key={action} className="flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle className="w-3 h-3 text-teal-400 flex-shrink-0" />
                    {action}
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
