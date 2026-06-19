import Anthropic from '@anthropic-ai/sdk'
import {
  extract,
  dehyphen,
  fallbackReport,
  fallbackVerification,
  fallbackSynthesis,
} from '@/lib/engine'
import {
  STAKEHOLDER_ORDER,
  type ExtractionResult,
  type Stakeholder,
  type StakeholderReport,
  type Synthesis,
  type Verification,
} from '@/lib/synthure'

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
    `- Denial risk: ${ex.denialRisk}%  ·  Readmission risk: ${ex.readmissionRisk}%  ·  NER confidence: ${ex.confidence}`,
  ].join('\n')
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
    'You are the Care Navigator agent supporting the treating physician. Be precise and clinical. Cover suggested ICD 10 and CPT coding with sequencing rationale, documentation and specificity prompts, prior authorization needs, denial risk and concrete mitigations, order and care coordination, follow up and monitoring, and grounded clinical references. You never prescribe or diagnose; you support the physician and save them time.',
  hospital:
    'You are the Revenue Cycle agent for the hospital. Cover the full revenue cycle in detail: claim construction, denial probability with its drivers, routing and adjudication lane, expected reimbursement posture, readmission and HRRP exposure, AR and appeals workflow, and patient financial and assistance screening. Be operational and financial.',
  employer:
    'You are the Benefits Analyst agent for the employer and plan sponsor. Work only with aggregated, anonymized information. Cover the population cohort this encounter rolls into, cost exposure and projection, network utilization, benefits and plan design optimization, ACA and COBRA compliance posture, and wellness program matching. Be strategic and quantitative without exposing identifying clinical detail.',
}

async function claudeReport(
  client: Anthropic,
  s: Stakeholder,
  note: string,
  ex: ExtractionResult,
): Promise<StakeholderReport> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 2600,
    tools: [REPORT_TOOL],
    tool_choice: { type: 'tool', name: 'write_report' },
    system: `${ROLE_BRIEF[s]}\n\n${STYLE}`,
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

export async function POST(req: Request) {
  let note = ''
  try {
    const body = await req.json()
    note = (body?.note || '').toString().slice(0, 30000)
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
  const ex = extract(note)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      try {
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
