'use client'

// Per stage latency from the real run. Bars are stage durations, not a cumulative
// timeline: the four writers run in parallel, so a strict timeline would imply a
// sequencing that did not happen. Longest first, so the cost centers are obvious.

import { motion } from 'framer-motion'
import { PIPELINE } from '@/lib/synthure'
import type { StageInfo } from '@/lib/useSynthesis'

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

export default function LatencyWaterfall({ stageInfo }: { stageInfo: Record<string, StageInfo> }) {
  const rows = PIPELINE
    .map((a) => ({ name: a.name.toLowerCase(), accent: a.accent, ms: stageInfo[a.id]?.ms ?? 0 }))
    .filter((r) => r.ms > 0)
    .sort((a, b) => b.ms - a.ms)

  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.ms))
  const total = rows.reduce((a, r) => a + r.ms, 0)

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Per stage latency</div>
        <div className="font-mono text-[11px] text-slate-500">
          sum <span className="text-indigo-300">{fmtMs(total)}</span> across {rows.length} stages
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-[150px] flex-shrink-0 truncate text-right font-mono text-[11px] text-slate-400">{r.name}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-white/[0.04]">
              <motion.div
                className="h-full rounded"
                style={{ background: r.accent }}
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.max(3, (r.ms / max) * 100)}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.05, ease: 'easeOut' }}
              />
            </div>
            <span className="w-14 flex-shrink-0 text-right font-mono text-[11px] tabular-nums" style={{ color: r.accent }}>{fmtMs(r.ms)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
        Durations are per stage, streamed live from the pipeline. On device stages run in your browser; the writers run in parallel on the edge function.
      </p>
    </div>
  )
}
