// ── OpenMed models, running in the browser ───────────────────────────────────
// Three OpenMed checkpoints (Apache 2.0, see NOTICE) exported to int8 ONNX and
// served as static files from /public/models. They run on-device via
// transformers.js, so the raw note never leaves the browser: PII is scrubbed
// locally and only the de-identified text is sent to the API.
//
//   pii-clinicale5-33m    OpenMed-PII-ClinicalE5-Small-33M-v1     de-identification
//   disease-tinymed-65m   OpenMed-NER-DiseaseDetect-TinyMed-65M   diagnosis NER
//   pharma-tinymed-65m    OpenMed-NER-PharmaDetect-TinyMed-65M    drug/chemical NER

import type { Entity } from './synthure'

export { OPENMED_MODELS, type OpenMedStage } from './openmedModels'
import { OPENMED_MODELS, type OpenMedStage } from './openmedModels'

export interface LoadProgress {
  stage: OpenMedStage
  pct: number // 0-100 for the stage's model files
  done: boolean
}

// Raw per-token output of a transformers.js token-classification pipeline.
interface RawToken {
  entity: string
  score: number
  word: string
}

interface Merged {
  label: string
  text: string
  score: number // minimum token score, the conservative choice
  start: number
  end: number
}

type TcPipeline = (text: string, opts?: Record<string, unknown>) => Promise<RawToken[]>

// The transformers.js web bundle and the ONNX wasm runtime are vendored under
// /public/vendor and loaded at runtime, so webpack never parses them and the
// whole stack still deploys as static Vercel assets.
const TRANSFORMERS_URL = '/vendor/transformers/transformers.web.min.js'
const ORT_WASM_PATH = '/vendor/transformers/ort/'

interface TransformersModule {
  pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>
  env: {
    allowRemoteModels: boolean
    localModelPath: string
    backends: { onnx: { wasm: { wasmPaths: string } } }
  }
}

const _pipelines: Partial<Record<OpenMedStage, TcPipeline>> = {}
let _envReady = false

async function lib(): Promise<TransformersModule> {
  const mod = (await import(/* webpackIgnore: true */ TRANSFORMERS_URL)) as TransformersModule
  if (!_envReady) {
    mod.env.allowRemoteModels = false
    mod.env.localModelPath = '/models/'
    mod.env.backends.onnx.wasm.wasmPaths = ORT_WASM_PATH
    _envReady = true
  }
  return mod
}

export async function loadModel(stage: OpenMedStage, onProgress?: (p: LoadProgress) => void) {
  if (_pipelines[stage]) return
  const { pipeline } = await lib()
  const seen = new Map<string, number>()
  const pl = await pipeline('token-classification', OPENMED_MODELS[stage].local, {
    dtype: 'q8',
    progress_callback: (p: { status: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
        seen.set(p.file, p.progress)
        const pct = [...seen.values()].reduce((a, b) => a + b, 0) / seen.size
        onProgress?.({ stage, pct: Math.round(pct), done: false })
      }
    },
  })
  _pipelines[stage] = pl as unknown as TcPipeline
  onProgress?.({ stage, pct: 100, done: true })
}

export async function loadAllModels(onProgress?: (p: LoadProgress) => void) {
  for (const stage of Object.keys(OPENMED_MODELS) as OpenMedStage[]) {
    await loadModel(stage, onProgress)
  }
}

export const modelsReady = () =>
  (Object.keys(OPENMED_MODELS) as OpenMedStage[]).every((s) => !!_pipelines[s])

// ── BIO aggregation with character spans ─────────────────────────────────────
// transformers.js returns word pieces without offsets, so entities are merged
// from B-/I- runs and located in the source text with a forward-moving cursor.

function locate(text: string, pieces: string[], from: number): { start: number; end: number } | null {
  const pattern = pieces
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s]*')
  try {
    const re = new RegExp(pattern, 'gi')
    re.lastIndex = from
    const m = re.exec(text)
    return m ? { start: m.index, end: m.index + m[0].length } : null
  } catch {
    return null
  }
}

function aggregate(text: string, tokens: RawToken[], minScore: number): Merged[] {
  const out: Merged[] = []
  let run: { label: string; pieces: string[]; scores: number[] } | null = null
  let cursor = 0

  const flush = () => {
    if (!run) return
    const score = Math.min(...run.scores)
    const loc = locate(text, run.pieces, cursor)
    if (loc && score >= minScore) {
      out.push({
        label: run.label,
        text: text.slice(loc.start, loc.end),
        score,
        start: loc.start,
        end: loc.end,
      })
      cursor = loc.end
    }
    run = null
  }

  for (const t of tokens) {
    const tag = t.entity ?? 'O'
    if (tag === 'O') {
      flush()
      continue
    }
    const label = tag.replace(/^[BI]-/, '')
    const cont = t.word.startsWith('##')
    const piece = t.word.replace(/^##/, '')
    if (run && (tag.startsWith('I-') || cont) && run.label === label) {
      run.pieces.push(piece)
      run.scores.push(t.score)
    } else {
      flush()
      run = { label, pieces: [piece], scores: [t.score] }
    }
  }
  flush()
  return out
}

async function run(stage: OpenMedStage, text: string, minScore: number): Promise<Merged[]> {
  const pl = _pipelines[stage]
  if (!pl) throw new Error(`OpenMed ${stage} model is not loaded`)
  const tokens = await pl(text, { ignore_labels: [] })
  return aggregate(text, tokens, minScore)
}

// ── De-identification (runs before anything leaves the device) ───────────────
export interface DeidResult {
  text: string // the de-identified note; this is what the API receives
  redactions: number
  types: string[]
}

export async function deidentify(text: string, minScore = 0.5): Promise<DeidResult> {
  const hits = await run('deid', text, minScore)
  // Replace right to left so earlier spans keep their offsets.
  let clean = text
  const types = new Set<string>()
  for (const h of [...hits].sort((a, b) => b.start - a.start)) {
    const tag = h.label.toUpperCase()
    types.add(tag)
    clean = clean.slice(0, h.start) + `[${tag}]` + clean.slice(h.end)
  }
  return { text: clean, redactions: hits.length, types: [...types].sort() }
}

// ── Clinical NER over the de-identified note ─────────────────────────────────
export async function extractEntities(text: string, minScore = 0.6): Promise<Entity[]> {
  const [diseases, chems] = await Promise.all([
    run('disease', text, minScore),
    run('pharma', text, minScore),
  ])
  const ents: Entity[] = [
    ...diseases.map((m) => ({
      text: m.text,
      type: 'DIAGNOSIS',
      start: m.start,
      end: m.end,
      confidence: Number(m.score.toFixed(3)),
      source: 'openmed' as const,
    })),
    ...chems.map((m) => ({
      text: m.text,
      type: 'CHEM',
      start: m.start,
      end: m.end,
      confidence: Number(m.score.toFixed(3)),
      source: 'openmed' as const,
    })),
  ]
  // De-dup identical spans, keep the higher-confidence read.
  const seen = new Map<string, Entity>()
  for (const e of ents) {
    const k = `${e.start}:${e.end}:${e.type}`
    const prev = seen.get(k)
    if (!prev || (e.confidence ?? 0) > (prev.confidence ?? 0)) seen.set(k, e)
  }
  return [...seen.values()].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
}
