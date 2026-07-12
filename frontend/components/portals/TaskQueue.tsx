'use client'

import { motion } from 'framer-motion'
import { Inbox as InboxIcon, Check, ArrowUpRight, CircleAlert } from 'lucide-react'
import { STAKEHOLDERS } from '@/lib/synthure'
import { type Portal } from '@/lib/encounter'
import { buildTasks, openTasksFor } from '@/lib/tasks'
import { useEncounter } from './EncounterContext'

// The work this portal owns, handed off from another portal. Resolving a task
// dispatches the same underlying action the portal already supports, so the fix
// ripples across all four portals through derive().
export default function TaskQueue({ portal, accent }: { portal: Portal; accent: string }) {
  const { state, d, dispatch, setFocusFact } = useEncounter()
  const tasks = openTasksFor(buildTasks(state, d), portal)

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <InboxIcon className="h-4 w-4" style={{ color: accent }} /> Task queue
        <span className="ml-auto font-normal normal-case text-[11px] text-slate-400">{tasks.length} open</span>
      </div>
      <div className="space-y-1.5 p-3">
        {tasks.length === 0 && (
          <p className="px-1 py-2 text-[13px] text-slate-500">Nothing to action. Handoffs from the other portals land here.</p>
        )}
        {tasks.map((t) => {
          const fromCfg = STAKEHOLDERS[t.raisedBy]
          return (
            <motion.div key={t.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5 text-[11px]">
                <ArrowUpRight className="h-3 w-3" style={{ color: fromCfg.accent }} />
                <span className="text-slate-500">handed off by</span>
                <span className="font-medium" style={{ color: fromCfg.accent }}>{fromCfg.label}</span>
                {t.raised && <span className="ml-auto rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">live</span>}
              </div>
              <button onClick={() => setFocusFact(t.factId)} className="mt-1 text-left text-[13px] font-medium text-slate-200 hover:text-white">
                {t.title}
              </button>
              <p className="mt-0.5 text-[12px] leading-snug text-slate-400">{t.detail}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: accent, opacity: 0.75 }}>{t.source}</p>
              <div className="mt-2 flex items-center gap-2">
                {t.action ? (
                  <button
                    onClick={() => t.action && dispatch(t.action)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors"
                    style={{ background: accent, color: '#05070f' }}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve & clear
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
                    <CircleAlert className="h-3.5 w-3.5" /> Resolve in the owning portal or off platform
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
