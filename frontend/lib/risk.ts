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

// ── Claim readiness: a sourced checklist, not a probability ──────────────────
// Every check reads a published rule or a fact stated in the note. There are no
// tuned weights: the summary number is simply the share of checks flagged, and
// the review lane goes to frontier when any blocking check fails.

import type { ReadinessCheck } from './synthure'

export interface ClaimReadiness {
  checks: ReadinessCheck[]
  lane: 'standard' | 'frontier'
  reviewRisk: number // share of checks flagged, 0-100 (count based, documented)
  priorAuth: PriorAuthItem[]
  factors: { label: string; detail: string }[] // the flagged checks, for report context
}

const PRIOR_DENIAL_RE = /\b(prior denial|previously denied|denied before|appeal)\b/i
const OON_RE = /\b(out of network|out-of-network|\boon\b|non[- ]participating)\b/i

export function assessReadiness(
  note: string,
  icd10: { code: string; billable?: boolean }[],
  cpt: { code: string; label?: string }[],
  priorAuthApproved = false,
): ClaimReadiness {
  const priorAuth = priorAuthFor(cpt)
  const checks: ReadinessCheck[] = []

  const nonBillable = icd10.filter((c) => c.billable === false)
  checks.push({
    id: 'billable',
    label: 'Diagnosis codes are billable',
    status: nonBillable.length ? 'flag' : 'pass',
    severity: 'blocking',
    detail: nonBillable.length
      ? `${nonBillable.map((c) => c.code).join(', ')} ${nonBillable.length === 1 ? 'is a category header, not a billable code' : 'are category headers, not billable codes'} in the CMS ICD 10 CM order file. Code to the highest specificity.`
      : icd10.length
        ? 'Every diagnosis code is billable per the CMS ICD 10 CM FY2026 order file.'
        : 'No diagnosis codes to validate.',
    source: 'CMS ICD 10 CM FY2026 order file',
  })

  checks.push({
    id: 'linkage',
    label: 'Procedures have a supporting diagnosis',
    status: cpt.length > 0 && icd10.length === 0 ? 'flag' : 'pass',
    severity: 'blocking',
    detail:
      cpt.length > 0 && icd10.length === 0
        ? 'Procedures are billed with no diagnosis code to establish medical necessity.'
        : cpt.length
          ? 'Each billed service has at least one coded diagnosis on the claim.'
          : 'No billed services to link.',
    source: 'Claim completeness (structural)',
  })

  checks.push({
    id: 'prior_auth',
    label: 'Required prior authorization on file',
    status: priorAuth.length && !priorAuthApproved ? 'flag' : 'pass',
    severity: 'blocking',
    detail: priorAuth.length
      ? priorAuthApproved
        ? `Authorization approved for ${priorAuth.map((p) => `${p.procedure} (${p.code})`).join('; ')}.`
        : `${priorAuth.map((p) => `${p.procedure} (${p.code}, ${p.source})`).join('; ')} require prior authorization and none is on file.`
      : 'No billed service appears on the published prior authorization lists.',
    source: 'CMS OPD prior authorization list; published commercial payer lists',
  })

  checks.push({
    id: 'coded',
    label: 'Encounter is coded',
    status: icd10.length === 0 && cpt.length === 0 ? 'flag' : 'pass',
    severity: 'blocking',
    detail:
      icd10.length === 0 && cpt.length === 0
        ? 'No coded diagnoses or procedures were resolved from the note; route to a human coder.'
        : `${icd10.length} diagnosis and ${cpt.length} procedure code${cpt.length === 1 ? '' : 's'} on the claim.`,
    source: 'Claim completeness (structural)',
  })

  checks.push({
    id: 'oon',
    label: 'Network status',
    status: OON_RE.test(note) ? 'flag' : 'pass',
    severity: 'advisory',
    detail: OON_RE.test(note)
      ? 'The note states out of network care, which payers route to manual review.'
      : 'The note does not state out of network care.',
    source: 'Stated in the note',
  })

  checks.push({
    id: 'prior_denial',
    label: 'Prior denial or appeal history',
    status: PRIOR_DENIAL_RE.test(note) ? 'flag' : 'pass',
    severity: 'advisory',
    detail: PRIOR_DENIAL_RE.test(note)
      ? 'The note references a prior denial or appeal for this care.'
      : 'The note does not reference a prior denial or appeal.',
    source: 'Stated in the note',
  })

  const flagged = checks.filter((c) => c.status === 'flag')
  const lane = flagged.some((c) => c.severity === 'blocking') ? 'frontier' : 'standard'
  return {
    checks,
    lane,
    reviewRisk: Math.round((100 * flagged.length) / checks.length),
    priorAuth,
    factors: flagged.map((c) => ({ label: c.label, detail: c.detail })),
  }
}
