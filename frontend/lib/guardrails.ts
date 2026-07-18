// ── Layered guardrail engine ────────────────────────────────────────────────
// Deterministic, defense in depth verification of the agent pipeline's output.
// The point is to answer two questions a single LLM "looks good" opinion cannot:
//   (1) is each agent's output actually grounded and safe, and
//   (2) can we score a run and grade the guardrails themselves.
//
// Every check here is a pure function of the note, the validated extraction, and
// the generated reports. Nothing calls an LLM, so the guardrails hold with or
// without an API key and are unit testable headlessly (see guardrails.harness.ts).
//
// This engine is intentionally DECOUPLED from the rest of the app: it depends on
// the minimal structural contracts below, not on the full ExtractionResult /
// StakeholderReport types. The real types satisfy these contracts structurally,
// so route.ts passes the real objects unchanged, and the engine can be compiled
// and tested in isolation.

// ── Minimal input contract (structural subset of the real app types) ─────────
export type GStakeholder = 'patient' | 'physician' | 'hospital' | 'employer'

export interface GCode { code: string; label?: string; billable?: boolean }
export interface GProc { code: string; label?: string; price?: number | null }
export interface GEntity { text: string; type: string }
export interface GCheck { status: 'pass' | 'flag'; severity: 'blocking' | 'advisory'; label: string }

export interface GExtraction {
  icd10: GCode[]
  cpt: GProc[]
  entities: GEntity[]
  readiness: { checks: GCheck[] }
  priorAuth: { code: string }[]
  confidence: number
  readmissionRisk: number
}

export interface GReportSection { heading: string; body: string; bullets?: string[] }
export interface GReport {
  stakeholder: GStakeholder
  headline: string
  summary: string
  sections: GReportSection[]
  actions: string[]
  metrics?: { label: string; value: string }[]
}

export interface GuardInput {
  note: string
  extraction: GExtraction
  reports: GReport[]
  // Dollar and percent figures the reports are allowed to cite (prices, the
  // allowed total, the patient estimate, plan design values, the readmission
  // rate). Provided by route.ts, which knows the benefit math; when omitted the
  // numbers check falls back to "must appear in the note".
  knownNumbers?: number[]
}

// ── Output types ─────────────────────────────────────────────────────────────
export type GuardLayer = 'input' | 'grounding' | 'policy' | 'consistency' | 'style' | 'quality'
export type GuardSeverity = 'blocking' | 'high' | 'medium' | 'low'
export type GuardStatus = 'pass' | 'flag'
export type GuardDecision = 'ship' | 'revise' | 'block' | 'escalate'

export interface GuardFinding {
  id: string
  layer: GuardLayer
  severity: GuardSeverity
  status: GuardStatus
  target: GStakeholder | 'all' | 'extraction'
  detail: string
  evidence?: string[]
}

export interface GuardrailReport {
  findings: GuardFinding[]
  flagged: GuardFinding[]
  score: number // 0..1 weighted pass rate
  blocked: boolean
  decision: GuardDecision
  reviseTargets: GStakeholder[]
  byLayer: Record<GuardLayer, { pass: number; flag: number }>
  summary: string
  mode: 'deterministic'
}

const LAYERS: GuardLayer[] = ['input', 'grounding', 'policy', 'consistency', 'style', 'quality']
const WEIGHT: Record<GuardSeverity, number> = { blocking: 5, high: 3, medium: 2, low: 1 }

// ── Helpers ──────────────────────────────────────────────────────────────────
const CODE_RE = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?|\d{5})\b/g
const DOLLAR_RE = /\$\s?([\d,]+(?:\.\d{1,2})?)/g
const PERCENT_RE = /\b(\d{1,3}(?:\.\d)?)\s?%/g
const DASH_RE = /[–—]|(?<=[A-Za-z])-(?=[A-Za-z])/g // en dash, em dash, or an intra word hyphen
const HEDGE_RE = /\b(estimate|estimated|illustrative|likely|roughly|about|approximate|approximately|typical|depends)\b/i
const INJECTION_RES: RegExp[] = [
  /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(the\s+)?(previous|above|prior)/i,
  /you\s+are\s+now\s+/i,
  /system\s+prompt/i,
  /\bas\s+an?\s+(ai|language\s+model)\b/i,
  /override\s+(the\s+)?(safety|instructions|guardrails)/i,
  /\bBEGIN\s+SYSTEM\b/i,
]
const DENIAL_PROB_RES: RegExp[] = [
  /\bdenial\s+(probability|risk|score|likelihood|rate|chance)\b/i,
  /\b\d{1,3}\s?%[^.\n]{0,24}\b(denial|denied|reject)/i,
  /\b(denial|denied|reject\w*)[^.\n]{0,24}\b\d{1,3}\s?%/i,
  /\b(likely|probability|chance)[^.\n]{0,20}\bdenied\b/i,
]
const CLINICAL_DECISION_RE = /\b(we have prescribed|i prescribe|i am prescribing|synthure prescribes|synthure diagnoses|diagnosis confirmed by synthure|we are changing your (medication|treatment)|we diagnose you with)\b/i
const PHI_RES: RegExp[] = [
  /\b(?:Mr|Mrs|Ms|Dr|Patient)\.?\s+[A-Z][a-z]+/,
  /\bMRN[:#\s]*[A-Za-z0-9-]{4,}/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
]
const CLEAN_CLAIM_RE = /\b(clean claim|no issues|ready to submit|all checks pass|nothing to fix|no outstanding)\b/i

function reportText(r: GReport): string {
  return [
    r.headline,
    r.summary,
    ...r.sections.flatMap((s) => [s.heading, s.body, ...(s.bullets ?? [])]),
    ...r.actions,
    ...(r.metrics ?? []).flatMap((m) => [m.label, m.value]),
  ].join('  ')
}
const num = (s: string) => parseFloat(s.replace(/,/g, ''))
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// ── The checks ───────────────────────────────────────────────────────────────
function checkInput(inp: GuardInput): GuardFinding[] {
  const out: GuardFinding[] = []
  const injection = INJECTION_RES.filter((re) => re.test(inp.note)).length
  out.push({
    id: 'input.injection',
    layer: 'input',
    severity: 'high',
    status: injection ? 'flag' : 'pass',
    target: 'extraction',
    detail: injection
      ? 'The note contains text that looks like an instruction injection aimed at the model. A clinical note should carry no directives to the system.'
      : 'No prompt injection patterns detected in the note.',
    evidence: injection ? INJECTION_RES.filter((re) => re.test(inp.note)).map((re) => (inp.note.match(re) ?? [''])[0]) : undefined,
  })
  return out
}

function checkGrounding(inp: GuardInput): GuardFinding[] {
  const out: GuardFinding[] = []
  const known = new Set<string>([...inp.extraction.icd10.map((c) => c.code.toUpperCase()), ...inp.extraction.cpt.map((c) => c.code.toUpperCase())])
  const noteCodes = new Set<string>()
  for (const m of inp.note.toUpperCase().matchAll(CODE_RE)) noteCodes.add(m[1])

  // grounding.codes: any code in a report not in the validated extraction.
  for (const r of inp.reports) {
    const bad = new Set<string>()
    for (const m of reportText(r).toUpperCase().matchAll(CODE_RE)) {
      const c = m[1]
      if (!known.has(c) && !noteCodes.has(c)) bad.add(c)
    }
    if (bad.size) {
      out.push({
        id: 'grounding.codes',
        layer: 'grounding',
        severity: 'blocking',
        status: 'flag',
        target: r.stakeholder,
        detail: `The ${r.stakeholder} report cites codes not in the validated extraction: ${[...bad].join(', ')}. A code the pipeline never validated must not appear.`,
        evidence: [...bad],
      })
    }
  }

  // grounding.numbers: dollar and percent figures not traceable to a known figure.
  const knownNums = inp.knownNumbers ?? []
  const noteText = inp.note
  for (const r of inp.reports) {
    const txt = reportText(r)
    const badDollars: string[] = []
    for (const m of txt.matchAll(DOLLAR_RE)) {
      const v = num(m[1])
      const ok = knownNums.some((k) => near(k, v, Math.max(1, v * 0.01))) || noteText.includes(m[0].replace(/\s/g, '')) || noteText.includes(String(v))
      if (!ok) badDollars.push(m[0])
    }
    const badPct: string[] = []
    for (const m of txt.matchAll(PERCENT_RE)) {
      const v = num(m[1])
      const ok = knownNums.some((k) => near(k, v, 1)) || near(v, inp.extraction.readmissionRisk, 1) || noteText.includes(m[0].replace(/\s/g, ''))
      if (!ok) badPct.push(m[0])
    }
    const bad = [...badDollars, ...badPct]
    if (bad.length) {
      out.push({
        id: 'grounding.numbers',
        layer: 'grounding',
        severity: 'high',
        status: 'flag',
        target: r.stakeholder,
        detail: `The ${r.stakeholder} report states figures that do not trace to a priced service, the benefit math, the note, or the published rate: ${bad.join(', ')}.`,
        evidence: bad,
      })
    }
  }

  // grounding.billable: a code presented as billable that the tabular marks non billable.
  const nonBillable = new Set(inp.extraction.icd10.filter((c) => c.billable === false).map((c) => c.code.toUpperCase()))
  for (const r of inp.reports) {
    const txt = reportText(r).toLowerCase()
    const bad = [...nonBillable].filter((c) => txt.includes(c.toLowerCase()) && /billable|bill it|ready to bill/.test(txt))
    if (bad.length) {
      out.push({
        id: 'grounding.billable',
        layer: 'grounding',
        severity: 'medium',
        status: 'flag',
        target: r.stakeholder,
        detail: `A code the CMS tabular marks as a non billable category header is presented as billable: ${bad.join(', ')}.`,
        evidence: bad,
      })
    }
  }

  if (!out.some((f) => f.id === 'grounding.codes')) out.push({ id: 'grounding.codes', layer: 'grounding', severity: 'blocking', status: 'pass', target: 'all', detail: 'Every code in every report traces to the validated extraction or the note.' })
  if (!out.some((f) => f.id === 'grounding.numbers')) out.push({ id: 'grounding.numbers', layer: 'grounding', severity: 'high', status: 'pass', target: 'all', detail: 'Every dollar and percent figure traces to a priced service, the benefit math, the note, or the published rate.' })
  return out
}

function checkPolicy(inp: GuardInput): GuardFinding[] {
  const out: GuardFinding[] = []

  // policy.denial_probability: no report may state a denial probability.
  for (const r of inp.reports) {
    const txt = reportText(r)
    if (DENIAL_PROB_RES.some((re) => re.test(txt))) {
      out.push({ id: 'policy.denial_probability', layer: 'policy', severity: 'blocking', status: 'flag', target: r.stakeholder, detail: `The ${r.stakeholder} report states a denial probability. No claim adjudication data exists to ground one, so it must never be shown.`, evidence: DENIAL_PROB_RES.map((re) => (txt.match(re) ?? [''])[0]).filter(Boolean) })
    }
  }

  // policy.prescribing: no agent issued prescribing or diagnosing.
  const prescribers = inp.reports.filter((r) => CLINICAL_DECISION_RE.test(reportText(r)))
  for (const r of prescribers) {
    out.push({ id: 'policy.prescribing', layer: 'policy', severity: 'blocking', status: 'flag', target: r.stakeholder, detail: `The ${r.stakeholder} report contains agent issued prescribing or diagnosing language. The agent supports decisions, it never makes them.` })
  }

  // policy.phi_isolation: the employer aggregate view carries no identifying detail.
  for (const r of inp.reports.filter((r) => r.stakeholder === 'employer')) {
    const txt = reportText(r)
    if (PHI_RES.some((re) => re.test(txt))) {
      out.push({ id: 'policy.phi_isolation', layer: 'policy', severity: 'blocking', status: 'flag', target: 'employer', detail: 'Identifying information appears in the aggregate employer view, which must stay anonymized.', evidence: PHI_RES.map((re) => (txt.match(re) ?? [''])[0]).filter(Boolean) })
    }
  }

  // policy.cost_estimate_labeled: a dollar figure in the patient view must be an estimate.
  for (const r of inp.reports.filter((r) => r.stakeholder === 'patient')) {
    const txt = reportText(r)
    if (DOLLAR_RE.test(txt) && !HEDGE_RE.test(txt)) {
      out.push({ id: 'policy.cost_estimate_labeled', layer: 'policy', severity: 'medium', status: 'flag', target: 'patient', detail: 'A dollar figure is shown to the patient without labeling it as an estimate.' })
    }
  }

  for (const [id, sev] of [['policy.denial_probability', 'blocking'], ['policy.prescribing', 'blocking'], ['policy.phi_isolation', 'blocking'], ['policy.cost_estimate_labeled', 'medium']] as const) {
    if (!out.some((f) => f.id === id)) out.push({ id, layer: 'policy', severity: sev, status: 'pass', target: 'all', detail: passDetail(id) })
  }
  return out
}

function passDetail(id: string): string {
  switch (id) {
    case 'policy.denial_probability': return 'No report states a denial probability; only sourced prior authorization and validity facts are shown.'
    case 'policy.prescribing': return 'No report contains agent issued prescribing or diagnosing.'
    case 'policy.phi_isolation': return 'The aggregate employer view contains no identifying detail.'
    case 'policy.cost_estimate_labeled': return 'Cost figures shown to the patient are labeled as estimates.'
    default: return 'Check passed.'
  }
}

function checkConsistency(inp: GuardInput): GuardFinding[] {
  const out: GuardFinding[] = []
  const blocking = inp.extraction.readiness.checks.filter((c) => c.status === 'flag' && c.severity === 'blocking')
  for (const r of inp.reports.filter((r) => r.stakeholder === 'hospital' || r.stakeholder === 'physician')) {
    if (blocking.length && CLEAN_CLAIM_RE.test(reportText(r))) {
      out.push({ id: 'consistency.readiness', layer: 'consistency', severity: 'medium', status: 'flag', target: r.stakeholder, detail: `The ${r.stakeholder} report calls the claim clean while a blocking readiness check is open (${blocking.map((c) => c.label).join(', ')}).` })
    }
  }
  if (!out.length) out.push({ id: 'consistency.readiness', layer: 'consistency', severity: 'medium', status: 'pass', target: 'all', detail: 'Report claims about claim readiness are consistent with the checklist.' })
  return out
}

function checkStyle(inp: GuardInput): GuardFinding[] {
  const out: GuardFinding[] = []
  for (const r of inp.reports) {
    const hits = [...new Set((reportText(r).match(DASH_RE) ?? []))]
    if (hits.length) {
      out.push({ id: 'style.dashes', layer: 'style', severity: 'low', status: 'flag', target: r.stakeholder, detail: `The ${r.stakeholder} report contains dashes or hyphens, which the product style forbids (dehyphen should have removed them).`, evidence: hits })
    }
  }
  if (!out.length) out.push({ id: 'style.dashes', layer: 'style', severity: 'low', status: 'pass', target: 'all', detail: 'No hyphens or dashes in any report.' })
  return out
}

function checkQuality(inp: GuardInput): GuardFinding[] {
  const out: GuardFinding[] = []
  for (const r of inp.reports) {
    const problems: string[] = []
    if (!r.summary || r.summary.trim().length < 10) problems.push('missing summary')
    if (r.sections.length < 2) problems.push('fewer than two sections')
    if (r.actions.length < 1) problems.push('no actions')
    if (r.sections.some((s) => !s.body || s.body.trim().length < 8)) problems.push('an empty section body')
    if (problems.length) {
      out.push({ id: 'quality.structure', layer: 'quality', severity: 'low', status: 'flag', target: r.stakeholder, detail: `The ${r.stakeholder} report is structurally thin: ${problems.join(', ')}.`, evidence: problems })
    }
  }
  // quality.dx_coverage: a top billable diagnosis dropped from every report.
  const topDx = inp.extraction.icd10.filter((c) => c.billable !== false).slice(0, 2)
  const allText = inp.reports.map(reportText).join('  ').toLowerCase()
  const dropped = topDx.filter((c) => !allText.includes(c.code.toLowerCase()) && !(c.label && allText.includes(c.label.toLowerCase())))
  if (dropped.length && inp.reports.length) {
    out.push({ id: 'quality.dx_coverage', layer: 'quality', severity: 'medium', status: 'flag', target: 'all', detail: `A primary diagnosis is absent from every report: ${dropped.map((c) => `${c.code} ${c.label ?? ''}`.trim()).join('; ')}.`, evidence: dropped.map((c) => c.code) })
  }
  if (!out.some((f) => f.id === 'quality.structure')) out.push({ id: 'quality.structure', layer: 'quality', severity: 'low', status: 'pass', target: 'all', detail: 'Every report has a summary, at least two sections, and at least one action.' })
  if (!out.some((f) => f.id === 'quality.dx_coverage')) out.push({ id: 'quality.dx_coverage', layer: 'quality', severity: 'medium', status: 'pass', target: 'all', detail: 'The primary diagnoses appear in the reports.' })
  return out
}

// ── The engine ───────────────────────────────────────────────────────────────
export function runGuardrails(inp: GuardInput): GuardrailReport {
  const findings: GuardFinding[] = [
    ...checkInput(inp),
    ...checkGrounding(inp),
    ...checkPolicy(inp),
    ...checkConsistency(inp),
    ...checkStyle(inp),
    ...checkQuality(inp),
  ]
  const flagged = findings.filter((f) => f.status === 'flag')

  // Weighted score: 1 minus the share of severity weight that flagged.
  const totalW = findings.reduce((a, f) => a + WEIGHT[f.severity], 0)
  const flaggedW = flagged.reduce((a, f) => a + WEIGHT[f.severity], 0)
  const score = totalW ? Math.max(0, 1 - flaggedW / totalW) : 1

  const byLayer = Object.fromEntries(LAYERS.map((l) => [l, { pass: 0, flag: 0 }])) as GuardrailReport['byLayer']
  for (const f of findings) byLayer[f.layer][f.status === 'flag' ? 'flag' : 'pass'] += 1

  const blocked = flagged.some((f) => f.severity === 'blocking')
  const lowConfidence = inp.extraction.confidence < 0.6 || (inp.extraction.icd10.length === 0 && inp.extraction.cpt.length === 0)
  const reviseTargets = [...new Set(flagged.filter((f) => (f.severity === 'high' || f.severity === 'medium') && f.target !== 'all' && f.target !== 'extraction').map((f) => f.target as GStakeholder))]

  const hasReviseFlag = flagged.some((f) => f.severity === 'high' || f.severity === 'medium')
  let decision: GuardDecision
  if (blocked) decision = 'block'
  else if (lowConfidence) decision = 'escalate'
  else if (hasReviseFlag) decision = 'revise'
  else decision = 'ship'

  const summary = blocked
    ? `Blocked: ${flagged.filter((f) => f.severity === 'blocking').length} blocking violation(s). Do not ship these reports as is.`
    : decision === 'escalate'
      ? 'Escalate to a human coder: extraction confidence is below threshold or nothing was confidently coded.'
      : decision === 'revise'
        ? `Revise: ${reviseTargets.join(', ')} report(s) have grounding or policy issues. Safety score ${(score * 100).toFixed(0)} percent.`
        : `Ship: all layers pass. Safety score ${(score * 100).toFixed(0)} percent.`

  return { findings, flagged, score, blocked, decision, reviseTargets, byLayer, summary, mode: 'deterministic' }
}

// Turn guardrail findings into revision instructions the writers can act on,
// keyed by target report. Used by route.ts to feed the existing revision loop.
export function guardrailRevisionIssues(report: GuardrailReport): Map<GStakeholder, string[]> {
  const m = new Map<GStakeholder, string[]>()
  for (const f of report.flagged) {
    if (f.severity === 'low') continue
    const targets: GStakeholder[] = f.target === 'all' || f.target === 'extraction' ? ['patient', 'physician', 'hospital', 'employer'] : [f.target]
    for (const t of targets) m.set(t, [...(m.get(t) ?? []), `[${f.id}] ${f.detail}`])
  }
  return m
}
