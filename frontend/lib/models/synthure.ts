// ── Synthure-owned model inference (runtime) ─────────────────────────────────
// Loads the JSON models exported by the ml/ training harness and runs inference
// in-process. These are the decision-making models: note type, section parsing,
// missing-information detection, claim readiness, and ICD candidate reranking.
// Claude is never the runtime decision-maker; it only narrates the finished
// record. The feature functions here mirror ml/features.py exactly, and a node
// parity test (ml/parity.mjs) checks the TS and Python outputs agree.

import noteTypeModel from './note_type.json'
import missingModel from './missing.json'
import readinessModel from './readiness.json'
import rerankerModel from './reranker.json'
import type { NoteType } from '../schema'

// ── Shared features (mirror of ml/features.py) ───────────────────────────────
export const NOTE_TYPES: NoteType[] = [
  'soap', 'discharge_summary', 'referral', 'er_note', 'radiology', 'intake_form', 'progress_note',
]
export const MISSING_FIELDS = ['laterality', 'acuity', 'supporting_diagnosis', 'tobacco_status', 'medication_dose']
const DX_SECTION_WORDS = ['assessment', 'diagnosis', 'impression', 'problem', 'decision']

function words(note: string): string[] {
  return note.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
}

export function noteTypeTokens(note: string): string[] {
  const w = words(note)
  const grams = [...w]
  for (let i = 0; i < w.length - 1; i++) grams.push(`${w[i]} ${w[i + 1]}`)
  return grams
}

export const STRUCT_KEYS = [
  'n_dx', 'n_proc', 'has_laterality_word', 'has_acuity_word', 'has_dose',
  'has_dx_section', 'is_respiratory', 'lateralizable', 'has_tobacco_word', 'len_norm',
  ...NOTE_TYPES.map((t) => `nt_${t}`),
]

export function structVector(note: string, noteType: string, nDx: number, nProc: number): number[] {
  const low = note.toLowerCase()
  const has = (...ws: string[]) => (ws.some((w) => low.includes(w)) ? 1 : 0)
  const feats: Record<string, number> = {
    n_dx: nDx,
    n_proc: nProc,
    has_laterality_word: has('right', 'left', 'bilateral'),
    has_acuity_word: has('acute', 'chronic'),
    has_dose: /\d+\s?mg/.test(low) ? 1 : 0,
    has_dx_section: DX_SECTION_WORDS.some((w) => low.includes(w)) ? 1 : 0,
    is_respiratory: /\b(copd|asthma|pneumonia|bronchitis|dyspnea|respiratory|lung)\b/.test(low) ? 1 : 0,
    lateralizable: /\b(knee|hip|arm|leg|ear|eye|hand|foot|shoulder)\b/.test(low) ? 1 : 0,
    has_tobacco_word: has('tobacco', 'smok', 'nicotine'),
    len_norm: Math.min(note.length / 600, 3),
  }
  for (const t of NOTE_TYPES) feats[`nt_${t}`] = noteType === t ? 1 : 0
  return STRUCT_KEYS.map((k) => feats[k])
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

// ── Note-type classifier (TF-IDF + logistic regression) ──────────────────────
export function classifyNoteType(note: string): { type: NoteType; confidence: number } {
  const { vocab, idf, coef, intercept, classes } = noteTypeModel as {
    vocab: Record<string, number>; idf: number[]; coef: number[][]; intercept: number[]; classes: string[]
  }
  const tf = new Map<number, number>()
  for (const tok of noteTypeTokens(note)) {
    const i = vocab[tok]
    if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1)
  }
  const vec = new Map<number, number>()
  let norm = 0
  for (const [i, c] of tf) {
    const v = (1 + Math.log(c)) * idf[i]
    vec.set(i, v)
    norm += v * v
  }
  norm = Math.sqrt(norm) || 1
  const scores = intercept.slice()
  for (const [i, v] of vec) {
    const vn = v / norm
    for (let cls = 0; cls < scores.length; cls++) scores[cls] += coef[cls][i] * vn
  }
  // softmax for a confidence
  const mx = Math.max(...scores)
  const exp = scores.map((s) => Math.exp(s - mx))
  const sum = exp.reduce((a, b) => a + b, 0)
  let best = 0
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i
  return { type: classes[best] as NoteType, confidence: Number((exp[best] / sum).toFixed(3)) }
}

// ── Missing-information detector (per-field logistic regression) ──────────────
export interface MissingPrediction {
  field: string
  probability: number
  present: boolean
}
export function detectMissing(note: string, noteType: string, nDx: number, nProc: number): MissingPrediction[] {
  const md = missingModel as { fields: string[]; models: Record<string, { coef: number[]; intercept: number }> }
  const x = structVector(note, noteType, nDx, nProc)
  return md.fields.map((field) => {
    const mm = md.models[field]
    const z = mm.intercept + mm.coef.reduce((a, c, i) => a + c * x[i], 0)
    const p = sigmoid(z)
    return { field, probability: Number(p.toFixed(3)), present: p >= 0.5 }
  })
}

// ── Readiness predictor (gradient boosted trees + isotonic calibration) ───────
interface Tree {
  children_left: number[]; children_right: number[]; feature: number[]; threshold: number[]; value: number[]
}
function gbmProb(x: number[]): number {
  const gbm = (readinessModel as { gbm: { trees: Tree[]; learning_rate: number; init: number } }).gbm
  let s = gbm.init
  for (const t of gbm.trees) {
    let node = 0
    while (t.children_left[node] !== -1) {
      node = x[t.feature[node]] <= t.threshold[node] ? t.children_left[node] : t.children_right[node]
    }
    s += gbm.learning_rate * t.value[node]
  }
  return sigmoid(s)
}
function calibrate(p: number): number {
  const { x, y } = (readinessModel as { calibration: { x: number[]; y: number[] } }).calibration
  for (let i = 0; i < x.length - 1; i++) {
    if (p <= x[i + 1]) {
      const t = (p - x[i]) / (x[i + 1] - x[i] + 1e-9)
      return y[i] + t * (y[i + 1] - y[i])
    }
  }
  return y[y.length - 1]
}
export function predictReadiness(note: string, noteType: string, nDx: number, nProc: number): {
  raw: number; calibrated: number; band: 'ready' | 'needs_work' | 'not_ready'
} {
  const raw = gbmProb(structVector(note, noteType, nDx, nProc))
  const calibrated = calibrate(raw)
  const band = calibrated >= 0.66 ? 'ready' : calibrated >= 0.4 ? 'needs_work' : 'not_ready'
  return { raw: Number(raw.toFixed(3)), calibrated: Number(calibrated.toFixed(3)), band }
}

// ── ICD candidate reranker (logistic regression over lexical features) ────────
export interface RerankFeatures { overlap: number; termlen: number; billable: number; rank: number }
export function rerankScore(f: RerankFeatures): number {
  const { coef, intercept } = rerankerModel as { coef: number[]; intercept: number }
  const x = [f.overlap, f.termlen, f.billable, f.rank]
  return sigmoid(intercept + coef.reduce((a, c, i) => a + c * x[i], 0))
}
