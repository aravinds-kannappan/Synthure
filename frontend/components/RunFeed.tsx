'use client'

import { useEffect, useState } from 'react'
import { getRuns, clearRuns, type RunRecord } from '@/lib/runlog'
import { Sparkline } from '@/components/Charts'

export default function RunFeed() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  useEffect(() => setRuns(getRuns()), [])

  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6 text-center text-sm text-slate-500">
        Run the demo and your notes accumulate here as a local evaluation feed: codes coded, trained coder share, and readiness across every note you process. Stored only in this browser.
      </div>
    )
  }

  const n = runs.length
  const avg = (f: (r: RunRecord) => number) => runs.reduce((a, r) => a + f(r), 0) / n
  const avgCodes = avg((r) => r.codes)
  const trainedShare = avg((r) => (r.codes ? r.trainedCodes / r.codes : 0))
  const readRuns = runs.filter((r) => r.readiness != null)
  const avgReady = readRuns.length ? readRuns.reduce((a, r) => a + (r.readiness as number), 0) / readRuns.length : null
  const readSeries = readRuns.map((r) => (r.readiness as number) * 100)

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Your demo runs</div>
          <div className="text-[11px] text-slate-500">{n} note{n === 1 ? '' : 's'} processed in this browser</div>
        </div>
        <button onClick={() => { clearRuns(); setRuns([]) }} className="text-[11px] text-slate-500 transition-colors hover:text-slate-300">clear</button>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-4">
        <div><div className="text-2xl font-bold text-teal-400">{avgCodes.toFixed(1)}</div><div className="text-[11px] text-slate-500">avg codes / note</div></div>
        <div><div className="text-2xl font-bold text-emerald-400">{Math.round(trainedShare * 100)}%</div><div className="text-[11px] text-slate-500">trained coder share</div></div>
        <div><div className="text-2xl font-bold text-violet-400">{avgReady != null ? `${Math.round(avgReady * 100)}%` : 'n/a'}</div><div className="text-[11px] text-slate-500">avg readiness</div></div>
      </div>
      {readSeries.length >= 2 && (
        <div className="mb-4">
          <div className="mb-1 text-[11px] text-slate-500">readiness across your runs</div>
          <Sparkline points={readSeries} tone="violet" width={320} height={44} />
        </div>
      )}
      <div className="space-y-1">
        {runs.slice(-6).reverse().map((r, i) => (
          <div key={i} className="flex items-center justify-between text-[12px]">
            <span className="text-slate-400">{r.noteType || 'note'}</span>
            <span className="text-slate-500">{r.codes} codes · {r.trainedCodes} trained{r.readiness != null ? ` · ${Math.round(r.readiness * 100)}% ready` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
