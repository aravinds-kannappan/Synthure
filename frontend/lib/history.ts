// ── Encounter history (localStorage) ─────────────────────────────────────────
// Every synthesized encounter is logged in this browser, and the Benefits
// portal aggregates REAL past encounters instead of a fabricated trend line.
// Before any encounters exist it shows an honest empty state.

import type { ExtractionResult } from './synthure'

export interface HistoryEntry {
  id: string
  ts: number
  cohorts: { id: string; label: string }[]
  icd10: string[]
  allowed: number // sum of published CMS amounts at synthesis time
  lane: 'standard' | 'frontier'
  readmissionRisk: number
}

const KEY = 'synthure.encounters.v1'
const MAX = 200

function read(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as HistoryEntry[]
  } catch {
    return []
  }
}

export function logEncounter(ex: ExtractionResult): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `h${Date.now().toString(36)}`,
    ts: Date.now(),
    cohorts: ex.cohorts,
    icd10: ex.icd10.map((c) => c.code),
    allowed: ex.cpt.reduce((a, c) => a + (c.price ?? 0), 0),
    lane: ex.readiness.lane,
    readmissionRisk: ex.readmissionRisk,
  }
  const all = [entry, ...read()].slice(0, MAX)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage full or blocked: history is a nice-to-have */
  }
  return all
}

export const encounterHistory = read

export interface CohortAggregate {
  label: string
  encounters: number
  allowed: number
}

// Real aggregates over this browser's synthesized encounters.
export function aggregates(entries: HistoryEntry[]): {
  total: number
  totalAllowed: number
  frontierShare: number
  byCohort: CohortAggregate[]
  monthly: { month: string; encounters: number; allowed: number }[]
} {
  const byCohort = new Map<string, CohortAggregate>()
  const monthly = new Map<string, { month: string; encounters: number; allowed: number }>()
  let totalAllowed = 0
  let frontier = 0
  for (const e of entries) {
    totalAllowed += e.allowed
    if (e.lane === 'frontier') frontier += 1
    const label = e.cohorts[0]?.label ?? 'Uncategorized'
    const agg = byCohort.get(label) ?? { label, encounters: 0, allowed: 0 }
    agg.encounters += 1
    agg.allowed += e.allowed
    byCohort.set(label, agg)
    const month = new Date(e.ts).toISOString().slice(0, 7)
    const m = monthly.get(month) ?? { month, encounters: 0, allowed: 0 }
    m.encounters += 1
    m.allowed += e.allowed
    monthly.set(month, m)
  }
  return {
    total: entries.length,
    totalAllowed,
    frontierShare: entries.length ? Math.round((100 * frontier) / entries.length) : 0,
    byCohort: [...byCohort.values()].sort((a, b) => b.encounters - a.encounters),
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}
