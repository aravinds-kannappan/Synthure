// ── Feedback flywheel ─────────────────────────────────────────────────────────
// Every human decision in the portals (confirming or removing a suggested code,
// clearing a prior auth, reconciling a patient-reported condition, editing the
// plan) is a labeled correction. Logged here, deduped by event id, it accumulates
// across encounters in this browser into a proprietary, non-synthetic training
// set: the one dataset the data engine cannot generate. It feeds Parts A/B of the
// model plan. Exportable as JSON so it can leave the browser for training.

import type { EncEvent } from './encounter'

export type FlywheelKind = 'code_correction' | 'prior_auth' | 'survey_signal' | 'plan_edit' | 'claim' | 'handoff'

export interface FlywheelExample {
  id: string
  ts: number
  actor: string // the portal that acted
  kind: FlywheelKind
  signal: string // human-readable label of the correction
  detail?: string
  factIds?: string[]
  noteType?: string // context: what kind of note this correction is about
}

const KEY = 'synthure.flywheel.v1'
const MAX = 2000

function read(): FlywheelExample[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as FlywheelExample[]
  } catch {
    return []
  }
}

function classify(e: EncEvent): FlywheelKind {
  const f = e.factIds ?? []
  if (f.some((x) => x.startsWith('dx:') || x.startsWith('svc:'))) return 'code_correction'
  if (f.includes('check:prior_auth')) return 'prior_auth'
  if (f.includes('survey')) return 'survey_signal'
  if (f.includes('claim:status')) return 'claim'
  if (f.some((x) => x.startsWith('plan:'))) return 'plan_edit'
  return 'handoff'
}

// Persist any new human-decision events as weak training signals and return the
// full accumulated set. Idempotent: deduped by event id, so calling it on every
// state change is safe.
export function captureFromEvents(events: EncEvent[], ctx: { noteType?: string } = {}): FlywheelExample[] {
  if (typeof window === 'undefined') return []
  const existing = read()
  const seen = new Set(existing.map((x) => x.id))
  const add: FlywheelExample[] = []
  for (const e of events) {
    if (e.from === 'system' || e.kind !== 'action' || seen.has(e.id)) continue
    add.push({
      id: e.id,
      ts: e.ts,
      actor: e.from,
      kind: classify(e),
      signal: e.title,
      detail: e.body,
      factIds: e.factIds,
      noteType: ctx.noteType,
    })
  }
  if (!add.length) return existing
  const all = [...add, ...existing].slice(0, MAX)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage full or blocked: the flywheel is best effort */
  }
  return all
}

export const flywheelAll = read
export const flywheelCount = (): number => read().length

export function exportFlywheel(): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([JSON.stringify(read(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `synthure-flywheel-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
