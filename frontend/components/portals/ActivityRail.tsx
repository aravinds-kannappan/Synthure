'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Radio } from 'lucide-react'
import { STAKEHOLDERS } from '@/lib/synthure'
import { PORTALS, portalLabel } from '@/lib/encounter'
import { useEncounter } from './EncounterContext'

const timeAgo = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.round(s / 60)}m ago`
}

// A slim, always visible shared timeline. It shows the latest cross portal event
// and which portals have recently acted, so every portal reflects the same live
// story instead of hiding it in a per portal inbox. "Recently active" is derived
// from real events, not a fabricated presence signal.
export default function ActivityRail() {
  const { state } = useEncounter()
  const latest = state.events[0]
  const recentActors = new Set(state.events.slice(0, 5).map((e) => e.from).filter((f) => f !== 'system'))

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
        <Radio className="h-3.5 w-3.5" />
        Live
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {latest && (
            <motion.div
              key={latest.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="font-medium" style={{ color: latest.from === 'system' ? '#94a3b8' : STAKEHOLDERS[latest.from].accent }}>
                {portalLabel(latest.from)}
              </span>
              <span className="truncate text-slate-300">{latest.kind === 'message' ? latest.body : latest.title}</span>
              <span className="ml-auto flex-shrink-0 text-slate-500">{timeAgo(latest.ts)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="hidden items-center gap-1 sm:flex" title="Recently active portals">
        {PORTALS.map((p) => {
          const cfg = STAKEHOLDERS[p]
          const on = recentActors.has(p)
          return (
            <span
              key={p}
              className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition-opacity"
              style={{ background: on ? `${cfg.accent}22` : 'transparent', color: cfg.accent, opacity: on ? 1 : 0.35 }}
            >
              {cfg.glyph}
            </span>
          )
        })}
      </div>
    </div>
  )
}
