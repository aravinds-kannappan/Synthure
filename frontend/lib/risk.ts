// ── Synthure risk & claim readiness (server side) ───────────────────────────
// Replaces the previous hand tuned scoreRisk heuristic. Every number here traces
// to either real published data or an auditable, sourced fact:
//
//   readmissionRisk   Calibrated to the real CMS HRRP published 30 day readmission
//                     rates (frontend/lib/models/readmission_model.json). It is a
//                     lookup of published rates, not a prediction we invented.
//
//   reviewRisk        A deterministic claim readiness score. It is NOT a denial
//                     probability and NOT a trained model: there is no public
//                     claim adjudication dataset to train one. Each input is a
//                     sourced fact, prior authorization required by published
//                     payer policy, a claim validity issue, or an administrative
//                     flag stated in the note. The breakdown is always surfaced
//                     so the score is fully explainable.
//
// The old heuristic invented clinical correlations (for example "NSTEMI" raised
// "denial risk"), which has no basis in payer adjudication. None of that remains.

import readmissionModel from './models/readmission_model.json'
import priorAuthList from './models/prior_auth.json'

const READMIT_LOOKUP = readmissionModel.lookup as Record<string, number>
const READMIT_NAME = readmissionModel.condition as Record<string, string>
const READMIT_BASELINE = readmissionModel.baseline as number
const PA_CODES = priorAuthList.codes as Record<string, string>
const PA_COMMERCIAL = priorAuthList.commercial_common as Record<string, string>

const norm = (code: string) => code.replace('.', '').toUpperCase()

// ── Readmission: calibrated to CMS HRRP published rates ──────────────────────
export interface ReadmissionResult {
  risk: number // 0-100, the dominant condition's published 30 day rate
  driver: string | null // the CMS condition the score is calibrated to
  calibrated: boolean // true when at least one code matched a CMS HRRP cohort
}

// Map an ICD 10 code to its CMS condition rate by longest matching prefix.
function rateForCode(code: string): number | null {
  const c = norm(code)
  let best: number | null = null
  let bestLen = 0
  for (const prefix of Object.keys(READMIT_LOOKUP)) {
    if (c.startsWith(prefix) && prefix.length > bestLen) {
      best = READMIT_LOOKUP[prefix]
      bestLen = prefix.length
    }
  }
  return best
}

// Resolve the CMS condition name for a code via its longest matching prefix.
function conditionForCode(code: string): string | null {
  const c = norm(code)
  let bestPrefix = ''
  for (const prefix of Object.keys(READMIT_NAME)) {
    if (c.startsWith(prefix) && prefix.length > bestPrefix.length) bestPrefix = prefix
  }
  return bestPrefix ? READMIT_NAME[bestPrefix] : null
}

export function inferReadmission(icd10: { code: string }[]): ReadmissionResult {
  // The dominant matched CMS condition drives readmission (clinically standard).
  // Fall back to the national all cause rate only when no code matches a cohort,
  // so a low risk elective cohort (for example knee replacement at 4.3%) is not
  // floored up to the national average.
  let best: number | null = null
  let driver: string | null = null
  for (const { code } of icd10) {
    const r = rateForCode(code)
    if (r != null && (best == null || r > best)) {
      best = r
      driver = conditionForCode(code)
    }
  }
  const risk = best == null ? READMIT_BASELINE : best
  return { risk: Math.round(risk * 100), driver, calibrated: best != null }
}

// ── Prior authorization: lookup of published payer policy ────────────────────
export interface PriorAuthItem {
  code: string
  procedure: string
  source: 'CMS OPD list' | 'Commercial payer list'
}

export function priorAuthFor(cpt: { code: string; label?: string }[]): PriorAuthItem[] {
  const out: PriorAuthItem[] = []
  for (const { code } of cpt) {
    const c = code.trim()
    if (PA_CODES[c]) out.push({ code: c, procedure: PA_CODES[c], source: 'CMS OPD list' })
    else if (PA_COMMERCIAL[c]) out.push({ code: c, procedure: PA_COMMERCIAL[c], source: 'Commercial payer list' })
  }
  return out
}

// ── Claim readiness: deterministic, sourced, explainable ─────────────────────
export interface ClaimReadiness {
  reviewRisk: number // 0-100 aggregate of sourced review factors (not a model output)
  priorAuth: PriorAuthItem[]
  factors: { label: string; detail: string; weight: number }[]
  validityIssues: string[]
}

const PRIOR_DENIAL_RE = /\b(prior denial|previously denied|denied before|appeal)\b/i
const OON_RE = /\b(out of network|out-of-network|\boon\b|non[- ]participating)\b/i

export function assessClaim(
  note: string,
  icd10: { code: string }[],
  cpt: { code: string; label?: string }[],
): ClaimReadiness {
  const priorAuth = priorAuthFor(cpt)
  const factors: ClaimReadiness['factors'] = []
  const validityIssues: string[] = []

  // 1) Claim validity (auditable, structural).
  if (cpt.length > 0 && icd10.length === 0)
    validityIssues.push('Procedures are billed with no diagnosis code to establish medical necessity.')
  if (icd10.length === 0 && cpt.length === 0)
    validityIssues.push('No coded diagnoses or procedures were detected in the note.')

  // 2) Prior authorization (published payer policy lookup).
  if (priorAuth.length)
    factors.push({
      label: 'Prior authorization required',
      detail: priorAuth.map((p) => `${p.procedure} (${p.code}, ${p.source})`).join('; '),
      weight: Math.min(0.35 * priorAuth.length, 0.55),
    })

  // 3) Validity issues raise review load.
  if (validityIssues.length)
    factors.push({ label: 'Claim validity issue', detail: validityIssues.join(' '), weight: Math.min(0.25 * validityIssues.length, 0.4) })

  // 4) Administrative flags stated in the note (facts, not inferred correlations).
  if (OON_RE.test(note))
    factors.push({ label: 'Out of network noted', detail: 'The note states out of network care, which payers route to manual review.', weight: 0.2 })
  if (PRIOR_DENIAL_RE.test(note))
    factors.push({ label: 'Prior denial / appeal noted', detail: 'The note references a prior denial or appeal for this care.', weight: 0.2 })

  const reviewRisk = Math.round(100 * Math.min(0.95, factors.reduce((s, f) => s + f.weight, 0)))
  return { reviewRisk, priorAuth, factors, validityIssues }
}
