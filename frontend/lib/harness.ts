// ── Agent harness ────────────────────────────────────────────────────────────
// Following the harness-engineering idea that "the harness is everything around
// the model": the model is a commodity, the scaffolding is where safety lives.
// This module is the verification-and-control layer that wraps the pipeline. It
// runs the seven safety mechanisms and folds them into one decision:
//
//   1. Retrieval-only constraint   evidence and codes must come from the note
//   2. Confidence abstention       say "needs clinician review" when unsure
//   3. Policy engine               block outputs that violate clinical/coding rules
//   4. Adversarial input detection prompt injection and malformed notes
//   5. Model agreement checks      compare the coders and flag disagreement
//   6. Immutable audit log         (lib/audit.ts) hash-chained record per run
//   7. Human in the loop           route high-risk recommendations to a person
//
// The policy engine (3), retrieval grounding (1), and injection detection (4)
// are the guardrail engine (lib/guardrails.ts). This module adds input
// validation, model agreement, confidence abstention, risk tiering, and the
// human-in-the-loop routing, and assembles the final HarnessReport. It is pure
// and unit-testable headlessly (see harness.harness.ts).

import { detectInjection, type GuardrailReport } from './guardrails'

// ── 4. Adversarial + malformed input detection (a precondition gate) ─────────
export interface InputFinding { id: string; severity: 'block' | 'warn'; detail: string; evidence?: string[] }
export interface InputReport { ok: boolean; reject: boolean; findings: InputFinding[] }

const MAX_NOTE = 30000
const MIN_NOTE = 20
const CLINICAL_CUE = /\b(patient|pt|dx|diagnos|hx|history|mg|dose|bp|hr|labs?|admit|discharge|complain|symptom|prescrib|exam|assessment|plan|chief)\b/i

export function validateInput(note: string): InputReport {
  const findings: InputFinding[] = []
  const t = note.trim()
  if (t.length === 0) findings.push({ id: 'input.empty', severity: 'block', detail: 'The note is empty. There is no evidence to retrieve from.' })
  else if (t.length < MIN_NOTE) findings.push({ id: 'input.too_short', severity: 'block', detail: `The note is only ${t.length} characters, too short to extract or ground anything from.` })
  if (note.length > MAX_NOTE) findings.push({ id: 'input.oversized', severity: 'warn', detail: `The note exceeds ${MAX_NOTE} characters and is truncated before processing.` })

  const inj = detectInjection(note)
  if (inj.length) findings.push({ id: 'input.injection', severity: 'warn', detail: 'The note contains text that looks like an instruction injection aimed at the model. It is treated as data, never as a directive.', evidence: inj })

  // Malformed: mostly non alphanumeric, or a single character repeated, or no
  // clinical cue at all in a long body.
  const alnum = (t.match(/[a-z0-9]/gi) ?? []).length
  if (t.length >= MIN_NOTE && alnum / t.length < 0.5) findings.push({ id: 'input.malformed', severity: 'warn', detail: 'The note is mostly non alphanumeric characters, which is unusual for a clinical note.' })
  if (/(.)\1{20,}/.test(t)) findings.push({ id: 'input.malformed', severity: 'warn', detail: 'The note contains a long run of a repeated character.' })
  if (t.length >= 120 && !CLINICAL_CUE.test(t)) findings.push({ id: 'input.non_clinical', severity: 'warn', detail: 'The note contains no recognizable clinical cues, so it may not be a clinical note.' })

  const reject = findings.some((f) => f.severity === 'block')
  return { ok: findings.length === 0, reject, findings }
}

// ── 5. Model agreement checks ────────────────────────────────────────────────
// Synthure codes each diagnosis two ways: an in-process lexical linker over the
// official index, and (when the trained coder service is reachable) a bi-encoder
// plus cross-encoder. Where both are available we compare them and flag any code
// only one produced. Agreement is a real cross-model signal, not a rephrased
// single output.
export interface AgreementReport {
  available: boolean
  score: number // 0..1 fraction of codes both coders agree on (1 when not comparable)
  findings: { id: string; detail: string; codes: string[] }[]
  detail: string
}

interface ExCode { code: string; source?: string; trained?: boolean }

export function checkAgreement(ex: { icd10: ExCode[] }): AgreementReport {
  const codes = ex.icd10 ?? []
  const trained = codes.filter((c) => c.trained === true)
  const lexical = codes.filter((c) => c.source === 'linked')
  if (trained.length === 0) {
    return { available: false, score: 1, findings: [], detail: 'The trained coder was not reachable, so only the lexical linker ran. Cross-coder agreement is unavailable for this run.' }
  }
  const tset = new Set(trained.map((c) => c.code.toUpperCase()))
  const lset = new Set(lexical.map((c) => c.code.toUpperCase()))
  const union = new Set([...tset, ...lset])
  const both = [...union].filter((c) => tset.has(c) && lset.has(c))
  const onlyTrained = [...tset].filter((c) => !lset.has(c))
  const onlyLexical = [...lset].filter((c) => !tset.has(c))
  const score = union.size ? both.length / union.size : 1
  const findings: AgreementReport['findings'] = []
  if (onlyTrained.length) findings.push({ id: 'agreement.trained_only', detail: 'These codes were produced only by the trained coder, not the lexical linker.', codes: onlyTrained })
  if (onlyLexical.length) findings.push({ id: 'agreement.lexical_only', detail: 'These codes were produced only by the lexical linker, not confirmed by the trained coder.', codes: onlyLexical })
  return { available: true, score, findings, detail: `The two coders agree on ${both.length} of ${union.size} codes (${Math.round(score * 100)} percent).` }
}

// ── High-risk conditions that warrant human sign-off ─────────────────────────
const HIGH_RISK_ICD = /^(I2[0-2]|I50|I26|I63|I61|A41|R65|J96|K92\.2|N17)/i // MI, heart failure, PE, stroke, sepsis, resp failure, GI bleed, AKI
function highRiskConditions(ex: { icd10: { code: string }[] }): string[] {
  return (ex.icd10 ?? []).filter((c) => HIGH_RISK_ICD.test(c.code.replace(/\s/g, ''))).map((c) => c.code)
}

// ── The harness decision ─────────────────────────────────────────────────────
export type HarnessAction = 'auto' | 'human_review' | 'block' | 'abstain'
export type RiskTier = 'low' | 'elevated' | 'high'

export interface HarnessReport {
  action: HarnessAction
  riskTier: RiskTier
  abstain: { should: boolean; reason: string | null }
  retrievalOnly: { enforced: boolean; detail: string }
  agreement: AgreementReport
  hitl: { required: boolean; reason: string | null }
  input: InputReport
  highRisk: string[]
  reasons: string[]
  summary: string
}

const CONF_FLOOR = 0.6
const AGREE_FLOOR = 0.5

export function assembleHarness(args: {
  extraction: { icd10: ExCode[]; cpt: { code: string }[]; confidence: number }
  guardrails: GuardrailReport
  input: InputReport
}): HarnessReport {
  const { extraction: ex, guardrails, input } = args
  const reasons: string[] = []

  const agreement = checkAgreement(ex)
  const highRisk = highRiskConditions(ex)
  const noCodes = ex.icd10.length === 0 && ex.cpt.length === 0

  // 1. Retrieval-only: enforced when the grounding layer found no fabricated
  // codes or numbers (every cited fact traced to the note or the extraction).
  const groundingClean = !guardrails.flagged.some((f) => f.layer === 'grounding')
  const retrievalOnly = {
    enforced: groundingClean,
    detail: groundingClean
      ? 'Every code and figure in the reports traces to the note or the validated extraction. Nothing was cited that is not present as evidence.'
      : 'The grounding layer flagged a code or figure not present in the note or extraction; it was routed for revision.',
  }
  if (!groundingClean) reasons.push('grounding flagged non retrievable evidence')

  // 2. Confidence abstention.
  const lowConf = ex.confidence < CONF_FLOOR || noCodes
  const lowAgree = agreement.available && agreement.score < AGREE_FLOOR
  const abstainShould = lowConf || lowAgree || guardrails.decision === 'escalate'
  const abstainReason = abstainShould
    ? noCodes
      ? 'Needs clinician review: nothing was confidently coded from this note.'
      : lowConf
        ? `Needs clinician review: extraction confidence ${ex.confidence} is below the ${CONF_FLOOR} threshold.`
        : lowAgree
          ? `Needs clinician review: the two coders disagree (agreement ${Math.round(agreement.score * 100)} percent).`
          : 'Needs clinician review: the pipeline escalated on a readiness or confidence signal.'
    : null
  if (abstainShould) reasons.push('confidence or agreement below threshold')

  // 3. Policy engine (the guardrail engine): a blocking finding stops the output.
  const policyBlocked = guardrails.blocked
  if (policyBlocked) reasons.push(`policy engine blocked ${guardrails.flagged.filter((f) => f.severity === 'blocking').length} violation(s)`)

  // 7. Risk tier and human in the loop.
  let riskTier: RiskTier = 'low'
  if (policyBlocked || highRisk.length) riskTier = 'high'
  else if (guardrails.decision === 'revise' || lowConf || (agreement.available && agreement.findings.length > 0)) riskTier = 'elevated'
  if (highRisk.length) reasons.push(`high-risk condition present: ${highRisk.join(', ')}`)

  const hitlRequired = riskTier === 'high' || abstainShould
  const hitlReason = policyBlocked
    ? 'A policy violation must be cleared by a human before anything ships.'
    : highRisk.length
      ? 'A high-risk condition is on the claim; a clinician must sign off on the recommendations.'
      : abstainShould
        ? 'Low confidence or coder disagreement requires a human coder.'
        : null

  // Final action.
  let action: HarnessAction
  if (policyBlocked) action = 'block'
  else if (abstainShould) action = 'abstain'
  else if (hitlRequired) action = 'human_review'
  else action = 'auto'

  const summary =
    action === 'block'
      ? 'Blocked by the policy engine. Do not ship.'
      : action === 'abstain'
        ? abstainReason ?? 'Abstaining; needs clinician review.'
        : action === 'human_review'
          ? 'Cleared the automated checks but routed to a human because a high-risk condition is present.'
          : 'Cleared every harness layer for automated handling.'

  return {
    action,
    riskTier,
    abstain: { should: abstainShould, reason: abstainReason },
    retrievalOnly,
    agreement,
    hitl: { required: hitlRequired, reason: hitlReason },
    input,
    highRisk,
    reasons,
    summary,
  }
}
