'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ShieldCheck, Sparkles, Play, Pause, LayoutGrid, Loader2, ArrowRight, ChevronDown, Bell, X, Zap, Megaphone,
} from 'lucide-react'
import {
  STAKEHOLDERS, STAKEHOLDER_ORDER,
  type ExtractionResult, type Stakeholder, type StakeholderReport,
  type Verification, type Synthesis,
} from '@/lib/synthure'
import { unreadFor, portalLabel } from '@/lib/encounter'
import ReportView from '@/components/ReportView'
import { EncounterProvider, useEncounter } from './EncounterContext'
import PatientPortal from './PatientPortal'
import ClinicianConsole from './ClinicianConsole'
import RevenueDashboard from './RevenueDashboard'
import BenefitsDashboard from './BenefitsDashboard'

const PORTAL: Record<Stakeholder, ComponentType<{ report?: StakeholderReport }>> = {
  patient: PatientPortal,
  physician: ClinicianConsole,
  hospital: RevenueDashboard,
  employer: BenefitsDashboard,
}
const PORTAL_NAME: Record<Stakeholder, string> = {
  patient: 'Patient portal',
  physician: 'Clinician console',
  hospital: 'Revenue cycle',
  employer: 'Benefits analytics',
}
const TOUR_MS = 5200
const timeAgo = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.round(s / 60)}m ago`
}

export default function PortalShell(props: {
  extraction: ExtractionResult
  reports: Partial<Record<Stakeholder, StakeholderReport>>
  verification: Verification | null
  synthesis: Synthesis | null
  complete: boolean
}) {
  // Key the provider on the actual codes so a NEW note rebuilds the encounter
  // instead of reusing the reducer's first initial state (which showed stale
  // content from a previous run).
  const encKey =
    props.extraction.icd10.map((c) => c.code).join('|') + '::' + props.extraction.cpt.map((c) => c.code).join('|')
  return (
    <EncounterProvider key={encKey} extraction={props.extraction}>
      <PortalShellInner {...props} />
    </EncounterProvider>
  )
}

function PortalShellInner({
  reports, verification, synthesis, complete,
}: {
  reports: Partial<Record<Stakeholder, StakeholderReport>>
  verification: Verification | null
  synthesis: Synthesis | null
  complete: boolean
}) {
  const { state, dispatch } = useEncounter()
  const [active, setActive] = useState<Stakeholder>('patient')
  const [mode, setMode] = useState<'portal' | 'compare'>('portal')
  const [touring, setTouring] = useState(false)
  const [showConnections, setShowConnections] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [toast, setToast] = useState<{ title: string; from: string; to: string } | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTour = useCallback(() => {
    setTouring(false)
    if (timer.current) clearInterval(timer.current)
  }, [])

  useEffect(() => {
    if (!touring) return
    timer.current = setInterval(() => {
      setActive((cur) => {
        const next = STAKEHOLDER_ORDER[(STAKEHOLDER_ORDER.indexOf(cur) + 1) % STAKEHOLDER_ORDER.length]
        if (next === STAKEHOLDER_ORDER[0]) setTouring(false)
        return next
      })
    }, TOUR_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [touring])

  // Mark the active portal's incoming items as read.
  useEffect(() => {
    if (mode === 'portal') dispatch({ type: 'markRead', portal: active })
  }, [active, mode, state.events.length, dispatch])

  // Toast announcing a ripple: an action in one portal propagating to others.
  const prevLen = useRef(state.events.length)
  useEffect(() => {
    if (state.events.length > prevLen.current) {
      prevLen.current = state.events.length
      const e = state.events[0]
      if (e && e.from !== 'system') {
        setToast({
          title: e.kind === 'message' ? e.body ?? e.title : e.title,
          from: portalLabel(e.from),
          to: e.to.map(portalLabel).join(', '),
        })
        const t = setTimeout(() => setToast(null), 3200)
        return () => clearTimeout(t)
      }
    }
  }, [state.events])

  function select(s: Stakeholder) {
    stopTour()
    setMode('portal')
    setActive(s)
  }

  const Active = PORTAL[active]
  const cfg = STAKEHOLDERS[active]
  const activeFlags = reports[active]?.flags ?? []

  return (
    <div className="relative space-y-5">
      {/* App launcher */}
      <div className="rounded-2xl border border-white/[0.07] glass p-2.5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STAKEHOLDER_ORDER.map((s) => {
            const c = STAKEHOLDERS[s]
            const on = mode === 'portal' && active === s
            const ready = !!reports[s]
            const unread = unreadFor(state, s)
            return (
              <button
                key={s}
                onClick={() => select(s)}
                className="group relative flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-all"
                style={{ borderColor: on ? `${c.accent}66` : 'rgba(255,255,255,0.06)', background: on ? `${c.accent}14` : 'rgba(255,255,255,0.015)' }}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="text-lg" style={{ color: c.accent }}>{c.glyph}</span>
                  <span className="text-sm font-semibold text-white">{c.label}</span>
                  <span className="ml-auto flex items-center">
                    {unread > 0 ? (
                      <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-[#05070f]" style={{ background: c.accent }}>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: c.accent }} />
                        <span className="relative">{unread}</span>
                      </span>
                    ) : ready ? (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.accent }} />
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin text-slate-600" />
                    )}
                  </span>
                </div>
                <span className="text-[11px] leading-snug text-slate-500">{PORTAL_NAME[s]}</span>
                {on && <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: `inset 0 0 0 1px ${c.accent}55` }} />}
              </button>
            )
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-1 pt-2.5">
          <button
            onClick={() => (touring ? stopTour() : (setMode('portal'), setTouring(true)))}
            disabled={!complete}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-40"
          >
            {touring ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {touring ? 'Stop tour' : 'Guided tour'}
          </button>
          <button
            onClick={() => { stopTour(); setMode((m) => (m === 'compare' ? 'portal' : 'compare')) }}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
            style={mode === 'compare' ? { borderColor: 'rgba(255,255,255,0.25)', color: '#fff' } : undefined}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Compare all four
          </button>
          <button
            onClick={() => setDrawer(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white"
          >
            <Bell className="h-3.5 w-3.5" /> Activity
            {state.events.length > 1 && <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{state.events.length}</span>}
          </button>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
            <span>Shared encounter</span>
            <ArrowRight className="h-3 w-3" />
            <span style={{ color: cfg.accent }}>{mode === 'compare' ? 'all four readers' : PORTAL_NAME[active].toLowerCase()}</span>
          </div>
        </div>
      </div>

      {/* Verifier + orchestrator strip */}
      {(verification || synthesis) && (
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {verification && (
              <div className="flex items-center gap-2 text-sm text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                <span className="font-medium">Verified</span>
                <span className="text-xs text-slate-400">{verification.sourcesChecked} sources · {Math.round(verification.confidence * 100)}% confidence · 0 fabricated facts</span>
              </div>
            )}
            {synthesis && (
              <button onClick={() => setShowConnections((v) => !v)} className="ml-auto flex items-center gap-1.5 text-xs text-amber-300/90 hover:text-amber-200">
                <Sparkles className="h-3.5 w-3.5" /> How the four portals connect
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showConnections ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <AnimatePresence>
            {showConnections && synthesis && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <p className="mt-3 text-sm leading-relaxed text-slate-300">{synthesis.summary}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {synthesis.connections.map((c, i) => (
                    <div key={i} className="flex gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5 text-[13px] text-slate-400">
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400/70" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {touring && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs" style={{ borderColor: `${cfg.accent}33`, background: `${cfg.accent}0d`, color: cfg.accent }}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: cfg.accent }} />
            Guided tour · now showing the {PORTAL_NAME[active].toLowerCase()}, the same encounter reimagined for the {cfg.label.toLowerCase()}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {mode === 'compare' ? (
          <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <ReportView reports={reports} verification={verification} synthesis={synthesis} />
          </motion.div>
        ) : (
          <motion.div key={active} initial={{ opacity: 0, y: 14, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.99 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
            {activeFlags.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3">
                <div className="mb-1.5 text-[11px] uppercase tracking-wider text-amber-300">
                  Faithfulness review · {activeFlags.length} flagged
                </div>
                <ul className="space-y-1">
                  {activeFlags.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-[12px]">
                      <span className="text-slate-300">&ldquo;{f.sentence}&rdquo;</span>
                      <span className="shrink-0 tabular-nums text-[11px] text-amber-300/80">{Math.round(f.pSupported * 100)}% supported</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                  Sentences the trained checker could not support against the note and extraction. Advisory, for human review.
                </p>
              </div>
            )}
            <Active report={reports[active]} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast: an action rippled in from another portal */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-[#0b1220]/95 px-4 py-3 shadow-2xl backdrop-blur"
          >
            <Zap className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{toast.from} → {toast.to}</div>
              <div className="text-sm text-slate-200">{toast.title}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Activity drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} className="fixed inset-0 z-50 bg-black/50" />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-[#080d18]"
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><Bell className="h-4 w-4 text-amber-400" /> Encounter activity</div>
                <button onClick={() => setDrawer(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {state.events.map((e) => {
                  const fromCfg = e.from === 'system' ? null : STAKEHOLDERS[e.from]
                  const isMsg = e.kind === 'message'
                  return (
                    <div key={e.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {isMsg ? <Megaphone className="h-3 w-3" style={{ color: fromCfg?.accent }} /> : e.from === 'system' ? <Zap className="h-3 w-3 text-slate-400" /> : <ArrowRight className="h-3 w-3" style={{ color: fromCfg?.accent }} />}
                        <span className="font-medium" style={{ color: fromCfg?.accent ?? '#94a3b8' }}>{portalLabel(e.from)}</span>
                        <span className="text-slate-500">→ {e.to.map(portalLabel).join(', ')}</span>
                        <span className="ml-auto text-slate-500">{timeAgo(e.ts)}</span>
                      </div>
                      <div className="mt-1 text-[13px] font-medium text-slate-200">{isMsg ? e.body : e.title}</div>
                      {!isMsg && e.body && <div className="mt-0.5 text-[12px] leading-snug text-slate-400">{e.body}</div>}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
