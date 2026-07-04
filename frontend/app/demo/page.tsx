'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Check, Circle, FileText, RotateCcw, Cpu, Zap } from 'lucide-react'
import Nav from '@/components/Nav'
import PortalShell from '@/components/portals/PortalShell'
import SafetyConsole from '@/components/SafetyConsole'
import { useSynthesis, type AgentStatus, type StageInfo } from '@/lib/useSynthesis'
import { PIPELINE, SAMPLE_NOTES, type AgentDef } from '@/lib/synthure'
import { OPENMED_MODELS, type OpenMedStage } from '@/lib/openmed'
import { logRun } from '@/lib/runlog'
import { ShieldCheck, Download } from 'lucide-react'

function StatusDot({ status, accent }: { status: AgentStatus; accent: string }) {
  if (status === 'done')
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
        <Check className="h-4 w-4" style={{ color: accent }} />
      </span>
    )
  if (status === 'active')
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: accent }} />
      </span>
    )
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.04]">
      <Circle className="h-3 w-3 text-slate-600" />
    </span>
  )
}

function AgentRow({ agent, status, info }: { agent: AgentDef; status: AgentStatus; info?: StageInfo }) {
  return (
    <motion.div
      layout
      className="flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors"
      style={{
        borderColor: status === 'idle' ? 'rgba(255,255,255,0.05)' : `${agent.accent}33`,
        background: status === 'active' ? `${agent.accent}0d` : 'rgba(255,255,255,0.015)',
      }}
    >
      <StatusDot status={status} accent={agent.accent} />
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: status === 'idle' ? '#94a3b8' : '#e2e8f0' }}>
          {agent.name}
        </div>
        <div className="text-xs text-slate-500 truncate">
          {status === 'done' && info ? (
            <span className="text-slate-400">
              {info.detail}
              {info.ms > 0 && <span className="text-slate-600"> · {info.ms >= 1000 ? `${(info.ms / 1000).toFixed(1)}s` : `${info.ms}ms`}</span>}
            </span>
          ) : (
            agent.role
          )}
        </div>
      </div>
      {status === 'active' && (
        <span className="ml-auto text-[10px] uppercase tracking-wider shimmer-text font-medium">working</span>
      )}
    </motion.div>
  )
}

function ModelLoader({ progress }: { progress: Record<string, number> }) {
  const stages = Object.keys(OPENMED_MODELS) as OpenMedStage[]
  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] glass px-4 py-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
        <Download className="h-4 w-4 text-teal-300" />
        Downloading the OpenMed models into your browser (first run only, cached after)
      </div>
      <div className="space-y-2.5">
        {stages.map((st) => {
          const pct = progress[st] ?? 0
          const m = OPENMED_MODELS[st]
          return (
            <div key={st}>
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>{m.label}</span>
                <span>{pct >= 100 ? 'ready' : `${Math.round(pct)}% of ~${m.mb} MB`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        These models run entirely on your device. Your note is de identified locally before anything is sent for synthesis.
      </p>
    </div>
  )
}

const PHASES: { key: AgentDef['phase']; title: string }[] = [
  { key: 'intake', title: 'Understand the note' },
  { key: 'write', title: 'Write four tailored reports' },
  { key: 'verify', title: 'Verify & orchestrate' },
  { key: 'safeguard', title: 'Align & safeguard' },
]

export default function DemoPage() {
  const [note, setNote] = useState('')
  const { state, start, reset } = useSynthesis()
  const running = state.phase === 'running' || state.phase === 'loading-models'
  const hasExtraction = !!state.extraction

  const activeAgent = useMemo(
    () => PIPELINE.find((a) => a.id === state.activeId) ?? null,
    [state.activeId],
  )

  const ex = state.extraction

  // Append one record to the local continuous eval feed when a run completes.
  const loggedRef = useRef<object | null>(null)
  useEffect(() => {
    if (state.phase === 'complete' && ex && loggedRef.current !== ex) {
      loggedRef.current = ex
      logRun({
        ts: Date.now(),
        noteType: ex.noteType?.label ?? 'note',
        codes: ex.icd10.length,
        trainedCodes: ex.icd10.filter((c) => c.trained).length,
        readiness: ex.modelReadiness?.calibrated ?? null,
        reviewRisk: ex.reviewRisk,
        entities: ex.entities.length,
      })
    }
  }, [state.phase, ex])

  function onRun() {
    if (!note.trim() || running) return
    start(note.trim())
  }

  function onReset() {
    reset()
  }

  return (
    <div className="min-h-screen grid-bg">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #2dd4bf, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #818cf8, transparent 70%)' }} />
      </div>

      <Nav />

      <main className="relative max-w-6xl mx-auto px-6 pt-28 pb-24">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Synthesis Console</h1>
          <p className="text-slate-400 mt-2">
            Paste any clinical note. Watch the agents read it, then step into the four portals it produces, one tailored to each reader.
          </p>
        </div>

        {/* Note input */}
        <div className="rounded-2xl border border-white/[0.08] glass p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 uppercase tracking-wider">
            <FileText className="h-4 w-4" /> Clinical note
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={running}
            placeholder="e.g. 55yo M, BP 152/96, A1C 7.2%, LDL 165. Dx essential hypertension (I10), type 2 diabetes (E11.9). Started lisinopril 10mg QD, atorvastatin 20mg QHS. Ordered lipid panel (CPT 80061)…"
            className="w-full h-40 resize-none rounded-xl bg-[#070c18] border border-white/[0.07] p-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-400/50 font-mono leading-relaxed disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600 mr-1">Try:</span>
            {SAMPLE_NOTES.map((s) => (
              <button
                key={s.label}
                disabled={running}
                onClick={() => setNote(s.note)}
                className="text-xs rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-slate-400 hover:text-white hover:border-teal-400/40 transition-colors disabled:opacity-50"
              >
                {s.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {state.phase !== 'idle' && (
                <button
                  onClick={onReset}
                  className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white px-3 py-2 rounded-lg transition-colors"
                >
                  <RotateCcw className="h-4 w-4" /> Reset
                </button>
              )}
              <button
                onClick={onRun}
                disabled={!note.trim() || running}
                className="flex items-center gap-2 bg-teal-400 hover:bg-teal-300 disabled:opacity-40 disabled:cursor-not-allowed text-[#05070f] font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {running ? 'Agents at work…' : 'Run the agents'}
              </button>
            </div>
          </div>
        </div>

        {/* Active agent banner */}
        <AnimatePresence>
          {running && activeAgent && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.08] glass px-4 py-3"
            >
              <Cpu className="h-4 w-4 animate-pulse" style={{ color: activeAgent.accent }} />
              <span className="text-sm text-slate-300">
                <span className="font-medium" style={{ color: activeAgent.accent }}>{activeAgent.name}</span> is {activeAgent.role.toLowerCase()}…
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {state.phase === 'loading-models' && !state.error && <ModelLoader progress={state.modelProgress} />}

        {state.deid && !state.error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-start gap-3 rounded-xl border border-teal-400/20 bg-teal-400/[0.06] px-4 py-3"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-300" />
            <div className="text-[13px] leading-relaxed text-slate-300">
              <span className="font-medium text-teal-200">De identified on your device.</span>{' '}
              {state.deid.redactions > 0
                ? `The OpenMed PII model scrubbed ${state.deid.redactions} identifier${state.deid.redactions === 1 ? '' : 's'} (${state.deid.types.slice(0, 6).join(', ').toLowerCase()}) before the note left your browser.`
                : 'The OpenMed PII model found no identifiers to scrub. Only this de identified text leaves your browser.'}
            </div>
          </motion.div>
        )}

        {state.error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {state.error}
          </div>
        )}

        {/* Working layout */}
        {state.phase !== 'idle' && (
          <div className="mt-8 grid lg:grid-cols-[340px_1fr] gap-6 items-start">
            {/* Pipeline */}
            <div className="space-y-5 lg:sticky lg:top-24">
              {PHASES.map((phase) => (
                <div key={phase.key}>
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-2.5">{phase.title}</div>
                  <div className="space-y-2">
                    {PIPELINE.filter((a) => a.phase === phase.key).map((a) => (
                      <AgentRow key={a.id} agent={a} status={state.status[a.id]} info={state.stageInfo[a.id]} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Extraction facts */}
              {ex && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"
                >
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Synthure model predictions</div>
                  {ex.noteType && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-md border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-sky-200">
                        {ex.noteType.label} · {Math.round(ex.noteType.confidence * 100)}%
                      </span>
                      {ex.modelReadiness && (
                        <span
                          className={`rounded-md border px-2 py-0.5 ${ex.modelReadiness.band === 'ready' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : ex.modelReadiness.band === 'needs_work' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-rose-400/30 bg-rose-400/10 text-rose-300'}`}
                          title="Gradient boosted readiness model, isotonic calibrated"
                        >
                          readiness {Math.round(ex.modelReadiness.calibrated * 100)}%
                        </span>
                      )}
                      {ex.sections && ex.sections.length > 0 && (
                        <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-slate-400">
                          {ex.sections.length} sections
                        </span>
                      )}
                    </div>
                  )}
                  {ex.missing && ex.missing.length > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">Missing information detected</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ex.missing.map((mm) => (
                          <span key={mm.field} className="text-[11px] text-amber-100/80">
                            {mm.field.replace(/_/g, ' ')} ({Math.round(mm.probability * 100)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Entities and evidence</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {ex.entities.slice(0, 14).map((e, i) => (
                      <span key={i} className="text-[11px] rounded-md border border-teal-400/20 bg-teal-400/10 text-teal-200 px-2 py-0.5" title={e.source === 'openmed' ? 'OpenMed model output' : 'Verified verbatim span'}>
                        {e.text}
                        {typeof e.confidence === 'number' && <span className="ml-1 text-teal-400/70">{Math.round(e.confidence * 100)}%</span>}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/[0.03] py-2">
                      <div className="text-base font-semibold text-white">{ex.icd10.length + ex.cpt.length}</div>
                      <div className="text-[10px] text-slate-500">codes</div>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] py-2">
                      <div className="text-base font-semibold text-amber-400">{ex.readmissionRisk}%</div>
                      <div className="text-[10px] text-slate-500">readmit (CMS)</div>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] py-2">
                      <div className="text-base font-semibold text-teal-300">{ex.priorAuth.length}</div>
                      <div className="text-[10px] text-slate-500">prior auth</div>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
                    Readmission is the CMS HRRP published rate; prior authorization is looked up from published payer policy. No denial probability is shown, there is no claim outcome data to model one.
                  </p>
                </motion.div>
              )}

              {state.phase === 'complete' && ex && ex.icd10.some((c) => c.trained) && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wider text-emerald-300">Trained ICD coder</div>
                    <span className="text-[10px] text-emerald-400/70">retriever + reranker</span>
                  </div>
                  <div className="space-y-1.5">
                    {ex.icd10.filter((c) => c.trained).slice(0, 6).map((c) => (
                      <div key={c.code} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">{c.code}</span>
                          <span className="truncate text-slate-300">{c.label}</span>
                        </span>
                        {typeof c.modelScore === 'number' && (
                          <span className="shrink-0 tabular-nums text-[11px] text-emerald-300/80">{Math.round(c.modelScore * 100)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    Codes linked or confirmed by the trained bi encoder plus cross encoder, with the reranker&apos;s confidence. Each is revalidated against the CMS tabular.
                  </p>
                </div>
              )}

              {state.phase === 'complete' && ex && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Models in this run</div>
                  <div className="space-y-1">
                    {Object.entries(ex.models).map(([k, v]) => (
                      <div key={k} className="text-[11px] leading-relaxed">
                        <span className="text-slate-500">{k}: </span>
                        <span className="text-slate-400">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Portals / placeholder */}
            <div>
              {hasExtraction && state.extraction ? (
                <PortalShell
                  extraction={state.extraction}
                  reports={state.reports}
                  verification={state.verification}
                  synthesis={state.synthesis}
                  complete={state.phase === 'complete'}
                />
              ) : (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">Reading the note and opening the four portals…</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Alignment & safety layer */}
        {state.safety && (
          <div className="mt-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white">Alignment & safety</h2>
              <p className="mt-1 text-sm text-slate-400">
                Synthure is not just a chain of agents. Before anything reaches a portal, an alignment layer drawn from the safety
                literature checks every report against a clinical constitution, gates each action by autonomy tier, and escalates
                to a human when it is unsure.
              </p>
            </div>
            <SafetyConsole safety={state.safety} live={state.live} />
          </div>
        )}
      </main>
    </div>
  )
}
