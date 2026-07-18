// ── Immutable audit log ──────────────────────────────────────────────────────
// An append-only, hash-chained record of every run: the evidence it saw, the
// model versions and prompts it used, and the decisions it made. Each entry
// hashes the previous entry's hash together with its own body (a blockchain style
// chain), so any later tampering with an earlier entry is detectable by replaying
// the chain. In this demo it persists in the browser (localStorage); in
// production the same records would be written to append-only (WORM) storage
// server side. Hashing uses Web Crypto (SHA-256), available in the browser and in
// Node, so the log and its verification run in both.

export interface AuditRecord {
  ts: number
  noteType: string
  // Evidence the decisions were grounded on (not the raw note, which is de-identified).
  evidence: { icd: string[]; cpt: string[]; entities: number; sources: string[] }
  // Model versions per stage (from the extraction's models map).
  models: Record<string, string>
  // Which LLM calls ran, with the model id, so the prompt provenance is recorded.
  prompts: { stage: string; model: string }[]
  guardrail: { decision: string; score: number; flags: string[] }
  agreement: { available: boolean; score: number }
  harness: { action: string; riskTier: string; hitl: boolean }
}

export interface AuditEntry extends AuditRecord {
  seq: number
  prevHash: string
  hash: string
}

const KEY = 'synthure_audit_v1'
const MAX = 500
const GENESIS = '0'.repeat(64)

// Deterministic serialization (sorted keys), so the same record always hashes the
// same way regardless of key order.
function canonical(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']'
  if (x && typeof x === 'object') {
    return '{' + Object.keys(x as Record<string, unknown>).sort().map((k) => JSON.stringify(k) + ':' + canonical((x as Record<string, unknown>)[k])).join(',') + '}'
  }
  return JSON.stringify(x)
}

async function sha256hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function read(): AuditEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as AuditEntry[]
  } catch {
    return []
  }
}

// Append a record to the chain and return the sealed entry.
export async function appendAudit(record: AuditRecord): Promise<AuditEntry> {
  const log = read()
  const prevHash = log.length ? log[log.length - 1].hash : GENESIS
  const seq = log.length ? log[log.length - 1].seq + 1 : 0
  const base = { ...record, seq, prevHash }
  const hash = await sha256hex(prevHash + canonical(base))
  const entry: AuditEntry = { ...base, hash }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...log, entry].slice(-MAX)))
    } catch {
      /* storage full; the audit log is best effort in the demo */
    }
  }
  return entry
}

export const getAudit = read

// Replay the chain and report the first entry whose stored hash does not match a
// recomputation, or whose prevHash does not link to the previous entry.
export async function verifyAuditChain(): Promise<{ ok: boolean; length: number; brokenAt: number | null }> {
  const log = read()
  for (let i = 0; i < log.length; i++) {
    const { hash, ...base } = log[i]
    const recomputed = await sha256hex(base.prevHash + canonical(base))
    if (recomputed !== hash) return { ok: false, length: log.length, brokenAt: i }
    if (i > 0 && log[i].prevHash !== log[i - 1].hash) return { ok: false, length: log.length, brokenAt: i }
  }
  return { ok: true, length: log.length, brokenAt: null }
}

export function clearAudit(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// Build the record from the run's artifacts. Pure; called in route.ts.
export function auditRecordFrom(args: {
  noteType: string
  icd: string[]
  cpt: string[]
  entities: number
  sources: string[]
  models: Record<string, string>
  prompts: { stage: string; model: string }[]
  guardrail: { decision: string; score: number; flags: string[] }
  agreement: { available: boolean; score: number }
  harness: { action: string; riskTier: string; hitl: boolean }
  ts: number
}): AuditRecord {
  return {
    ts: args.ts,
    noteType: args.noteType,
    evidence: { icd: args.icd, cpt: args.cpt, entities: args.entities, sources: [...new Set(args.sources)] },
    models: args.models,
    prompts: args.prompts,
    guardrail: args.guardrail,
    agreement: args.agreement,
    harness: args.harness,
  }
}
