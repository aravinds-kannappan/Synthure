'use client'

// The pipeline as a live graph, laid out by phase. Nodes light up from the real
// run state (status + stageInfo); the connectors between phases go hot once the
// upstream phase has fully completed. This is the centerpiece of the ops console.

import { Fragment } from 'react'
import { motion } from 'framer-motion'
import { PIPELINE } from '@/lib/synthure'
import type { AgentStatus, StageInfo } from '@/lib/useSynthesis'

const LIME = '#b6f400'

const PHASES = [
  { key: 'intake', label: 'INTAKE' },
  { key: 'write', label: 'WRITE // 4 AGENTS' },
  { key: 'verify', label: 'VERIFY' },
  { key: 'safeguard', label: 'SAFEGUARD' },
] as const

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

function Node({ id, name, accent, status, info }: {
  id: string; name: string; accent: string; status: AgentStatus; info?: StageInfo
}) {
  const active = status === 'active'
  const done = status === 'done'
  const color = status === 'idle' ? '#3f3f46' : accent
  return (
    <motion.div
      animate={active ? { boxShadow: [`0 0 0px ${accent}00`, `0 0 18px ${accent}66`, `0 0 0px ${accent}00`] } : { boxShadow: '0 0 0px transparent' }}
      transition={{ repeat: active ? Infinity : 0, duration: 1.4 }}
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: status === 'idle' ? 'rgba(255,255,255,0.08)' : `${accent}66`,
        background: active ? `${accent}14` : done ? `${accent}0a` : 'transparent',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm text-[9px] font-bold"
          style={{ color: status === 'idle' ? '#52525b' : accent, background: done ? `${accent}22` : 'transparent' }}
        >
          {done ? '✓' : active ? '›' : '·'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]" style={{ color: status === 'idle' ? '#71717a' : '#e4e4e7' }}>
          {name.toLowerCase()}
        </span>
        {info?.ms ? (
          <span className="flex-shrink-0 font-mono text-[10px] tabular-nums" style={{ color }}>{fmtMs(info.ms)}</span>
        ) : active ? (
          <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full" style={{ background: accent }} />
        ) : null}
      </div>
      {info?.detail && (
        <div className="mt-1 truncate pl-6 font-mono text-[10px] text-zinc-500">{info.detail}</div>
      )}
    </motion.div>
  )
}

export default function PipelineGraph({ status, stageInfo, activeId }: {
  status: Record<string, AgentStatus>
  stageInfo: Record<string, StageInfo>
  activeId: string | null
}) {
  const phaseDone = (key: string) => {
    const nodes = PIPELINE.filter((a) => a.phase === key)
    return nodes.length > 0 && nodes.every((a) => status[a.id] === 'done')
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {PHASES.map((ph, pi) => {
        const nodes = PIPELINE.filter((a) => a.phase === ph.key)
        const hot = phaseDone(ph.key)
        return (
          <Fragment key={ph.key}>
            <div className="flex flex-1 flex-col">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{ph.label}</span>
                <span className="h-px flex-1" style={{ background: hot ? `${LIME}55` : 'rgba(255,255,255,0.06)' }} />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {nodes.map((a) => (
                  <Node key={a.id} id={a.id} name={a.name} accent={a.accent} status={status[a.id] ?? 'idle'} info={stageInfo[a.id]} />
                ))}
              </div>
            </div>
            {pi < PHASES.length - 1 && (
              <div className="flex items-center justify-center py-1 lg:py-0">
                <motion.span
                  animate={hot ? { color: [LIME, '#ffffff', LIME], opacity: [0.6, 1, 0.6] } : { color: '#3f3f46', opacity: 1 }}
                  transition={{ repeat: hot ? Infinity : 0, duration: 1.6 }}
                  className="font-mono text-lg lg:rotate-0 rotate-90"
                >
                  ▸
                </motion.span>
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
