// Continuous eval feed, stored in the visitor's browser (localStorage). Every
// demo run appends one record; the evals page reads them back to show how the
// pipeline is performing across the notes this visitor has actually run. No
// backend, no account, per browser.

export interface RunRecord {
  ts: number
  noteType: string
  codes: number // total ICD-10 codes on the record
  trainedCodes: number // codes the trained coder linked or confirmed
  readiness: number | null // calibrated readiness 0..1
  reviewRisk: number // share of readiness checks flagged, 0..100
  entities: number
  guardrailScore?: number | null // deterministic guardrail safety score 0..1
  guardrailDecision?: string | null // ship | revise | block | escalate
}

const KEY = 'synthure_runs_v1'
const MAX = 100

export function getRuns(): RunRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RunRecord[]) : []
  } catch {
    return []
  }
}

export function logRun(r: RunRecord): void {
  if (typeof window === 'undefined') return
  try {
    const runs = getRuns()
    runs.push(r)
    localStorage.setItem(KEY, JSON.stringify(runs.slice(-MAX)))
  } catch {
    /* storage full or blocked; the feed is a nice to have */
  }
}

export function clearRuns(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
