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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

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

// ── Constrained diagnosis linking ─────────────────────────────────────────────
// Candidates come from the official ICD 10 CM alphabetic index. Claude returns
// an option number per entity (or abstains); anything outside the retrieved
// candidate set is impossible by construction.
const LINK_TOOL: Anthropic.Tool = {
  name: 'select_codes',
  description: 'For each entity, select the best candidate code by its option number, or abstain.',
  input_schema: {
    type: 'object',
    properties: {
      selections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entity: { type: 'number', description: 'The entity number' },
            option: { type: 'number', description: 'The chosen option number, or -1 to abstain when no candidate fits' },
          },
          required: ['entity', 'option'],
        },
      },
    },
    required: ['selections'],
  },
}

interface LinkedCode {
  code: string
  label: string
  billable: boolean
  source: 'linked'
  entity: string
}

async function linkDiagnoses(
  client: Anthropic,
  note: string,
  diagnoses: Entity[],
): Promise<LinkedCode[]> {
  const withCands = diagnoses
    .map((e) => ({ e, cands: icdCandidates(e.text, 8) }))
    .filter((x) => x.cands.length > 0)
  if (!withCands.length) return []
  const listing = withCands
    .map(
      ({ e, cands }, i) =>
        `ENTITY ${i}: "${e.text}"\n` +
        cands.map((c, j) => `  option ${j}: ${c.code} ${c.description}${c.billable ? '' : ' [category header, not billable]'}`).join('\n'),
    )
    .join('\n')
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 700,
    tools: [LINK_TOOL],
    tool_choice: { type: 'tool', name: 'select_codes' },
    system:
      'You map extracted diagnosis entities to ICD 10 CM codes. For each entity choose the single best option from its retrieved candidates (from the official ICD 10 CM alphabetic index), using the note for context. Prefer billable codes at the highest specificity the note supports. If no candidate correctly describes the entity, abstain with -1. You cannot propose codes outside the candidates.',
    messages: [{ role: 'user', content: `NOTE (context):\n${note}\n\nCANDIDATES:\n${listing}` }],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use from linker')
  const inp = block.input as { selections?: { entity: number; option: number }[] }
  const out: LinkedCode[] = []
  for (const sel of inp.selections ?? []) {
    const row = withCands[sel.entity]
    if (!row || sel.option < 0 || sel.option >= row.cands.length) continue // abstain or invalid -> uncoded
    const c: IcdCandidate = row.cands[sel.option]
    out.push({ code: c.code, label: c.description, billable: c.billable, source: 'linked', entity: row.e.text })
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
        const entities: Entity[] = verified.map((e) => {
          if (e.type !== 'CHEM') return e
          const hit = medMatch(e.text)
          return hit ? { ...e, type: 'MEDICATION' } : { ...e, type: 'CHEMICAL' }
        })
        stage('ner', `${entities.length} on device entities verified (${entities.filter((e) => e.type === 'MEDICATION').length} RxNorm matched medications)`, t0)

        // 3) Symptom / lab spans (verbatim, verified).
        t0 = Date.now()
        const spanEnts = await tagSpans(client, note)
        for (const s of spanEnts) {
          if (!entities.some((e) => e.start === s.start && e.end === s.end)) entities.push(s)
        }
        stage('spans', `${spanEnts.length} symptom/lab spans tagged and verified`, t0)

        // 4) + 5) Codes: literal ones validated, diagnosis entities linked via the index.
        t0 = Date.now()
        const litIcd = literalIcd(note)
        const cpt = literalProcs(note)
        const diagEnts = entities.filter((e) => e.type === 'DIAGNOSIS')
        const linked = await linkDiagnoses(client, note, diagEnts)
        const icdMap = new Map<string, ExtractionResult['icd10'][number]>()
        for (const l of linked) icdMap.set(l.code, l)
        for (const l of litIcd) icdMap.set(l.code, l) // literal codes win
        const icd10 = [...icdMap.values()]
        stage('rag', `${icd10.length} ICD 10 codes resolved (${litIcd.length} literal, ${icd10.length - litIcd.length} linked from entities), ${cpt.length} services priced from CMS schedules`, t0)

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

        const ex: ExtractionResult = dehyphen({
          entities,
          icd10,
          cpt,
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
            'Span tagging': 'Claude Haiku 4.5 (verbatim spans, verified server side)',
            'Code linking': 'ICD 10 CM FY2026 index retrieval + Claude Haiku 4.5 (constrained choice)',
            Writers: 'Claude Haiku 4.5 / Sonnet 4.6 (frontier lane)',
            'Verifier / Critic / Orchestrator': 'Claude Sonnet 4.6',
          },
        })
        stage('risk', `readiness ${readiness.checks.filter((c) => c.status === 'pass').length}/${readiness.checks.length} checks passing, lane ${readiness.lane}`, t0)
        send({ type: 'extracted', extraction: ex })

        // 7) Writers in parallel.
        const reports = await Promise.all(
          STAKEHOLDER_ORDER.map(async (s) => {
            const report = await claudeReport(client, s, note, ex)
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
