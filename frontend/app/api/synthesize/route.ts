import Anthropic from '@anthropic-ai/sdk'
import {
  extract,
  assembleExtraction,
  dehyphen,
  fallbackReport,
  fallbackVerification,
  fallbackSynthesis,
} from '@/lib/engine'
import {
  STAKEHOLDER_ORDER,
  CONSTITUTION,
  type ExtractionResult,
  type SafetyResult,
  type Stakeholder,
  type StakeholderReport,
  type Synthesis,
  type Verification,
} from '@/lib/synthure'
import { assessSafety } from '@/lib/safety'
import { fhirBundleToNote } from '@/lib/fhir'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-4-6'

function exContext(note: string, ex: ExtractionResult): string {
  return [
    `CLINICAL NOTE:\n${note}`,
    '',
    'EXTRACTED FACTS (the only facts you may use — do not invent any clinical detail):',
    `- Diagnoses: ${ex.icd10.map((c) => `${c.code} ${c.label}`).join('; ') || 'none coded'}`,
    `- Procedures: ${ex.cpt.map((c) => `${c.code} ${c.label}`).join('; ') || 'none coded'}`,
    `- Medications: ${ex.entities.filter((e) => e.type === 'MEDICATION').map((e) => e.text).join(', ') || 'none'}`,
    `- Signs/symptoms: ${ex.entities.filter((e) => e.type === 'SIGN_SYMPTOM').map((e) => e.text).join(', ') || 'none'}`,
    `- Prior authorization required (published payer policy): ${ex.priorAuth.map((p) => `${p.procedure} ${p.code} [${p.source}]`).join('; ') || 'none'}`,
    `- Claim review factors (sourced, deterministic): ${ex.reviewFactors.map((f) => f.label).join('; ') || 'none'}`,
    `- Readmission risk (calibrated to CMS HRRP published rate): ${ex.readmissionRisk}%  ·  NER confidence: ${ex.confidence}`,
    'IMPORTANT: Do not state a denial probability. There is no claim outcome model. Only discuss prior authorization and claim readiness as sourced facts, and readmission as the CMS published rate.',
  ].join('\n')
}

// ── Biomedical NER agent (real, when a key is present) ───────────────────────
const NER_TOOL: Anthropic.Tool = {
  name: 'extract_entities',
  description: 'Extract clinical entities from the note and map them to standard codes.',
  input_schema: {
    type: 'object',
    properties: {
      diagnoses: {
        type: 'array',
        description: 'Every diagnosis or problem, including ones written in plain language or as abbreviations, each mapped to its standard ICD 10 code.',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Standard ICD 10 code, e.g. I10 or E11.9' },
            label: { type: 'string', description: 'Human readable diagnosis name' },
          },
          required: ['code', 'label'],
        },
      },
      procedures: {
        type: 'array',
        description: 'Procedures, tests, or services ordered, mapped to a CPT code when known.',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Five digit CPT code' },
            label: { type: 'string' },
          },
          required: ['code', 'label'],
        },
      },
      medications: { type: 'array', items: { type: 'string' }, description: 'Generic medication names' },
      symptoms: { type: 'array', items: { type: 'string' }, description: 'Signs and symptoms' },
      labs: { type: 'array', items: { type: 'string' }, description: 'Lab tests or vitals mentioned, e.g. A1C, LDL, Blood pressure' },
    },
    required: ['diagnoses', 'procedures', 'medications', 'symptoms', 'labs'],
  },
}

async function claudeExtract(client: Anthropic, note: string): Promise<ExtractionResult> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 1500,
    tools: [NER_TOOL],
    tool_choice: { type: 'tool', name: 'extract_entities' },
    system:
      'You are a biomedical NER agent. Read the clinical note and extract its entities. Map every diagnosis to its standard ICD 10 code, including diagnoses written in plain language (for example "high blood pressure" maps to I10) or as abbreviations (for example "HTN" maps to I10, and "type 2 diabetes" or "DM2" maps to E11.9). Map procedures to their CPT code when you know it. Only return real, valid codes; if you are unsure of a code, omit that entry rather than inventing it, and never return a number that is not actually a code. Write every label with no hyphens and no dashes.',
    messages: [{ role: 'user', content: `CLINICAL NOTE:\n${note}` }],
  })
  const block = msg.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('no tool_use from NER')
  const inp = block.input as {
    diagnoses?: { code: string; label: string }[]
    procedures?: { code: string; label: string }[]
    medications?: string[]
    symptoms?: string[]
    labs?: string[]
  }
  // assembleExtraction validates every code, so any invented or malformed code is dropped.
  return dehyphen(
    assembleExtraction(note, {
      icd10: inp.diagnoses ?? [],
      cpt: inp.procedures ?? [],
      medications: inp.medications ?? [],
      symptoms: inp.symptoms ?? [],
      labs: inp.labs ?? [],
    }),
  )
}

const REPORT_TOOL: Anthropic.Tool = {
  name: 'write_report',
  description: 'Return a structured stakeholder report.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Short, punchy headline (max 6 words)' },
      summary: { type: 'string', description: '1–2 sentence overview for this reader' },
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

// Shared style contract for every writer agent.
const STYLE =
  'Produce a thorough, detailed report: 5 to 7 sections, each with a short body and 2 to 5 specific bullets, plus 3 to 5 concrete actions the agent has taken. Be specific and reference the actual conditions, codes, medications, labs, and risk scores. Ground every statement strictly in the extracted facts and the note; never invent clinical values or codes. Critically: write with NO hyphens and NO dashes of any kind (do not use the characters "-", "—", or "–"); rephrase using spaces, commas, or parentheses instead (for example write "ICD 10", "out of network", "follow up", "one tap").'

const ROLE_BRIEF: Record<Stakeholder, string> = {
  patient:
    'You are the Patient Advocate agent. Write for the patient at about a 6th grade reading level: warm, clear, and reassuring, never alarming. Your report MUST (1) translate every diagnosis and medical term into plain everyday language, explaining what each condition is and why it matters; (2) explain each medication, what it does and how to take it; (3) explain any lab values or test results; (4) include a detailed insurance and cost allocation section that estimates what insurance is likely to cover for each service and medication, the patient out of pocket range, deductible and copay context, and financial assistance options, clearly labeled as illustrative estimates; (5) give clear next steps, when to seek care sooner, and questions to ask. Be genuinely useful and complete.',
  physician:
    'You are the Care Navigator agent supporting the treating physician. Be precise and clinical. Cover suggested ICD 10 and CPT coding with sequencing rationale, documentation and specificity prompts, prior authorization needs (only those listed as required by published payer policy), claim readiness and concrete mitigations, order and care coordination, follow up and monitoring, and grounded clinical references. Do not state a denial probability. You never prescribe or diagnose; you support the physician and save them time.',
  hospital:
    'You are the Revenue Cycle agent for the hospital. Cover the full revenue cycle in detail: claim construction, claim readiness with its sourced drivers (prior authorization from published payer policy and claim validity, never a fabricated denial probability), routing and review lane, expected reimbursement posture, readmission and HRRP exposure using the CMS published rate provided, AR and appeals workflow, and patient financial and assistance screening. Be operational and financial.',
  employer:
    'You are the Benefits Analyst agent for the employer and plan sponsor. Work only with aggregated, anonymized information. Cover the population cohort this encounter rolls into, cost exposure and projection, network utilization, benefits and plan design optimization, ACA and COBRA compliance posture, and wellness program matching. Be strategic and quantitative without exposing identifying clinical detail.',
}

// Model routing: send claims with a heavy review load (prior authorization or
// validity flags) through the frontier model (Sonnet) and keep routine ones on
// the cheaper, faster model (Haiku).
function writerModel(s: Stakeholder, ex: ExtractionResult): string {
  return ex.reviewRisk >= 60 && (s === 'hospital' || s === 'physician') ? SONNET : HAIKU
}

async function claudeReport(
  client: Anthropic,
  s: Stakeholder,
  note: string,
  ex: ExtractionResult,
): Promise<StakeholderReport> {
  const msg = await client.messages.create({
    model: writerModel(s, ex),
    max_tokens: 2600,
    // Prompt caching: the tool schema and the shared style guide are stable
    // across all four writers and across requests within the cache TTL, so we
    // mark them cacheable to cut input token cost.
    tools: [{ ...REPORT_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'write_report' },
    system: [
      { type: 'text', text: STYLE, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ROLE_BRIEF[s] },
    ],
    messages: [{ role: 'user', content: exContext(note, ex) }],
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
          },
          required: ['label', 'status', 'note'],
        },
      },
    },
    required: ['confidence', 'sourcesChecked', 'checks'],
  },
}

async function claudeVerify(
  client: Anthropic,
  note: string,
  ex: ExtractionResult,
  reports: StakeholderReport[],
): Promise<Verification> {
  const msg = await client.messages.create({
    model: SONNET,
    max_tokens: 1100,
    tools: [VERIFY_TOOL],
    tool_choice: { type: 'tool', name: 'verify' },
    system:
      'You are the Verifier agent. Audit the four stakeholder reports against the extracted facts and clinical knowledge. Flag any statement that is not supported by the note or extraction or that is clinically unsafe. Return 4 to 6 specific checks. Write with no hyphens and no dashes.',
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
  return dehyphen(block.input as Verification)
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
      'You are the Orchestrator agent. Show how a single clinical note produced four tailored reports. Connect them so a reader sees the shared facts driving each. Be specific and reference the actual conditions, codes, and risks. Write with no hyphens and no dashes.',
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

// ── Constitution Critic (Constitutional AI, inference time) ──────────────────
// Augments the deterministic safety pass with a Claude critic that reads every
// report against the clinical constitution and reports any principle it judges
// violated. Findings are merged into the deterministic SafetyResult.
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
        content: `CLINICAL NOTE:\n${note}\n\nREPORTS:\n${JSON.stringify(
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

export async function POST(req: Request) {
  let note = ''
  try {
    const body = await req.json()
    note = (body?.note || '').toString().slice(0, 30000)
    // Accept a real FHIR Bundle as an alternative to pasted text.
    if (!note.trim() && body?.fhir) note = fhirBundleToNote(body.fhir).slice(0, 30000)
  } catch {
    /* ignore */
  }
  if (!note.trim()) {
    return new Response(JSON.stringify({ error: 'Note is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  const client = apiKey ? new Anthropic({ apiKey }) : null

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
        // Biomedical NER: real Claude extraction when a key is present, with the
        // deterministic regex extractor as the always available fallback.
        let ex = extract(note)
        if (client) {
          try {
            ex = await claudeExtract(client, note)
          } catch {
            /* fall back to the regex extraction already in ex */
          }
        }
        send({ type: 'extracted', extraction: ex })

        // Four writer agents — run in parallel, stream each report as it lands.
        const tasks = STAKEHOLDER_ORDER.map(async (s) => {
          let report: StakeholderReport
          try {
            report = client ? await claudeReport(client, s, note, ex) : fallbackReport(s, ex)
          } catch {
            report = fallbackReport(s, ex)
          }
          send({ type: 'report', report })
          return report
        })
        const reports = await Promise.all(tasks)
        // Keep canonical order for downstream agents
        reports.sort(
          (a, b) => STAKEHOLDER_ORDER.indexOf(a.stakeholder) - STAKEHOLDER_ORDER.indexOf(b.stakeholder),
        )

        let verification: Verification
        try {
          verification = client ? await claudeVerify(client, note, ex, reports) : fallbackVerification(ex)
        } catch {
          verification = fallbackVerification(ex)
        }
        send({ type: 'verification', verification })

        let synthesis: Synthesis
        try {
          synthesis = client ? await claudeSynthesis(client, note, ex, reports) : fallbackSynthesis(ex)
        } catch {
          synthesis = fallbackSynthesis(ex)
        }
        send({ type: 'synthesis', synthesis })

        // Alignment & safety: deterministic constitution + autonomy gate always,
        // augmented by the Claude Constitution Critic when a key is present.
        const safety = assessSafety(note, ex, reports)
        if (client) {
          try {
            const extra = await claudeCritic(client, note, reports)
            const seen = new Set(safety.critiques.map((c) => c.issue))
            for (const c of extra) if (!seen.has(c.issue)) safety.critiques.push(c)
            safety.caughtViolations = safety.critiques.length
            safety.mode = 'claude assisted'
          } catch {
            /* keep the deterministic safety result */
          }
        }
        send({ type: 'safety', safety })

        send({ type: 'done', model: client ? 'claude' : 'synthure engine', live: !!client })
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
