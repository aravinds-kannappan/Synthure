'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Check, Circle, FileText, RotateCcw, Cpu, Zap } from 'lucide-react'
import Nav from '@/components/Nav'
import PortalShell from '@/components/portals/PortalShell'
import SafetyConsole from '@/components/SafetyConsole'
import { useSynthesis, type AgentStatus } from '@/lib/useSynthesis'
import { PIPELINE, SAMPLE_NOTES, type AgentDef } from '@/lib/synthure'

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

function AgentRow({ agent, status }: { agent: AgentDef; status: AgentStatus }) {
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
        <div className="text-xs text-slate-500 truncate">{agent.role}</div>
      </div>
      {status === 'active' && (
        <span className="ml-auto text-[10px] uppercase tracking-wider shimmer-text font-medium">working</span>
      )}
    </motion.div>
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
  const running = state.phase === 'running'
  const hasExtraction = !!state.extraction

  const activeAgent = useMemo(
    () => PIPELINE.find((a) => a.id === state.activeId) ?? null,
    [state.activeId],
  )

  const ex = state.extraction

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
                      <AgentRow key={a.id} agent={a} status={state.status[a.id]} />
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
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">Extracted facts</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {ex.entities.slice(0, 14).map((e, i) => (
                      <span key={i} className="text-[11px] rounded-md border border-teal-400/20 bg-teal-400/10 text-teal-200 px-2 py-0.5">
                        {e.text}
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

              {state.phase === 'complete' &&
                (state.live ? (
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Live: Claude read the note to extract entities and wrote the four reports. Codes were validated; readmission is the CMS published rate and prior authorization is sourced from payer policy.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Offline Synthure engine: a rules based extractor (regex plus a medication dictionary), not a trained model. Set <span className="font-mono text-slate-500">ANTHROPIC_API_KEY</span> for live Claude extraction and writing.
                  </p>
                ))}
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
