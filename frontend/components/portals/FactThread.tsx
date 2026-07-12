'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { X, GitBranch, ArrowRight, Zap, Megaphone } from 'lucide-react'
import { STAKEHOLDERS } from '@/lib/synthure'
import { PORTALS, portalLabel, provenanceFor } from '@/lib/encounter'
import { buildFacts } from '@/lib/facts'
import { useEncounter } from './EncounterContext'

const timeAgo = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.round(s / 60)}m ago`
}

// One fact, shown as each of the four readers actually sees it, plus the chain of
// events that produced it. This is the seam that makes the portals feel like one
// system: click a code, a dollar, or a check anywhere and see where else it lives
// and why it is that value.
export default function FactThread() {
  const { state, d, focusFact, setFocusFact } = useEncounter()
  const facts = buildFacts(state, d)
  const fact = focusFact ? facts[focusFact] : null
  const provenance = fact ? provenanceFor(state, fact.id) : []

  return (
    <AnimatePresence>
      {fact && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFocusFact(null)}
            className="fixed inset-0 z-[60] bg-black/50"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-white/10 bg-[#080d18]"
          >
            <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">
                  <GitBranch className="h-4 w-4 text-teal-300" />
                </span>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Follow this fact</div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    {fact.title}
                    {fact.code && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-teal-300">{fact.code}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => setFocusFact(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="text-[12px] leading-relaxed text-slate-400">
                The same fact as each reader sees it. One shared truth, four projections.
              </div>

              {/* The four lenses */}
              <div className="space-y-2">
                {PORTALS.map((p) => {
                  const cfg = STAKEHOLDERS[p]
                  const lens = fact.lenses[p]
                  return (
                    <div key={p} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3" style={{ borderLeft: `2px solid ${cfg.accent}` }}>
                      <div className="flex items-center gap-2">
                        <span className="text-base" style={{ color: cfg.accent }}>{cfg.glyph}</span>
                        <span className="text-[13px] font-semibold text-white">{cfg.label}</span>
                        <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${cfg.accent}18`, color: cfg.accent }}>{lens.label}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{lens.detail}</p>
                    </div>
                  )
                })}
              </div>

              {/* Provenance */}
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Provenance</div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-[12px] leading-relaxed text-slate-400">
                  <span className="text-slate-300">Source:</span> {fact.source}
                </div>
                <div className="mt-2 space-y-1.5">
                  {provenance.length === 0 && (
                    <p className="px-1 text-[12px] text-slate-500">No portal actions have touched this fact yet. Its value comes straight from the extraction and its published source above.</p>
                  )}
                  {provenance.map((e) => {
                    const fromCfg = e.from === 'system' ? null : STAKEHOLDERS[e.from]
                    return (
                      <div key={e.id} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          {e.kind === 'message' ? <Megaphone className="h-3 w-3" style={{ color: fromCfg?.accent }} /> : e.from === 'system' ? <Zap className="h-3 w-3 text-slate-400" /> : <ArrowRight className="h-3 w-3" style={{ color: fromCfg?.accent }} />}
                          <span className="font-medium" style={{ color: fromCfg?.accent ?? '#94a3b8' }}>{portalLabel(e.from)}</span>
                          <span className="text-slate-500">→ {e.to.map(portalLabel).join(', ')}</span>
                          <span className="ml-auto text-slate-500">{timeAgo(e.ts)}</span>
                        </div>
                        <div className="mt-1 text-[12px] font-medium text-slate-200">{e.title}</div>
                        {e.body && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{e.body}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
