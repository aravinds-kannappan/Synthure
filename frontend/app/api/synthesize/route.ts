// ── Synthesis pipeline ────────────────────────────────────────────────────────
// The client runs OpenMed on-device: PII de-identification, then disease and
// pharma NER with real confidences. This route receives ONLY the de-identified
// note plus those entities and continues the pipeline:
//
//   1. verify every posted entity is literally present in the note
//   2. medication check against the RxNorm prescribable vocabulary
//   3. symptom/lab span tagging (Claude, verbatim spans verified server side)
//   4. literal codes validated against the CMS tabular / fee schedules
//   5. diagnosis linking: ICD 10 CM alphabetic index retrieval; Claude may only
//      choose among retrieved candidates, so a code can never be invented
//   6. claim readiness checklist + CMS published readmission rate
//   7. four writer agents, verifier, constitution critic, revision pass
//
// There is no fallback path. If a stage cannot run, the error is surfaced.

import Anthropic from '@anthropic-ai/sdk'
import { dehyphen } from '@/lib/engine'
import {
  STAKEHOLDER_ORDER,
  CONSTITUTION,
  type Entity,
  type ExtractionResult,
  type SafetyResult,
  type Stakeholder,
  type StakeholderReport,
  type Synthesis,
  type Verification,
} from '@/lib/synthure'
import { assessSafety } from '@/lib/safety'
import { assessReadiness, inferReadmission } from '@/lib/risk'
import {
  ccsrCategory,
  icdCandidates,
  icdInfo,
  medlinePlus,
  medMatch,
  procPrice,
  type IcdCandidate,
} from '@/lib/knowledge.server'
import { OPENMED_MODELS } from '@/lib/openmedModels'
import { classifyNoteType, detectMissing, predictReadiness, rerankScore } from '@/lib/models/synthure'
import { parseSections } from '@/lib/models/sections'
import { NOTE_TYPE_LABELS } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

// ── Trained model service (optional) ───────────────────────────────────────────
// When SYNTHURE_MODEL_API points at the Synthure model Space, diagnosis mentions
// are additionally linked by the trained retriever + reranker (every returned
// code revalidated against the CMS tabular, so nothing opaque enters the
// pipeline) and portal reports are scored for faithfulness. Unset or unreachable:
// the app falls back to its lexical linker with no change in behavior.
const MODEL_API = (process.env.SYNTHURE_MODEL_API || '').replace(/\/$/, '')

async function modelLinkCodes(mentions: string[]): Promise<ExtractionResult['icd10']> {
  if (!MODEL_API || mentions.length === 0) return []
  try {
    const res = await fetch(`${MODEL_API}/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mentions, top: 5 }),
      signal: AbortSignal.timeout(25000), // a sleeping free HF Space needs ~15-30s to wake
    })
    if (!res.ok) return []
    const data = (await res.json()) as { codes?: { code?: string; code_raw?: string; mention?: string; score?: number }[] }
    const out: ExtractionResult['icd10'] = []
    for (const c of data.codes ?? []) {
      const info = icdInfo(c.code_raw || (c.code || '').replace(/\./g, ''))
      if (info) out.push({ code: info.code, label: info.description, billable: info.billable, source: 'linked', entity: c.mention, trained: true, modelScore: c.score })
    }
    return out
  } catch {
    return []
  }
}

async function modelFaithfulness(note: string, ex: ExtractionResult, report: StakeholderReport): Promise<StakeholderReport['flags']> {
  if (!MODEL_API) return undefined
  try {
    const res = await fetch(`${MODEL_API}/faithfulness`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note, extraction: ex, report }),
      signal: AbortSignal.timeout(25000), // a sleeping free HF Space needs ~15-30s to wake
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { flagged?: { field: string; sentence: string; p_supported: number }[] }
    const flagged = data.flagged ?? []
    return flagged.length ? flagged.map((f) => ({ field: f.field, sentence: f.sentence, pSupported: f.p_supported })) : undefined
  } catch {
    return undefined
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In-memory per serverless instance: per IP per hour plus a global daily cap.
// This bounds Claude API spend on an open demo endpoint.
const RL_PER_IP_HOUR = 6
const RL_GLOBAL_DAY = 200
const _ipHits = new Map<string, number[]>()
let _dayKey = ''
let _dayCount = 0

function rateLimited(ip: string): string | null {
  const now = Date.now()
  const day = new Date().toISOString().slice(0, 10)
  if (day !== _dayKey) {
    _dayKey = day
    _dayCount = 0
  }
  if (_dayCount >= RL_GLOBAL_DAY) return 'The demo has reached its daily synthesis budget. Please try again tomorrow.'
  const hits = (_ipHits.get(ip) ?? []).filter((t) => now - t < 3600_000)
  if (hits.length >= RL_PER_IP_HOUR) return 'Rate limit reached for this hour. The demo allows a few runs per hour per visitor.'
  hits.push(now)
  _ipHits.set(ip, hits)
  _dayCount += 1
  return null
}

// ── Shared context handed to every writer ────────────────────────────────────
function exContext(note: string, ex: ExtractionResult): string {
  const flagged = ex.readiness.checks.filter((c) => c.status === 'flag')
  return [
    `DE-IDENTIFIED CLINICAL NOTE:\n${note}`,
    '',
    'EXTRACTED FACTS (the only facts you may use — do not invent any clinical detail):',
    `- Diagnoses (ICD 10 CM FY2026 official descriptions): ${ex.icd10.map((c) => `${c.code} ${c.label}${c.billable === false ? ' [NOT BILLABLE, category header]' : ''}`).join('; ') || 'none coded'}`,
    `- Procedures/services: ${ex.cpt.map((c) => `${c.code}${c.label ? ` ${c.label}` : ''}${c.price != null ? ` (CMS ${c.schedule} national amount $${c.price})` : ' (no published CMS amount)'}`).join('; ') || 'none coded'}`,
    `- Medications (verified against RxNorm): ${ex.entities.filter((e) => e.type === 'MEDICATION').map((e) => e.text).join(', ') || 'none'}`,
    `- Signs/symptoms: ${ex.entities.filter((e) => e.type === 'SIGN_SYMPTOM').map((e) => e.text).join(', ') || 'none'}`,
    `- Labs/vitals: ${ex.entities.filter((e) => e.type === 'LAB_VALUE').map((e) => e.text).join(', ') || 'none'}`,
    `- Claim readiness checklist: ${flagged.length ? flagged.map((c) => `${c.label}: ${c.detail} [${c.source}]`).join(' | ') : 'all checks passing'}`,
    `- Prior authorization required (published payer policy): ${ex.priorAuth.map((p) => `${p.procedure} ${p.code} [${p.source}]`).join('; ') || 'none'}`,
    `- Readmission: ${ex.readmissionCalibrated ? `${ex.readmissionRisk}% CMS published 30 day rate for the ${ex.readmissionDriver} cohort` : `${ex.readmissionRisk}% national hospital wide published rate (no condition cohort matched)`}`,
    `- Population category (AHRQ CCSR): ${ex.cohorts.map((c) => c.label).join('; ') || 'none'}`,
    `- Consumer language from MedlinePlus where available: ${ex.icd10.filter((c) => c.plain).map((c) => `${c.code}: ${c.plain}`).join(' | ') || 'none retrieved'}`,
    'IMPORTANT: Do not state a denial probability; none exists. Costs are CMS national amounts and must be labeled as estimates for the patient. Discuss readiness only via the checklist facts above.',
  ].join('\n')
}

// ── Symptom / lab span tagging (verbatim, verified server side) ───────────────
const SPAN_TOOL: Anthropic.Tool = {
  name: 'tag_spans',
  description: 'Tag verbatim spans from the note.',
  input_schema: {
    type: 'object',
    properties: {
      symptoms: { type: 'array', items: { type: 'string' }, description: 'Signs and symptoms, copied verbatim from the note' },
      labs: { type: 'array', items: { type: 'string' }, description: 'Lab tests, vitals, or measurements mentioned, copied verbatim from the note (e.g. A1C 7.2%, BP 152/96, Troponin)' },
    },
    required: ['symptoms', 'labs'],
  },
}

async function tagSpans(client: Anthropic, note: string): Promise<Entity[]> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 800,
    tools: [SPAN_TOOL],
    tool_choice: { type: 'tool', name: 'tag_spans' },
    system:
      'Tag signs/symptoms and labs/vitals in the clinical note. Every value you return MUST be copied verbatim, character for character, from the note; spans that do not appear exactly are discarded. Do not tag diagnoses or medications.',
    messages: [{ role: 'user', content: `NOTE:\n${note}` }],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use from span tagger')
  const inp = block.input as { symptoms?: string[]; labs?: string[] }
  const out: Entity[] = []
  const lower = note.toLowerCase()
  const push = (raw: string, type: string) => {
    const text = raw.trim()
    if (!text || text.length > 80) return
    const start = lower.indexOf(text.toLowerCase())
    if (start < 0) return // not verbatim -> dropped
    out.push({ text: note.slice(start, start + text.length), type, start, end: start + text.length, source: 'claude' })
  }
  for (const s of inp.symptoms ?? []) push(s, 'SIGN_SYMPTOM')
  for (const l of inp.labs ?? []) push(l, 'LAB_VALUE')
  return out
}

// ── Diagnosis linking via the trained Synthure reranker ──────────────────────
// Candidates come from the official ICD 10 CM alphabetic index (so a code
// outside the index is impossible by construction). The Synthure reranker (a
// logistic regression trained in ml/) scores each candidate from lexical
// features and picks the top one above a confidence floor, or abstains. This is
// a Synthure owned model, not Claude: it runs in process, so ANY note (including
// messy prose with no literal codes) gets coded without an API call.
interface LinkedCode {
  code: string
  label: string
  billable: boolean
  source: 'linked'
  entity: string
  score: number
}

const LINK_FLOOR = 0.15 // reranker probability below which we abstain

function linkDiagnoses(diagnoses: Entity[]): LinkedCode[] {
  const out: LinkedCode[] = []
  const usedCodes = new Set<string>()
  for (const e of diagnoses) {
    const cands = icdCandidates(e.text, 8)
    if (!cands.length) continue
    let best: { c: IcdCandidate; s: number } | null = null
    for (const c of cands) {
      const s = rerankScore({ overlap: c.overlap, termlen: c.termLen, billable: c.billable ? 1 : 0, rank: c.rank })
      if (!best || s > best.s) best = { c, s }
    }
    if (!best || best.s < LINK_FLOOR) continue // abstain -> entity stays uncoded
    const key = best.c.code.replace('.', '').toUpperCase()
    if (usedCodes.has(key)) continue
    usedCodes.add(key)
    out.push({ code: best.c.code, label: best.c.description, billable: best.c.billable, source: 'linked', entity: e.text, score: Number(best.s.toFixed(3)) })
  }
  return out
}

// ── Literal codes written in the note, validated against public artifacts ────
const ICD_LIT_RE = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b/g
const PROC_LIT_RE = /\b(\d{5}|[A-V]\d{4})\b/g

function literalIcd(note: string): { code: string; label: string; billable: boolean; source: 'literal' }[] {
  const out = new Map<string, { code: string; label: string; billable: boolean; source: 'literal' }>()
  for (const m of note.matchAll(ICD_LIT_RE)) {
    const info = icdInfo(m[1])
    if (info) out.set(info.code, { code: info.code, label: info.description, billable: info.billable, source: 'literal' })
  }
  return [...out.values()]
}

function literalProcs(note: string): ExtractionResult['cpt'] {
  const out = new Map<string, ExtractionResult['cpt'][number]>()
  for (const m of note.matchAll(PROC_LIT_RE)) {
    const code = m[1].toUpperCase()
    const priced = procPrice(code)
    if (!priced) continue // not in the CMS fee schedules -> not treated as a code
    out.set(code, {
      code,
      label: priced.description ?? `Service ${code}`,
      price: priced.price,
      schedule: priced.schedule,
    })
  }
  return [...out.values()]
}

// ── Clinical abbreviation and shorthand extractor ────────────────────────────
// Real notes are written in shorthand (DM2, HTN, HLD, CKD3, SOB, HF). The
// OpenMed models are trained on spelled out text and miss most abbreviations,
// so this deterministic pass catches common clinical abbreviations and short
// phrases and adds them as diagnosis entities to be coded by the reranker.
const CLINICAL_ABBREV: [RegExp, string][] = [
  [/\b(dm2|t2dm|type 2 (diabetes|dm)|niddm)\b/gi, 'type 2 diabetes mellitus'],
  [/\b(dm1|t1dm|type 1 (diabetes|dm)|iddm)\b/gi, 'type 1 diabetes mellitus'],
  [/\bhtn\b/gi, 'hypertension'],
  [/\b(hld|hlp|dyslipidemia|hyperlipidemia)\b/gi, 'hyperlipidemia'],
  [/\bckd\s?([12345])\b/gi, 'chronic kidney disease stage $1'],
  [/\bckd\b/gi, 'chronic kidney disease'],
  [/\b(esrd|end stage renal)\b/gi, 'end stage renal disease'],
  [/\b(chf|congestive heart failure)\b/gi, 'congestive heart failure'],
  [/\bhfref\b/gi, 'systolic heart failure'],
  [/\bhfpef\b/gi, 'diastolic heart failure'],
  [/\bheart failure\b/gi, 'heart failure'],
  [/\bcad\b/gi, 'coronary artery disease'],
  [/\b(afib|a fib|atrial fib)\b/gi, 'atrial fibrillation'],
  [/\bcopd\b/gi, 'chronic obstructive pulmonary disease'],
  [/\b(cva|stroke)\b/gi, 'cerebral infarction'],
  [/\btia\b/gi, 'transient cerebral ischemic attack'],
  [/\b(mi|nstemi|stemi)\b/gi, 'myocardial infarction'],
  [/\bpe\b/gi, 'pulmonary embolism'],
  [/\bdvt\b/gi, 'deep vein thrombosis'],
  [/\bgerd\b/gi, 'gastro esophageal reflux'],
  [/\buti\b/gi, 'urinary tract infection'],
  [/\bbph\b/gi, 'benign prostatic hyperplasia'],
  [/\bosa\b/gi, 'obstructive sleep apnea'],
  [/\bgout\b/gi, 'gout'],
  [/\baki\b/gi, 'acute kidney injury'],
  [/\bsob\b/gi, 'shortness of breath'],
  [/\b(mdd|depression)\b/gi, 'major depressive disorder'],
  [/\b(gad|anxiety)\b/gi, 'anxiety'],
  [/\bpna\b/gi, 'pneumonia'],
]

// Negation cues: an entity is dropped when the text just before it negates it,
// so "no fever, no cough, denies chest pain" are not coded as present.
const NEG_RE = /\b(no|not|denies|denied|without|w\/o|neg(ative)? for|absent|ruled out|r\/o|free of)\b/i
function isNegated(note: string, start: number): boolean {
  const window = note.slice(Math.max(0, start - 22), start)
  // stop at sentence boundaries so a negation does not leak across clauses
  const clause = window.split(/[.;]/).pop() ?? window
  return NEG_RE.test(clause)
}

function extractAbbreviations(note: string): Entity[] {
  const out: Entity[] = []
  const seen = new Set<string>()
  for (const [re, canonical] of CLINICAL_ABBREV) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(note))) {
      const start = m.index
      if (isNegated(note, start)) continue
      const text = canonical.replace('$1', m[1] ?? '')
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ text, type: 'DIAGNOSIS', start, end: start + m[0].length, source: 'synthure' })
    }
  }
  return out
}

// Infer an evaluation and management visit when the note is an office or ED
// encounter with diagnoses but no procedure was coded, so the revenue view is
// not empty. The code and price come from the CMS fee schedule; the label is a
// neutral description (CPT descriptors are AMA licensed and not shipped).
function inferVisit(noteTypeId: string, hasDx: boolean, hasProc: boolean): ExtractionResult['cpt'][number] | null {
  if (hasProc || !hasDx) return null
  const visitCode = noteTypeId === 'er_note' ? '99284' : '99214'
  const priced = procPrice(visitCode)
  if (!priced) return null
  return {
    code: visitCode,
    label: noteTypeId === 'er_note' ? 'Emergency department visit (evaluation and management)' : 'Established patient office visit (evaluation and management)',
    price: priced.price,
    schedule: priced.schedule,
  }
}

// ── Writers / verifier / critic / orchestrator ────────────────────────────────
const REPORT_TOOL: Anthropic.Tool = {
  name: 'write_report',
  description: 'Return a structured stakeholder report.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Short, punchy headline (max 6 words)' },
      summary: { type: 'string', description: '1 to 2 sentence overview for this reader' },
      metrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
            tone: { type: 'string', enum: ['good', 'warn', 'bad', 'neutral'] },
          },
          required: ['label', 'value', 'tone'],
        },
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            body: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
          required: ['heading', 'body'],
        },
      },
      actions: { type: 'array', items: { type: 'string' }, description: 'Concrete actions the agent has taken or queued' },
    },
    required: ['headline', 'summary', 'metrics', 'sections', 'actions'],
  },
}

const STYLE =
  'Produce a thorough, detailed report: 6 to 8 sections, each with a substantive 2 to 3 sentence body and 3 to 5 specific bullets, plus 4 to 6 concrete actions the agent has taken. Name every relevant condition, code, medication, lab, price, and readiness check explicitly; do not speak in generalities when a specific fact is available. Every diagnosis and every medication in the extracted facts should be addressed somewhere in the report. Ground every statement strictly in the extracted facts and the note; never invent clinical values or codes. Critically: write with NO hyphens and NO dashes of any kind (do not use the characters "-", "—", or "–"); rephrase using spaces, commas, or parentheses instead (for example write "ICD 10", "out of network", "follow up", "one tap").'

const ROLE_BRIEF: Record<Stakeholder, string> = {
  patient:
    'You are the Patient Advocate agent. Write for the patient at about a 6th grade reading level: warm, clear, and reassuring, never alarming. Your report MUST (1) translate every diagnosis into plain everyday language, preferring the MedlinePlus consumer text when provided and expanding on it; (2) explain each medication, what it does and how to take it; (3) explain any lab values or test results; (4) include a cost section built on the CMS national amounts provided, clearly labeled as estimates that depend on the patient plan, with deductible and copay context and financial assistance options; (5) give clear next steps, when to seek care sooner, and questions to ask. Be genuinely useful and complete.',
  physician:
    'You are the Care Navigator agent supporting the treating physician. Be precise and clinical. Cover suggested ICD 10 coding with sequencing rationale (note any code flagged as a non billable category header and what specificity is missing), documentation prompts, prior authorization needs (only those on published payer lists), the claim readiness checklist and concrete fixes for each flagged item, order and care coordination, and follow up. Do not state a denial probability. You never prescribe or diagnose; you support the physician and save them time.',
  hospital:
    'You are the Revenue Cycle agent for the hospital. Cover the revenue cycle in detail: claim construction with the CMS fee schedule amounts provided, the readiness checklist with its sourced drivers (never a fabricated denial probability), routing and review lane, expected reimbursement posture using the published amounts, readmission and HRRP exposure using the CMS published rate provided, AR and appeals workflow, and patient financial screening. Be operational and financial.',
  employer:
    'You are the Benefits Analyst agent for the employer and plan sponsor. Work only with aggregated, anonymized information. Cover the population category (AHRQ CCSR) this encounter rolls into, cost exposure using the published amounts, network utilization, benefits and plan design optimization, ACA and COBRA compliance posture, and wellness program matching. Be strategic and quantitative without exposing identifying clinical detail.',
}

function writerModel(s: Stakeholder, ex: ExtractionResult): string {
  return ex.readiness.lane === 'frontier' && (s === 'hospital' || s === 'physician') ? SONNET : HAIKU
}

async function claudeReport(
  client: Anthropic,
  s: Stakeholder,
  note: string,
  ex: ExtractionResult,
  critique?: string,
): Promise<StakeholderReport> {
  const msg = await client.messages.create({
    model: writerModel(s, ex),
    max_tokens: 3200,
    tools: [{ ...REPORT_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'write_report' },
    system: [
      { type: 'text', text: STYLE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ROLE_BRIEF[s] },
    ],
    messages: [
      {
        role: 'user',
        content: critique
          ? `${exContext(note, ex)}\n\nYOUR PREVIOUS REPORT WAS FLAGGED BY THE VERIFIER/CRITIC:\n${critique}\n\nRewrite the report fixing every flagged issue while keeping everything that was correct.`
          : exContext(note, ex),
      },
    ],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use')
  const input = block.input as Omit<StakeholderReport, 'stakeholder'>
  return dehyphen({ stakeholder: s, ...input })
}

const VERIFY_TOOL: Anthropic.Tool = {
  name: 'verify',
  description: 'Verify the reports against the extracted facts.',
  input_schema: {
    type: 'object',
    properties: {
      confidence: { type: 'number', description: 'Overall confidence 0-1' },
      sourcesChecked: { type: 'number' },
      checks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            status: { type: 'string', enum: ['pass', 'flag'] },
            note: { type: 'string' },
            target: { type: 'string', enum: ['patient', 'physician', 'hospital', 'employer', 'all'], description: 'Which report the check concerns' },
          },
          required: ['label', 'status', 'note', 'target'],
        },
      },
    },
    required: ['confidence', 'sourcesChecked', 'checks'],
  },
}

type VerifyOut = Verification & { checks: (Verification['checks'][number] & { target?: Stakeholder | 'all' })[] }

async function claudeVerify(
  client: Anthropic,
  note: string,
  ex: ExtractionResult,
  reports: StakeholderReport[],
): Promise<VerifyOut> {
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: 1200,
    tools: [VERIFY_TOOL],
    tool_choice: { type: 'tool', name: 'verify' },
    system:
      'You are the Verifier agent. Audit the four stakeholder reports against the extracted facts and clinical knowledge. Flag any statement that is not supported by the note or extraction or that is clinically unsafe, and name which report it concerns. Return 4 to 6 specific checks. Write with no hyphens and no dashes.',
    messages: [
      {
        role: 'user',
        content: `${exContext(note, ex)}\n\nREPORTS TO VERIFY:\n${JSON.stringify(
          reports.map((r) => ({ for: r.stakeholder, summary: r.summary, sections: r.sections })),
        )}`,
      },
    ],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use')
  return dehyphen(block.input as VerifyOut)
}

const SYNTH_TOOL: Anthropic.Tool = {
  name: 'synthesize',
  description: 'Connect the four reports into one tailored narrative.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One short paragraph: what just happened across all four reports.' },
      connections: { type: 'array', items: { type: 'string' }, description: '3-4 cross-report links showing how the same facts drive each reader.' },
    },
    required: ['summary', 'connections'],
  },
}

async function claudeSynthesis(
  client: Anthropic,
  note: string,
  ex: ExtractionResult,
  reports: StakeholderReport[],
): Promise<Synthesis> {
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: 800,
    tools: [SYNTH_TOOL],
    tool_choice: { type: 'tool', name: 'synthesize' },
    system:
      'You are the Orchestrator agent. Show how a single clinical note produced four tailored reports. Connect them so a reader sees the shared facts driving each. Be specific and reference the actual conditions, codes, and readiness facts. Write with no hyphens and no dashes.',
    messages: [
      {
        role: 'user',
        content: `${exContext(note, ex)}\n\nFOUR REPORTS:\n${JSON.stringify(
          reports.map((r) => ({ for: r.stakeholder, headline: r.headline, summary: r.summary })),
        )}`,
      },
    ],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use')
  return dehyphen(block.input as Synthesis)
}

const CRITIC_TOOL: Anthropic.Tool = {
  name: 'critique',
  description: 'Audit the reports against the clinical constitution and report any violations.',
  input_schema: {
    type: 'object',
    properties: {
      critiques: {
        type: 'array',
        description: 'One entry per violated principle. Empty if every principle is satisfied.',
        items: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['patient', 'physician', 'hospital', 'employer', 'all'] },
            issue: { type: 'string', description: 'Which principle is violated and how, in one sentence.' },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['target', 'issue', 'severity'],
        },
      },
    },
    required: ['critiques'],
  },
}

async function claudeCritic(
  client: Anthropic,
  note: string,
  reports: StakeholderReport[],
): Promise<SafetyResult['critiques']> {
  const principles = CONSTITUTION.map((p, i) => `${i + 1}. ${p.principle}`).join('\n')
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: 900,
    tools: [CRITIC_TOOL],
    tool_choice: { type: 'tool', name: 'critique' },
    system:
      'You are the Constitution Critic, an alignment safeguard in the style of Constitutional AI. Audit the four reports against the clinical constitution below. Report only genuine violations; if a principle holds, do not invent a problem. Be strict about fabricated codes, any agent issued prescribing or diagnosing, and unqualified cost claims. Write with no hyphens and no dashes.\n\nCLINICAL CONSTITUTION:\n' +
      principles,
    messages: [
      {
        role: 'user',
        content: `DE-IDENTIFIED NOTE:\n${note}\n\nREPORTS:\n${JSON.stringify(
          reports.map((r) => ({ for: r.stakeholder, summary: r.summary, sections: r.sections, actions: r.actions })),
        )}`,
      },
    ],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use from critic')
  const inp = block.input as { critiques?: { target: Stakeholder | 'all'; issue: string; severity: 'low' | 'medium' | 'high' }[] }
  return (inp.critiques ?? []).map((c) => ({ ...dehyphen(c), action: 'flagged' as const }))
}

// ── The pipeline ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim()
  const limited = rateLimited(ip)
  if (limited) {
    return new Response(JSON.stringify({ error: limited }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })
  }

  let note = ''
  let clientEntities: Entity[] = []
  let deid: ExtractionResult['deid'] = null
  try {
    const body = await req.json()
    note = (body?.note || '').toString().slice(0, 30000)
    clientEntities = Array.isArray(body?.entities) ? (body.entities as Entity[]).slice(0, 400) : []
    if (body?.deid && typeof body.deid.redactions === 'number') {
      deid = { redactions: body.deid.redactions, types: (body.deid.types ?? []).slice(0, 40).map(String) }
    }
  } catch {
    /* handled below */
  }
  if (!note.trim()) {
    return new Response(JSON.stringify({ error: 'A de-identified note is required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'The synthesis service is not configured (missing model API credentials).' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }
  const client = new Anthropic({ apiKey })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      const stage = (id: string, detail: string, t0: number) => send({ type: 'stage', id, detail, ms: Date.now() - t0 })

      try {
        // 1) Integrity: every client entity must literally appear in the note.
        let t0 = Date.now()
        const lower = note.toLowerCase()
        const verified = clientEntities.filter(
          (e) =>
            e.text &&
            e.text.length <= 120 &&
            (typeof e.start === 'number' && typeof e.end === 'number'
              ? note.slice(e.start, e.end).toLowerCase() === e.text.toLowerCase()
              : lower.includes(e.text.toLowerCase())),
        )

        // 2) Medications: RxNorm prescribable vocabulary decides what is a drug.
        //    Diagnosis and symptom entities that the note negates are dropped.
        const entities: Entity[] = verified
          .filter((e) => !((e.type === 'DIAGNOSIS' || e.type === 'SIGN_SYMPTOM') && typeof e.start === 'number' && isNegated(note, e.start)))
          .map((e) => {
            if (e.type !== 'CHEM') return e
            const hit = medMatch(e.text)
            return hit ? { ...e, type: 'MEDICATION' } : { ...e, type: 'CHEMICAL' }
          })
        // Clinical abbreviation extractor: catches DM2, HTN, HLD, CKD3, HF and
        // other shorthand the spelled-out OpenMed models miss.
        for (const a of extractAbbreviations(note)) {
          if (!entities.some((e) => e.start === a.start && e.text.toLowerCase() === a.text.toLowerCase())) entities.push(a)
        }
        const abbrevCount = entities.filter((e) => e.source === 'synthure').length
        stage('ner', `${entities.length} entities (${entities.filter((e) => e.type === 'MEDICATION').length} RxNorm meds, ${abbrevCount} from shorthand), negated findings dropped`, t0)

        // 3) Symptom / lab spans (verbatim, verified).
        t0 = Date.now()
        const spanEnts = await tagSpans(client, note)
        for (const s of spanEnts) {
          if (!entities.some((e) => e.start === s.start && e.end === s.end)) entities.push(s)
        }
        stage('spans', `${spanEnts.length} symptom/lab spans tagged and verified`, t0)

        // Note type (Synthure classifier) up front; it informs visit inference.
        const nt = classifyNoteType(note)

        // 4) + 5) Codes: literal ones validated, diagnosis entities linked via the index.
        t0 = Date.now()
        const litIcd = literalIcd(note)
        const cpt = literalProcs(note)
        const diagEnts = entities.filter((e) => e.type === 'DIAGNOSIS')
        const linked = linkDiagnoses(diagEnts)
        const modelLinked = await modelLinkCodes(diagEnts.map((e) => e.text))
        const icdMap = new Map<string, ExtractionResult['icd10'][number]>()
        for (const l of linked) icdMap.set(l.code, l)
        for (const l of litIcd) icdMap.set(l.code, l) // literal codes win
        for (const m of modelLinked) {
          const existing = icdMap.get(m.code)
          if (existing) { existing.trained = true; existing.modelScore = m.modelScore } // trained coder confirms
          else icdMap.set(m.code, m) // trained coder adds a code the lexical linker missed
        }
        const icd10 = [...icdMap.values()]
        // If the encounter has diagnoses but no procedure was written, suggest an
        // evaluation and management visit so the claim is not empty.
        const visit = inferVisit(nt.type, icd10.length > 0, cpt.length > 0)
        if (visit) cpt.push(visit)
        stage('rag', `${icd10.length} ICD 10 codes resolved (${litIcd.length} literal, ${icd10.length - litIcd.length} linked), ${cpt.length} services${visit ? ' (visit inferred)' : ''} priced from CMS schedules`, t0)

        // 6) Cohorts, consumer language, readiness, readmission.
        t0 = Date.now()
        const cohortMap = new Map<string, { id: string; label: string }>()
        for (const c of icd10) {
          const cat = ccsrCategory(c.code)
          if (cat) cohortMap.set(cat.id, cat)
        }
        await Promise.all(
          icd10.map(async (c) => {
            const plain = await medlinePlus(c.code)
            if (plain) {
              c.plain = plain
              c.plainSource = 'MedlinePlus Connect (NLM)'
            }
          }),
        )
        const readiness = assessReadiness(note, icd10, cpt)
        const readm = inferReadmission(icd10)
        const modelConfs = entities.filter((e) => e.source === 'openmed' && typeof e.confidence === 'number')
        const confidence = modelConfs.length
          ? Number(Math.min(...modelConfs.map((e) => e.confidence as number)).toFixed(2))
          : 1 // purely literal extraction: nothing model generated to doubt

        // Synthure owned models run in process. These are the decision making
        // predictions; Claude is not consulted for any of them. (nt classified above.)
        const sections = parseSections(note)
        const missingPreds = detectMissing(note, nt.type, icd10.length, cpt.length).filter((m) => m.present)
        const readyModel = predictReadiness(note, nt.type, icd10.length, cpt.length)

        const ex: ExtractionResult = dehyphen({
          entities,
          icd10,
          cpt,
          noteType: { type: nt.type, label: NOTE_TYPE_LABELS[nt.type], confidence: nt.confidence },
          sections: sections.map((s) => ({ name: s.name, label: s.label })),
          missing: missingPreds.map((m) => ({ field: m.field, probability: m.probability })),
          modelReadiness: readyModel,
          readiness: { checks: readiness.checks, lane: readiness.lane },
          reviewRisk: readiness.reviewRisk,
          readmissionRisk: readm.risk,
          readmissionDriver: readm.driver,
          readmissionCalibrated: readm.calibrated,
          priorAuth: readiness.priorAuth,
          reviewFactors: readiness.factors,
          confidence,
          cohorts: [...cohortMap.values()],
          deid,
          models: {
            'De identification (on device)': OPENMED_MODELS.deid.label,
            'Disease NER (on device)': OPENMED_MODELS.disease.label,
            'Pharma NER (on device)': OPENMED_MODELS.pharma.label,
            'Note type classifier (Synthure)': 'TF IDF + logistic regression',
            'Section parser (Synthure)': 'rule based header detection',
            'Missing info detector (Synthure)': 'per field logistic regression',
            'Readiness predictor (Synthure)': 'gradient boosted trees + isotonic calibration',
            'Code reranker (Synthure)': 'logistic regression over index candidates',
            'Span tagging': 'Claude Haiku 4.5 (verbatim spans, verified server side)',
            Writers: 'Claude Haiku 4.5 / Sonnet 4.6 (narration of the record, not decisions)',
          },
        })
        stage('classify', `note type ${NOTE_TYPE_LABELS[nt.type]} (${Math.round(nt.confidence * 100)}%), ${sections.length} sections parsed`, t0)
        stage('risk', `model readiness ${Math.round(readyModel.calibrated * 100)}% (${readyModel.band}), ${missingPreds.length} missing fields, ${readiness.checks.filter((c) => c.status === 'pass').length}/${readiness.checks.length} checks passing`, t0)
        if (MODEL_API) {
          ex.models['ICD coder (Synthure, trained)'] =
            'bi encoder retriever + cross encoder reranker (A100, FY2026 index + CodiEsp)'
        }
        send({ type: 'extracted', extraction: ex })

        // 7) Writers in parallel.
        const reports = await Promise.all(
          STAKEHOLDER_ORDER.map(async (s) => {
            const report = await claudeReport(client, s, note, ex)
            const flags = await modelFaithfulness(note, ex, report)
            if (flags) report.flags = flags
            send({ type: 'report', report })
            return report
          }),
        )
        reports.sort((a, b) => STAKEHOLDER_ORDER.indexOf(a.stakeholder) - STAKEHOLDER_ORDER.indexOf(b.stakeholder))

        // 8) Verifier + constitution critic.
        t0 = Date.now()
        const [verification, criticFindings] = await Promise.all([
          claudeVerify(client, note, ex, reports),
          claudeCritic(client, note, reports),
        ])
        send({ type: 'verification', verification })

        const safety = assessSafety(note, ex, reports)
        const seen = new Set(safety.critiques.map((c) => c.issue))
        for (const c of criticFindings) if (!seen.has(c.issue)) safety.critiques.push(c)
        safety.mode = 'claude assisted'

        // 9) Revision pass: flagged reports go back through their writer with the
        // critique attached. Bounded to two revisions per run.
        const issuesByTarget = new Map<Stakeholder, string[]>()
        const addIssue = (target: Stakeholder | 'all' | undefined, text: string) => {
          const targets: Stakeholder[] = !target || target === 'all' ? [...STAKEHOLDER_ORDER] : [target]
          for (const t of targets) issuesByTarget.set(t, [...(issuesByTarget.get(t) ?? []), text])
        }
        for (const ch of verification.checks) if (ch.status === 'flag') addIssue(ch.target, `${ch.label}: ${ch.note}`)
        for (const c of safety.critiques) if (c.severity !== 'low') addIssue(c.target, c.issue)

        let revised = 0
        for (const [target, issues] of issuesByTarget) {
          if (revised >= 2) break
          const before = reports.find((r) => r.stakeholder === target)
          if (!before) continue
          const after = await claudeReport(client, target, note, ex, issues.join('\n'))
          reports[reports.findIndex((r) => r.stakeholder === target)] = after
          send({ type: 'report', report: after, revised: true })
          safety.revision = {
            target,
            before: before.summary,
            after: after.summary,
            note: `The ${target} report was revised after the verifier/critic flagged: ${issues[0]}`,
          }
          for (const c of safety.critiques) if (c.target === target || c.target === 'all') c.action = 'revised'
          revised += 1
        }
        if (revised) stage('revise', `${revised} report${revised === 1 ? '' : 's'} revised from verifier/critic findings`, t0)
        safety.caughtViolations = safety.critiques.length
        send({ type: 'safety', safety })

        // 10) Orchestrator reads the final (post revision) reports.
        const synthesis = await claudeSynthesis(client, note, ex, reports)
        send({ type: 'synthesis', synthesis })

        send({ type: 'done', model: 'openmed + claude', live: true })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'synthesis failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
