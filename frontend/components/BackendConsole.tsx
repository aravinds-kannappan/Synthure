'use client'

// The backend, made visible. A terminal style trace of the real pipeline: every
// stage, where it runs, the model behind it, and the actual latency streamed
// from the synthesize route. Nothing here is decorative; each row is driven by
// the same state the pipeline emits (status + stageInfo), so a row only shows a
// duration once that stage actually reported one.

import { motion } from 'framer-motion'
import { PIPELINE } from '@/lib/synthure'
import type { AgentStatus, StageInfo } from '@/lib/useSynthesis'

// The model behind each stage on the standard lane, written the way the rest of
// the product writes model names (no hyphens). The writers escalate to Sonnet on
// the frontier lane; the exact per run models are also listed in "Models in this
// run" below the trace.
const MODEL_BY_STAGE: Record<string, string> = {
  deid: 'openmed pii clinicale5 33m',
  ner: 'openmed tinymed 65m',
  classify: 'synthure note type + sections',
  rag: 'synthure reranker + icd index',
  risk: 'synthure readiness gbm',
  patient: 'claude haiku 4.5',
  physician: 'claude haiku 4.5',
  hospital: 'claude haiku 4.5',
  employer: 'claude haiku 4.5',
  verify: 'claude sonnet 4.6',
  synth: 'claude sonnet 4.6',
  critic: 'claude sonnet 4.6',
  gate: 'deterministic',
}

// Where each stage actually executes.
const WHERE_BY_STAGE: Record<string, 'browser' | 'edge'> = {
  deid: 'browser', ner: 'browser',
  classify: 'edge', rag: 'edge', risk: 'edge',
  patient: 'edge', physician: 'edge', hospital: 'edge', employer: 'edge',
  verify: 'edge', synth: 'edge', critic: 'edge', gate: 'edge',
}

const WHERE_COLOR: Record<string, string> = { browser: '#2dd4bf', edge: '#818cf8' }

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

export default function BackendConsole({
  status, stageInfo, activeId, running, complete,
}: {
  status: Record<string, AgentStatus>
  stageInfo: Record<string, StageInfo>
  activeId: string | null
  running: boolean
  complete: boolean
}) {
  const totalMs = Object.values(stageInfo).reduce((a, s) => a + (s?.ms || 0), 0)
  const done = PIPELINE.filter((a) => status[a.id] === 'done').length

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#04060d] shadow-2xl shadow-black/40">
      {/* title bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 font-mono text-[11px] text-slate-500">synthure backend</span>
        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">POST /api/synthesize</span>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-slate-500">
          <span>{done}/{PIPELINE.length} stages</span>
          {(complete || totalMs > 0) && <span className="text-slate-600">·</span>}
          {(complete || totalMs > 0) && <span className="text-indigo-300">{fmtMs(totalMs)}</span>}
          {running && (
            <span className="flex items-center gap-1 text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> streaming
            </span>
          )}
        </span>
      </div>

      {/* trace */}
      <div className="max-h-[420px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
        {PIPELINE.map((a) => {
          const st = status[a.id] ?? 'idle'
          const inf = stageInfo[a.id]
          const active = st === 'active' || a.id === activeId
          const where = WHERE_BY_STAGE[a.id]
          const rowColor = st === 'idle' ? '#334155' : a.accent
          return (
            <motion.div
              key={a.id}
              initial={false}
              animate={{ opacity: st === 'idle' ? 0.45 : 1 }}
              className="flex items-baseline gap-2 py-[3px]"
            >
              {/* status glyph */}
              <span className="w-3 flex-shrink-0 text-center" style={{ color: rowColor }}>
                {st === 'done' ? '✓' : st === 'active' ? '›' : '·'}
              </span>
              {/* stage name */}
              <span className="w-[150px] flex-shrink-0 truncate" style={{ color: rowColor }}>
                {a.name.toLowerCase()}
              </span>
              {/* where */}
              <span
                className="hidden w-[52px] flex-shrink-0 rounded px-1 text-center text-[9px] uppercase tracking-wider sm:inline-block"
                style={{ color: WHERE_COLOR[where], background: `${WHERE_COLOR[where]}14` }}
              >
                {where}
              </span>
              {/* model */}
              <span className="hidden w-[190px] flex-shrink-0 truncate text-slate-500 md:inline-block">
                {MODEL_BY_STAGE[a.id]}
              </span>
              {/* detail */}
              <span className="min-w-0 flex-1 truncate text-slate-500">
                {st === 'idle' ? 'queued' : inf?.detail ?? (active ? 'working' : '')}
                {active && <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-slate-400" />}
              </span>
              {/* latency */}
              <span className="ml-auto flex-shrink-0 tabular-nums" style={{ color: inf?.ms ? a.accent : '#475569' }}>
                {inf?.ms ? fmtMs(inf.ms) : ''}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
