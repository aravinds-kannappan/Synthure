'use client'

import { Fragment, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, Loader2 } from 'lucide-react'
import { PIPELINE, type Entity } from '@/lib/synthure'
import type { AgentStatus } from '@/lib/useSynthesis'

const ENT_COLOR: Record<string, string> = {
  DIAGNOSIS: '#818cf8',
  MEDICATION: '#a78bfa',
  SIGN_SYMPTOM: '#2dd4bf',
  LAB_VALUE: '#38bdf8',
  PROCEDURE: '#fbbf24',
}
const ENT_LABEL: Record<string, string> = {
  DIAGNOSIS: 'diagnosis',
  MEDICATION: 'medication',
  SIGN_SYMPTOM: 'symptom',
  LAB_VALUE: 'lab',
  PROCEDURE: 'procedure',
}

// Render the de-identified note with the extracted entities highlighted in place,
// so the reader can see exactly what the on-device models found and where. Uses
// the real character offsets from the extraction; overlaps are skipped.
export function AnnotatedNote({ text, entities }: { text: string; entities: Entity[] }) {
  const valid = entities
    .filter((e) => typeof e.start === 'number' && typeof e.end === 'number' && (e.end as number) > (e.start as number) && (e.end as number) <= text.length)
    .sort((a, b) => (a.start as number) - (b.start as number))

  const segs: { start: number; end: number; type: string }[] = []
  let last = -1
  for (const e of valid) {
    if ((e.start as number) < last) continue // skip overlapping spans
    segs.push({ start: e.start as number, end: e.end as number, type: e.type })
    last = e.end as number
  }

  const parts: ReactNode[] = []
  let cursor = 0
  segs.forEach((s, i) => {
    if (s.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, s.start)}</span>)
    const c = ENT_COLOR[s.type] ?? '#94a3b8'
    parts.push(
      <mark key={`m${i}`} className="rounded px-0.5" style={{ background: `${c}22`, color: c, borderBottom: `1px solid ${c}66` }}>
        {text.slice(s.start, s.end)}
      </mark>,
    )
    cursor = s.end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)

  const present = [...new Set(segs.map((s) => s.type))]

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#070c18] p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        <span>De identified note, annotated by the models</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {present.map((t) => (
            <span key={t} className="flex items-center gap-1" style={{ color: ENT_COLOR[t] ?? '#94a3b8' }}>
              <span className="h-2 w-2 rounded-sm" style={{ background: ENT_COLOR[t] ?? '#94a3b8' }} />
              {ENT_LABEL[t] ?? t.toLowerCase()}
            </span>
          ))}
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-7 text-slate-300">{parts}</div>
    </div>
  )
}

// A compact horizontal flow of the whole pipeline, lighting up stage by stage.
export function PipelineFlow({ status, activeId }: { status: Record<string, AgentStatus>; activeId: string | null }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-3">
      {PIPELINE.map((a, i) => {
        const st = status[a.id] ?? 'idle'
        const done = st === 'done'
        const active = st === 'active' || a.id === activeId
        return (
          <Fragment key={a.id}>
            <div className="flex flex-shrink-0 flex-col items-center gap-1" title={a.name}>
              <motion.span
                className="flex h-7 w-7 items-center justify-center rounded-full border"
                animate={active ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ repeat: active ? Infinity : 0, duration: 1.1 }}
                style={{
                  borderColor: done || active ? a.accent : 'rgba(255,255,255,0.12)',
                  background: active ? `${a.accent}22` : done ? `${a.accent}14` : 'transparent',
                }}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" style={{ color: a.accent }} />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: a.accent }} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                )}
              </motion.span>
              <span className="max-w-[52px] text-center text-[8px] leading-tight text-slate-500">{a.name.split(' ')[0]}</span>
            </div>
            {i < PIPELINE.length - 1 && (
              <span className="h-px w-4 flex-shrink-0" style={{ background: done ? a.accent : 'rgba(255,255,255,0.1)' }} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
