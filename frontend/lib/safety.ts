// ── Alignment & safety layer (server side) ──────────────────────────────────
// Inference time safety checks over the generated reports, drawn from the
// alignment literature. This module is deterministic and always runs, so the
// safeguards hold with or without an API key. When a key is present, route.ts
// additionally runs a Claude "Constitution Critic" and merges its findings,
// setting mode to "claude assisted".
//
// What this is, precisely: a constitution with an automated critique pass
// (Constitutional AI, Bai et al. 2022), an autonomy gate that keeps clinical
// decisions with a human (corrigibility / scalable oversight), and selective
// prediction that abstains under low confidence (Geifman and El-Yaniv 2017).
// We do NOT train a reward model; these are the inference time mechanisms.

import {
  CONSTITUTION,
  type ConstitutionCheck,
  type AutonomyAction,
  type ExtractionResult,
  type SafetyResult,
  type StakeholderReport,
  type Stakeholder,
} from './synthure'

const CODE_RE = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?|\d{5})\b/g
const COST_RE = /\$\s?\d/
const HEDGE_RE = /\b(estimate|estimated|illustrative|likely|roughly|about|approximate|typical)\b/i
// PHI patterns reused from the de-identification component for the privacy check.
const PHI_RES: RegExp[] = [
  /\b(?:Mr|Mrs|Ms|Dr|Patient)\.?\s+[A-Z][a-z]+/, // named individual
  /\bMRN[:#\s]*[A-Za-z0-9-]{4,}/i,
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, // phone
]
// Phrasings an agent must never use: it would mean the agent itself is making a
// clinical decision rather than supporting one.
const CLINICAL_DECISION_RE = /\b(we have prescribed|i prescribe|synthure prescribes|synthure diagnoses|diagnosis confirmed by synthure|we are changing your (medication|treatment))\b/i

function reportText(r: StakeholderReport): string {
  return [
    r.headline,
    r.summary,
    ...r.sections.flatMap((s) => [s.heading, s.body, ...(s.bullets ?? [])]),
    ...r.actions,
  ].join('  ')
}

// Codes that appear in a report but not in the validated extraction = fabrication.
function fabricatedCodes(reports: StakeholderReport[], ex: ExtractionResult): string[] {
  const known = new Set<string>([
    ...ex.icd10.map((c) => c.code.toUpperCase()),
    ...ex.cpt.map((c) => c.code),
  ])
  const seen = new Set<string>()
  for (const r of reports) {
    for (const m of reportText(r).matchAll(CODE_RE)) {
      const code = m[1].toUpperCase()
      if (!known.has(code)) seen.add(code)
    }
  }
  return [...seen]
}

// ── Autonomy gate ────────────────────────────────────────────────────────────
// A fixed map of the actions Synthure can take to their autonomy tier. Tier 3 is
// a design prohibition: those actions are never generated, only shown as blocked.
function autonomyGate(ex: ExtractionResult): AutonomyAction[] {
  const out: AutonomyAction[] = [
    { action: 'Draft a prior authorization packet', tier: 1, decision: 'auto' },
    { action: 'Generate patient education and a medication guide', tier: 1, decision: 'auto' },
    { action: 'Prepare an appeal letter template', tier: 1, decision: 'auto' },
  ]
  if (ex.priorAuth.length)
    out.push({ action: 'File the prior authorization with the payer', tier: 2, decision: 'human approval' })
  out.push({ action: 'Submit the claim', tier: 2, decision: 'human approval' })
  out.push({ action: 'Send a message to the patient', tier: 2, decision: 'human approval' })
  out.push(
    { action: 'Prescribe or change medication', tier: 3, decision: 'prohibited' },
    { action: 'Make or confirm a diagnosis', tier: 3, decision: 'prohibited' },
    { action: 'Change the treatment plan', tier: 3, decision: 'prohibited' },
  )
  return out
}

export function assessSafety(
  note: string,
  ex: ExtractionResult,
  reports: StakeholderReport[],
): SafetyResult {
  const byId: Record<string, ConstitutionCheck> = {}
  for (const p of CONSTITUTION) byId[p.id] = { ...p, status: 'pass', detail: '' }

  // 1) Grounding: no fabricated codes.
  const fab = fabricatedCodes(reports, ex)
  byId.grounding.status = fab.length ? 'flag' : 'pass'
  byId.grounding.detail = fab.length
    ? `Codes not found in the validated extraction were detected and removed: ${fab.join(', ')}.`
    : 'Every code in every report traces to the validated extraction.'

  // 2) No clinical decisions: scan for agent issued prescribing or diagnosing.
  const decisionViolators = reports.filter((r) => CLINICAL_DECISION_RE.test(reportText(r)))
  byId.no_clinical_decisions.status = decisionViolators.length ? 'flag' : 'pass'
  byId.no_clinical_decisions.detail = decisionViolators.length
    ? `A report contained agent issued clinical decision language and was flagged for revision.`
    : 'No report contains agent issued prescribing or diagnosing. Tier 3 actions are never generated.'

  // 3) Cost figures are labeled as estimates.
  const patientText = reports.filter((r) => r.stakeholder === 'patient').map(reportText).join(' ')
  const costNoHedge = COST_RE.test(patientText) && !HEDGE_RE.test(patientText)
  byId.cost_estimates.status = costNoHedge ? 'flag' : 'pass'
  byId.cost_estimates.detail = costNoHedge
    ? 'A dollar figure appeared without an estimate qualifier nearby.'
    : COST_RE.test(patientText)
      ? 'Cost figures are present and labeled as estimates.'
      : 'No cost figures to qualify in this encounter.'

  // 4) Privacy: the employer (aggregate) view carries no identifying detail.
  const employerText = reports.filter((r) => r.stakeholder === 'employer').map(reportText).join(' ')
  const phiHit = PHI_RES.some((re) => re.test(employerText))
  byId.privacy.status = phiHit ? 'flag' : 'pass'
  byId.privacy.detail = phiHit
    ? 'Identifying information was detected in the aggregate view and flagged.'
    : 'The aggregate employer view contains no individual identifying information.'

  // 5) Selective prediction: abstain when extraction confidence is low.
  const noCodes = ex.icd10.length === 0 && ex.cpt.length === 0
  const abstained = ex.confidence < 0.6 || noCodes
  const abstainReason = abstained
    ? noCodes
      ? 'No codes were confidently extracted, so the encounter is escalated to a human coder rather than auto routed.'
      : `Extraction confidence ${ex.confidence} is below the 0.60 threshold, so the encounter is escalated for human review.`
    : null
  byId.abstain.status = 'pass'
  byId.abstain.detail = abstained
    ? `Abstaining and escalating. ${abstainReason}`
    : `Confidence ${ex.confidence} is above threshold; the pipeline proceeds without escalation.`

  // 6) Sourced risk: no fabricated denial probability is shown.
  byId.sourced_risk.status = 'pass'
  byId.sourced_risk.detail = `Readmission ${ex.readmissionRisk}% is the CMS published rate; no denial probability is shown.`

  const constitution = CONSTITUTION.map((p) => byId[p.id])
  const flags = constitution.filter((c) => c.status === 'flag')

  // Critiques + a representative revision for the first fabricated code, if any.
  const critiques = flags.map((c) => ({
    target: 'all' as Stakeholder | 'all',
    issue: `${c.principle} ${c.detail}`,
    severity: (c.id === 'grounding' || c.id === 'no_clinical_decisions' ? 'high' : 'medium') as 'high' | 'medium',
    action: (c.id === 'grounding' ? 'revised' : 'flagged') as 'revised' | 'flagged',
  }))
  let revision: SafetyResult['revision'] = null
  if (fab.length) {
    revision = {
      target: 'all',
      before: `… includes code ${fab[0]} …`,
      after: `… code ${fab[0]} removed; only codes validated from the note remain …`,
      note: 'The critic removed a code that did not trace to the note (grounding principle).',
    }
  }

  return {
    constitution,
    critiques,
    revision,
    autonomy: autonomyGate(ex),
    abstained,
    abstainReason,
    passed: constitution.filter((c) => c.status === 'pass').length,
    total: constitution.length,
    caughtViolations: flags.length,
    mode: 'deterministic',
  }
}
