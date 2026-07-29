'use client'

// SYNTHURE // OPS. A full screen operations console, not a marketing scroll.
// The command bar runs a note; the center is a live pipeline graph and the four
// portals as live tiles; the rails carry the note, the extracted facts, the
// streaming backend trace, and the safety verdicts. It drives the same real
// engine (useSynthesis) as before, so every number and stage is genuine.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, RotateCcw, X, ArrowUpRight, Lock, ShieldCheck, Boxes } from 'lucide-react'
import { useSynthesis } from '@/lib/useSynthesis'
import {
  PIPELINE, SAMPLE_NOTES, STAKEHOLDERS, STAKEHOLDER_ORDER,
  type Stakeholder, type StakeholderReport,
} from '@/lib/synthure'
import { Gauge } from '@/components/Charts'
import PipelineGraph from '@/components/PipelineGraph'
import BackendConsole from '@/components/BackendConsole'
import LatencyWaterfall from '@/components/LatencyWaterfall'
import PortalShell from '@/components/portals/PortalShell'
import GuardrailPanel from '@/components/GuardrailPanel'
import HarnessPanel from '@/components/HarnessPanel'
import SafetyConsole from '@/components/SafetyConsole'
import { AnnotatedNote } from '@/components/DemoVisuals'
import { logRun } from '@/lib/runlog'

const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' })

const LIME = '#b6f400'
const ENT_COLOR: Record<string, string> = {
  DIAGNOSIS: '#818cf8', MEDICATION: '#a78bfa', SIGN_SYMPTOM: '#2dd4bf',
  LAB_VALUE: '#38bdf8', PROCEDURE: '#fbbf24', CODE: LIME,
}
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`)

function Readout({ label, value, tone = '#e4e4e7' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">{label}</span>
      <span className={`${grotesk.className} text-lg font-bold tabular-nums`} style={{ color: tone }}>{value}</span>
    </div>
  )
}

function PortalTile({ s, report, onOpen, disabled }: {
  s: Stakeholder; report?: StakeholderReport; onOpen: () => void; disabled: boolean
}) {
  const cfg = STAKEHOLDERS[s]
  const filled = !!report
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      className="group flex flex-col rounded-xl border p-4 text-left transition-colors disabled:cursor-default"
      style={{ borderColor: filled ? `${cfg.accent}66` : 'rgba(255,255,255,0.08)', background: filled ? `${cfg.accent}0d` : 'rgba(255,255,255,0.015)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg" style={{ color: cfg.accent }}>{cfg.glyph}</span>
        <span className={`${grotesk.className} text-sm font-bold text-white`}>{cfg.label}</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: filled ? cfg.accent : '#52525b' }}>
          {filled ? 'ready' : 'awaiting'}
          {!filled && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" style={{ background: '#52525b' }} />}
        </span>
      </div>
      {filled ? (
        <>
          <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-zinc-300">{report!.headline}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report!.metrics.slice(0, 2).map((m) => (
              <span key={m.label} className="rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-zinc-400">
                {m.label} <span className="text-white">{m.value}</span>
              </span>
            ))}
          </div>
          <span className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: cfg.accent }}>
            open portal <ArrowUpRight className="h-3 w-3" />
          </span>
        </>
      ) : (
        <p className="mt-2 font-mono text-[11px] text-zinc-600">{cfg.blurb.toLowerCase()}</p>
      )}
    </button>
  )
}

export default function OpsConsole() {
  const [note, setNote] = useState('')
  const [overlay, setOverlay] = useState<'portals' | 'safety' | null>(null)
  const { state, start, reset } = useSynthesis()
  const running = state.phase === 'running' || state.phase === 'loading-models'
  const complete = state.phase === 'complete'
  const ex = state.extraction

  const backendMs = useMemo(() => Object.values(state.stageInfo).reduce((a, s) => a + (s?.ms || 0), 0), [state.stageInfo])
  const stagesDone = useMemo(() => PIPELINE.filter((a) => state.status[a.id] === 'done').length, [state.status])
  const modelPct = useMemo(() => {
    const v = Object.values(state.modelProgress)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0
  }, [state.modelProgress])

  const loggedRef = useRef<object | null>(null)
  useEffect(() => {
    if (complete && ex && loggedRef.current !== ex) {
      loggedRef.current = ex
      logRun({
        ts: Date.now(), noteType: ex.noteType?.label ?? 'note', codes: ex.icd10.length,
        trainedCodes: ex.icd10.filter((c) => c.trained).length, readiness: ex.modelReadiness?.calibrated ?? null,
        reviewRisk: ex.reviewRisk, entities: ex.entities.length,
        guardrailScore: state.guardrails?.score ?? null, guardrailDecision: state.guardrails?.decision ?? null,
        guardrailFlags: state.guardrails?.flagged.map((f) => f.id) ?? [],
        harnessAction: state.harness?.action ?? null, riskTier: state.harness?.riskTier ?? null,
      })
    }
  }, [complete, ex, state.guardrails, state.harness])

  const statusLabel = state.error ? 'ERROR' : state.phase === 'loading-models' ? `LOADING ${modelPct}%` : running ? 'LIVE' : complete ? 'DONE' : 'IDLE'
  const statusColor = state.error ? '#f43f5e' : running ? LIME : complete ? '#34d399' : '#71717a'

  return (
    <div className={`${mono.className} flex h-[100dvh] flex-col overflow-hidden bg-[#08080b] text-zinc-200`}>
      <div className="pointer-events-none fixed inset-0 opacity-[0.4]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* ── command bar ─────────────────────────────────────────────────────── */}
      <header className="relative z-20 flex flex-shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 bg-[#0a0a0e]/90 px-4 py-2.5 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg" style={{ color: LIME }}>◈</span>
          <span className={`${grotesk.className} text-sm font-bold tracking-[0.16em] text-white`}>SYNTHURE</span>
          <span className="font-mono text-[10px] tracking-[0.3em] text-zinc-600">// OPS</span>
        </Link>
        <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.16em]" style={{ borderColor: `${statusColor}55`, color: statusColor }}>
          <span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse' : ''}`} style={{ background: statusColor }} />
          {statusLabel}
        </span>
        <div className="ml-auto flex items-center gap-5">
          <Readout label="stages" value={`${stagesDone}/${PIPELINE.length}`} />
          <Readout label="latency" value={backendMs > 0 ? fmtMs(backendMs) : '—'} tone="#a5b4fc" />
          <Readout label="codes" value={ex ? String(ex.icd10.length + ex.cpt.length) : '—'} tone={LIME} />
          <div className="hidden items-center gap-3 sm:flex">
            <Link href="/evals" className="font-mono text-[11px] text-zinc-500 hover:text-white">evals</Link>
            <Link href="/" className="font-mono text-[11px] text-zinc-500 hover:text-white">exit</Link>
          </div>
        </div>
      </header>

      {state.error && (
        <div className="relative z-20 flex-shrink-0 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 font-mono text-[12px] text-rose-300">
          {state.error}
        </div>
      )}

      {/* ── main grid ───────────────────────────────────────────────────────── */}
      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[330px_1fr_360px] lg:overflow-hidden">
        {/* left rail: note + facts */}
        <aside className="flex flex-col gap-4 overflow-y-auto border-white/10 p-4 lg:border-r">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Clinical note</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={running}
              placeholder="paste a clinical note, then RUN…"
              className="h-32 w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] leading-relaxed text-zinc-200 placeholder-zinc-600 focus:border-white/25 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {SAMPLE_NOTES.map((s) => (
                <button key={s.label} disabled={running} onClick={() => setNote(s.note)}
                  className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:text-white disabled:opacity-50">
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => note.trim() && !running && start(note.trim())}
                disabled={!note.trim() || running}
                className={`${grotesk.className} flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-black transition-all disabled:opacity-30`}
                style={{ background: LIME }}
              >
                <Play className="h-4 w-4" fill="black" /> {running ? 'RUNNING' : 'RUN'}
              </button>
              {state.phase !== 'idle' && (
                <button onClick={reset} className="rounded-lg border border-white/10 p-2.5 text-zinc-400 transition-colors hover:text-white">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {state.deid && (
            <div className="flex items-start gap-2 rounded-lg border border-teal-400/25 bg-teal-400/[0.06] p-3">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-teal-300" />
              <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
                {state.deid.redactions} scrubbed on device. raw note never left the browser.
              </p>
            </div>
          )}

          {ex && state.deid?.text && <AnnotatedNote text={state.deid.text} entities={ex.entities} />}

          {ex && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Extracted facts</div>
              <div className="flex flex-wrap gap-1.5">
                {ex.entities.slice(0, 18).map((e, i) => (
                  <span key={i} className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                    style={{ borderColor: `${ENT_COLOR[e.type] ?? '#71717a'}44`, color: ENT_COLOR[e.type] ?? '#a1a1aa' }}>
                    {e.text}{typeof e.confidence === 'number' && <span className="opacity-60"> {Math.round(e.confidence * 100)}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* center: graph + portal tiles */}
        <section className="flex flex-col gap-5 overflow-y-auto p-5">
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h1 className={`${grotesk.className} text-xl font-bold tracking-tight text-white`}>Pipeline</h1>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">one note · thirteen stages · four portals</span>
            </div>
            <PipelineGraph status={state.status} stageInfo={state.stageInfo} activeId={state.activeId} />
          </div>

          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className={`${grotesk.className} text-xl font-bold tracking-tight text-white`}>Portals</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">projections of one shared encounter</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {STAKEHOLDER_ORDER.map((s) => (
                <PortalTile key={s} s={s} report={state.reports[s]} disabled={!ex} onOpen={() => ex && setOverlay('portals')} />
              ))}
            </div>
          </div>
        </section>

        {/* right rail: backend trace + verdicts */}
        <aside className="flex flex-col gap-4 overflow-y-auto border-white/10 p-4 lg:border-l">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Backend trace</div>
            <BackendConsole status={state.status} stageInfo={state.stageInfo} activeId={state.activeId} running={running} complete={complete} />
          </div>

          {complete && <LatencyWaterfall stageInfo={state.stageInfo} />}

          {ex?.modelReadiness && (
            <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <Gauge value={ex.modelReadiness.calibrated} label="readiness" sub={ex.noteType?.label} tone="teal" size={96} />
              <div className="flex-1 font-mono text-[11px] text-zinc-400">
                <div>note type <span className="text-white">{ex.noteType?.label ?? 'n/a'}</span></div>
                <div>readmit <span className="text-amber-300">{ex.readmissionRisk}%</span> (cms)</div>
                <div>prior auth <span className="text-white">{ex.priorAuth.length}</span></div>
              </div>
            </div>
          )}

          {(state.guardrails || state.harness) && (
            <button onClick={() => setOverlay('safety')} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/25">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: LIME }} /> Safety verdict <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-zinc-600" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {state.guardrails && (
                  <div className="rounded border border-white/[0.06] p-2">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">guardrails</div>
                    <div className={`${grotesk.className} text-lg font-bold`} style={{ color: state.guardrails.decision === 'ship' ? '#34d399' : '#fbbf24' }}>
                      {Math.round(state.guardrails.score * 100)}%
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">{state.guardrails.decision}</div>
                  </div>
                )}
                {state.harness && (
                  <div className="rounded border border-white/[0.06] p-2">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">harness</div>
                    <div className={`${grotesk.className} text-lg font-bold text-white`}>{state.harness.action.replace('_', ' ')}</div>
                    <div className="font-mono text-[10px] text-zinc-500">risk {state.harness.riskTier}</div>
                  </div>
                )}
              </div>
            </button>
          )}

          {!running && !complete && !state.error && (
            <div className="rounded-lg border border-dashed border-white/10 p-4 text-center font-mono text-[11px] text-zinc-600">
              <Boxes className="mx-auto mb-2 h-5 w-5 text-zinc-700" />
              paste a note and hit RUN to watch the backend execute
            </div>
          )}
        </aside>
      </main>

      {/* ── overlays ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {overlay && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-[#08080b]/95 backdrop-blur"
          >
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
              <span className={`${grotesk.className} text-sm font-bold tracking-[0.14em] text-white`}>
                {overlay === 'portals' ? 'FOUR PORTALS // ONE ENCOUNTER' : 'SAFETY REPORT'}
              </span>
              <button onClick={() => setOverlay(null)} className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:text-white">
                close <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {overlay === 'portals' && state.extraction && (
                <PortalShell
                  extraction={state.extraction}
                  reports={state.reports}
                  verification={state.verification}
                  synthesis={state.synthesis}
                  complete={complete}
                />
              )}
              {overlay === 'safety' && (
                <div className="mx-auto max-w-4xl space-y-6">
                  {state.harness && <HarnessPanel report={state.harness} />}
                  {state.guardrails && <GuardrailPanel report={state.guardrails} />}
                  {state.safety && <SafetyConsole safety={state.safety} live={state.live} />}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
