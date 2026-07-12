// ── Shared encounter state ──────────────────────────────────────────────────
// One mutable encounter that all four portals read from and write to. Actions in
// any portal mutate this state and emit cross-portal events, and a pure derive()
// recomputes readiness, cost, and reimbursement so every change ripples through
// the others.
//
// Every number here is either (a) a CMS published amount delivered with the
// extraction, (b) standard benefit arithmetic over the visible plan design
// parameters, or (c) a count. The old tuned adjustments (minus 22 points for an
// authorization, a 0.4x assistance factor, $10 per medication, a fabricated
// cohort trend) are gone.

import type { ExtractionResult, ReadinessCheck, Stakeholder } from './synthure'
import priorAuthList from './models/prior_auth.json'
import { fmt$ } from './engine'
import { PAYERS, type Payer } from './pricing'

export type Portal = Stakeholder
export const PORTALS: Portal[] = ['patient', 'physician', 'hospital', 'employer']

// ── Stable fact ids ──────────────────────────────────────────────────────────
// A fact is one truth that surfaces in more than one portal. Every event that
// changes a fact tags it, so a fact can trace its own provenance across portals.
export const dxFactId = (code: string) => `dx:${code}`
export const svcFactId = (code: string) => `svc:${code}`
export const checkFactId = (id: string) => `check:${id}`
export const medFactId = (name: string) => `med:${name}`

export type ClaimStatus = 'review' | 'ready' | 'submitted' | 'reimbursed'

export interface EncDx {
  code: string
  name: string // official ICD 10 CM FY2026 description
  plain: string | null // MedlinePlus Connect consumer text, when available
  plainSource: string | null
  billable: boolean
  source: 'linked' | 'literal'
  entity?: string // the note phrase this code was linked from
  accepted: boolean
}
export interface EncProc {
  code: string
  label: string
  price: number | null // CMS PFS/CLFS national amount; null when not published
  schedule: string | null
  accepted: boolean
  authNeeded: boolean
}
export interface EncMed { name: string; verified: boolean; active: boolean }
export interface EncLab { label: string }

// ── Plan design: visible, editable inputs, not hidden constants ──────────────
// Defaults are the published KFF Employer Health Benefits Survey averages for
// single coverage. The user can change them in the plan panel; the math below
// is ordinary benefit arithmetic over whatever is set here.
export interface PlanDesign {
  payer: Payer // sets the price basis over the Medicare allowed amount
  deductibleRemaining: number
  coinsurance: number // plan's member share after deductible, e.g. 0.2
  oopMaxRemaining: number
}
export const DEFAULT_PLAN: PlanDesign = { payer: 'commercial', deductibleRemaining: 1886, coinsurance: 0.2, oopMaxRemaining: 4500 }
export const PLAN_SOURCE =
  'Defaults: KFF Employer Health Benefits Survey averages for single coverage (editable)'

// ── Patient intake survey ────────────────────────────────────────────────────
// Optional patient-reported context that changes what each portal surfaces and
// prioritizes, deterministically. It never feeds a score or a probability: every
// effect traces to a specific answer and is sourced to "Patient intake survey".
export interface Survey {
  literacy: 'standard' | 'plain' // plain -> patient views prefer plainer wording
  language: string // '' means English default
  transportation: boolean // barrier to in-person visits
  financialHardship: boolean
  comorbidities: string[] // patient-reported conditions that may not be in the note
  submitted: boolean
}
export const DEFAULT_SURVEY: Survey = {
  literacy: 'standard',
  language: '',
  transportation: false,
  financialHardship: false,
  comorbidities: [],
  submitted: false,
}

export type EventKind = 'system' | 'action' | 'message'
export interface EncEvent {
  id: string
  ts: number
  from: Portal | 'system'
  to: Portal[]
  kind: EventKind
  title: string
  body?: string
  factIds?: string[] // facts this event created or changed, for provenance threading
  readBy: Portal[]
}

export interface EncounterState {
  base: ExtractionResult
  diagnoses: EncDx[]
  procedures: EncProc[]
  medications: EncMed[]
  labs: EncLab[]
  symptoms: string[]
  plan: PlanDesign
  priorAuthApproved: boolean
  financialAssistance: boolean
  claimStatus: ClaimStatus
  events: EncEvent[]
  raisedTasks: string[] // task ids explicitly handed off to their owning portal
  survey: Survey
  actionLog: EncAction[] // append-only log of applied actions, for deterministic replay
}

let _seq = 0
const uid = () => `e${Date.now().toString(36)}_${(_seq++).toString(36)}`
// Same published prior authorization lists the pipeline uses, so the portal and
// the reports agree on what needs authorization.
const AUTH_CODES = new Set([
  ...Object.keys(priorAuthList.codes),
  ...Object.keys(priorAuthList.commercial_common),
])
const PORTAL_LABEL: Record<Portal, string> = { patient: 'Patient', physician: 'Clinician', hospital: 'Revenue Cycle', employer: 'Benefits' }
export const portalLabel = (p: Portal | 'system') => (p === 'system' ? 'System' : PORTAL_LABEL[p])

function ev(from: Portal | 'system', to: Portal[], kind: EventKind, title: string, body?: string, factIds?: string[]): EncEvent {
  return { id: uid(), ts: Date.now(), from, to, kind, title, body, factIds, readBy: from === 'system' ? [] : [from as Portal] }
}

export function initEncounter(ex: ExtractionResult): EncounterState {
  const diagnoses: EncDx[] = ex.icd10.map((c) => ({
    code: c.code,
    name: c.label,
    plain: c.plain ?? null,
    plainSource: c.plainSource ?? null,
    billable: c.billable !== false,
    source: c.source ?? 'literal',
    entity: c.entity,
    accepted: true,
  }))
  const procedures: EncProc[] = ex.cpt.map((c) => ({
    code: c.code,
    label: c.label,
    price: c.price ?? null,
    schedule: c.schedule ?? null,
    accepted: true,
    authNeeded: AUTH_CODES.has(c.code),
  }))
  const medications: EncMed[] = ex.entities
    .filter((e) => e.type === 'MEDICATION')
    .map((e) => ({ name: e.text, verified: true, active: true }))
  const labs: EncLab[] = ex.entities.filter((e) => e.type === 'LAB_VALUE').map((e) => ({ label: e.text }))
  const symptoms = ex.entities.filter((e) => e.type === 'SIGN_SYMPTOM').map((e) => e.text)
  return {
    base: ex,
    diagnoses,
    procedures,
    medications,
    labs,
    symptoms,
    plan: { ...DEFAULT_PLAN },
    priorAuthApproved: false,
    financialAssistance: false,
    claimStatus: 'review',
    events: [ev('system', [...PORTALS], 'system', 'Encounter synthesized from the clinical note', 'Four portals opened from one note. Every action here ripples across all of them.')],
    raisedTasks: [],
    survey: { ...DEFAULT_SURVEY, comorbidities: [] },
    actionLog: [],
  }
}

// ── Derived (pure recompute) ─────────────────────────────────────────────────
export interface DerivedService {
  code: string
  label: string
  price: number | null // Medicare (CMS) allowed amount
  payerPrice: number | null // priced for the selected payer (price * payer multiplier)
  patient: number | null
  atRisk: boolean
  atRiskWhy: string | null
}
export interface Derived {
  checks: ReadinessCheck[]
  reviewRisk: number // share of checks flagged, 0-100
  route: 'standard' | 'frontier'
  readmissionRisk: number
  readmissionDriver: string | null
  readmissionCalibrated: boolean
  allowed: number // sum of published amounts for accepted services
  unpriced: number // accepted services without a published amount
  expectedReimb: number // published amounts on services with no flagged check
  atRisk: number // published amounts tied to a flagged check
  patientEst: number | null // benefit math over the visible plan design
  estPay: string
  assumptions: string[]
  services: DerivedService[]
  medsActive: number
  cohorts: { id: string; label: string }[]
  cohortLabel: string
  pipeline: { label: string; state: 'done' | 'active' | 'todo' }[]
  anyAuthNeeded: boolean
  authorizedAll: boolean
  acceptedCodes: number
  totalCodes: number
  plan: PlanDesign
}

const STAGES = ['Coded', 'Quality gate', 'Adjudication', 'Submit', 'Reimbursed']
function pipelineFor(cs: ClaimStatus): Derived['pipeline'] {
  const idx: Record<ClaimStatus, ('done' | 'active' | 'todo')[]> = {
    review: ['done', 'done', 'active', 'todo', 'todo'],
    ready: ['done', 'done', 'done', 'active', 'todo'],
    submitted: ['done', 'done', 'done', 'done', 'active'],
    reimbursed: ['done', 'done', 'done', 'done', 'done'],
  }
  return STAGES.map((label, i) => ({ label, state: idx[cs][i] }))
}

// Recompute the readiness checklist against the CURRENT claim state, mirroring
// the server checks: same rules, same sources, applied to what is accepted now.
function recomputeChecks(s: EncounterState): ReadinessCheck[] {
  const dx = s.diagnoses.filter((d) => d.accepted)
  const procs = s.procedures.filter((p) => p.accepted)
  const nonBillable = dx.filter((d) => !d.billable)
  const authProcs = procs.filter((p) => p.authNeeded)
  const out: ReadinessCheck[] = [
    {
      id: 'billable',
      label: 'Diagnosis codes are billable',
      status: nonBillable.length ? 'flag' : 'pass',
      severity: 'blocking',
      detail: nonBillable.length
        ? `${nonBillable.map((d) => d.code).join(', ')} ${nonBillable.length === 1 ? 'is a category header, not a billable code' : 'are category headers'} in the CMS ICD 10 CM order file.`
        : dx.length
          ? 'Every billed diagnosis code is billable per the CMS ICD 10 CM FY2026 order file.'
          : 'No diagnosis codes to validate.',
      source: 'CMS ICD 10 CM FY2026 order file',
    },
    {
      id: 'linkage',
      label: 'Procedures have a supporting diagnosis',
      status: procs.length > 0 && dx.length === 0 ? 'flag' : 'pass',
      severity: 'blocking',
      detail:
        procs.length > 0 && dx.length === 0
          ? 'Procedures are billed with no diagnosis code to establish medical necessity.'
          : procs.length
            ? 'Each billed service has at least one coded diagnosis on the claim.'
            : 'No billed services to link.',
      source: 'Claim completeness (structural)',
    },
    {
      id: 'prior_auth',
      label: 'Required prior authorization on file',
      status: authProcs.length && !s.priorAuthApproved ? 'flag' : 'pass',
      severity: 'blocking',
      detail: authProcs.length
        ? s.priorAuthApproved
          ? `Authorization approved for ${authProcs.map((p) => p.code).join(', ')}.`
          : `${authProcs.map((p) => `${p.label} (${p.code})`).join('; ')} require prior authorization and none is on file.`
        : 'No billed service appears on the published prior authorization lists.',
      source: 'CMS OPD prior authorization list; published commercial payer lists',
    },
    {
      id: 'coded',
      label: 'Encounter is coded',
      status: dx.length === 0 && procs.length === 0 ? 'flag' : 'pass',
      severity: 'blocking',
      detail:
        dx.length === 0 && procs.length === 0
          ? 'No coded diagnoses or procedures remain on the claim.'
          : `${dx.length} diagnosis and ${procs.length} procedure code${procs.length === 1 ? '' : 's'} on the claim.`,
      source: 'Claim completeness (structural)',
    },
    // Note stated advisory flags carry over unchanged from the pipeline result.
    ...s.base.readiness.checks.filter((c) => c.severity === 'advisory'),
  ]
  return out
}

export function derive(s: EncounterState): Derived {
  const activeProc = s.procedures.filter((p) => p.accepted)
  const billedDx = s.diagnoses.filter((d) => d.accepted)

  const checks = recomputeChecks(s)
  const flagged = checks.filter((c) => c.status === 'flag')
  const route: Derived['route'] = flagged.some((c) => c.severity === 'blocking') ? 'frontier' : 'standard'
  const reviewRisk = Math.round((100 * flagged.length) / checks.length)

  const anyAuthNeeded = activeProc.some((p) => p.authNeeded)
  const authorizedAll = !anyAuthNeeded || s.priorAuthApproved

  // Dollars: published amounts only. A service is "at risk" when a flagged
  // blocking check applies to it; fixing the check moves the dollars, not a
  // hidden multiplier.
  const noDx = billedDx.length === 0
  const mult = PAYERS[s.plan.payer].multiplier
  const services: DerivedService[] = activeProc.map((p) => {
    const authRisk = p.authNeeded && !s.priorAuthApproved
    const atRisk = authRisk || noDx
    return {
      code: p.code,
      label: p.label,
      price: p.price,
      payerPrice: p.price == null ? null : Math.round(p.price * mult),
      patient: null, // filled below once benefit math runs over the total
      atRisk,
      atRiskWhy: authRisk
        ? 'Prior authorization required and not on file'
        : noDx
          ? 'No supporting diagnosis on the claim'
          : null,
    }
  })
  const priced = services.filter((x) => x.payerPrice != null)
  const allowed = priced.reduce((a, x) => a + (x.payerPrice as number), 0)
  const atRisk = priced.filter((x) => x.atRisk).reduce((a, x) => a + (x.payerPrice as number), 0)
  const expectedReimb = allowed - atRisk
  const unpriced = services.length - priced.length

  // Benefit arithmetic over the visible plan design: deductible first, then
  // coinsurance, capped by the remaining out of pocket maximum.
  let patientEst: number | null = null
  const assumptions: string[] = [PLAN_SOURCE]
  if (allowed > 0) {
    const ded = Math.min(s.plan.deductibleRemaining, allowed)
    const coins = (allowed - ded) * s.plan.coinsurance
    patientEst = Math.round(Math.min(ded + coins, s.plan.oopMaxRemaining))
    assumptions.push(
      `Deductible remaining ${fmt$(s.plan.deductibleRemaining)}, coinsurance ${Math.round(s.plan.coinsurance * 100)}%, out of pocket max remaining ${fmt$(s.plan.oopMaxRemaining)}`,
      `Priced as ${PAYERS[s.plan.payer].label}: ${PAYERS[s.plan.payer].source}`,
    )
    if (unpriced) assumptions.push(`${unpriced} service${unpriced === 1 ? ' has' : 's have'} no published CMS amount and ${unpriced === 1 ? 'is' : 'are'} excluded`)
    if (s.financialAssistance)
      assumptions.push('Financial assistance screening requested; the final amount depends on the hospital’s policy')
    // Apportion the estimate across priced services for the line item view.
    for (const x of priced) x.patient = Math.round((patientEst * (x.payerPrice as number)) / allowed)
  }

  const cohorts = s.base.cohorts
  return {
    checks,
    reviewRisk,
    route,
    readmissionRisk: s.base.readmissionRisk,
    readmissionDriver: s.base.readmissionDriver,
    readmissionCalibrated: s.base.readmissionCalibrated,
    allowed,
    unpriced,
    expectedReimb,
    atRisk,
    patientEst,
    estPay: patientEst != null ? `about ${fmt$(patientEst)}` : 'Depends on your plan',
    assumptions,
    services,
    medsActive: s.medications.filter((m) => m.active).length,
    cohorts,
    cohortLabel: cohorts[0]?.label ?? 'Uncategorized',
    pipeline: pipelineFor(s.claimStatus),
    anyAuthNeeded,
    authorizedAll,
    acceptedCodes: billedDx.length + activeProc.length,
    totalCodes: s.diagnoses.length + s.procedures.length,
    plan: s.plan,
  }
}

// ── Reducer ──────────────────────────────────────────────────────────────────
export type EncAction =
  | { type: 'toggleDx'; code: string }
  | { type: 'toggleProc'; code: string }
  | { type: 'toggleMed'; name: string }
  | { type: 'approvePriorAuth' }
  | { type: 'submitClaim' }
  | { type: 'applyFinancialAssistance' }
  | { type: 'setPlan'; plan: PlanDesign }
  | { type: 'setSurvey'; survey: Survey }
  | { type: 'raiseTask'; taskId: string; from: Portal; to: Portal[]; title: string; body?: string; factId?: string }
  | { type: 'sendMessage'; from: Portal; to: Portal[]; body: string }
  | { type: 'markRead'; portal: Portal }

function coreReducer(s: EncounterState, a: EncAction): EncounterState {
  switch (a.type) {
    case 'toggleDx': {
      const dx = s.diagnoses.find((d) => d.code === a.code)
      if (!dx) return s
      const on = !dx.accepted
      return {
        ...s,
        diagnoses: s.diagnoses.map((d) => (d.code === a.code ? { ...d, accepted: on } : d)),
        events: [
          ev('physician', ['hospital', 'employer'], 'action', `Diagnosis ${on ? 'confirmed' : 'removed'}: ${dx.code}`, `${dx.name} ${on ? 'added to' : 'removed from'} the billed diagnosis set. Readiness and claim updated.`, [dxFactId(dx.code)]),
          ...s.events,
        ],
      }
    }
    case 'toggleProc': {
      const pr = s.procedures.find((p) => p.code === a.code)
      if (!pr) return s
      const on = !pr.accepted
      return {
        ...s,
        procedures: s.procedures.map((p) => (p.code === a.code ? { ...p, accepted: on } : p)),
        events: [
          ev('physician', ['patient', 'hospital', 'employer'], 'action', `${on ? 'Procedure added to' : 'Procedure removed from'} the plan: ${pr.code}`, `${pr.label}. Patient cost, expected reimbursement, and claim readiness were recalculated.`, [svcFactId(pr.code)]),
          ...s.events,
        ],
      }
    }
    case 'toggleMed': {
      const md = s.medications.find((m) => m.name === a.name)
      if (!md) return s
      const on = !md.active
      return {
        ...s,
        medications: s.medications.map((m) => (m.name === a.name ? { ...m, active: on } : m)),
        events: [
          ev('physician', ['patient'], 'action', `Medication ${on ? 'resumed' : 'paused'}: ${md.name}`, 'Your medication list was updated.', [medFactId(md.name)]),
          ...s.events,
        ],
      }
    }
    case 'approvePriorAuth': {
      if (s.priorAuthApproved) return s
      return {
        ...s,
        priorAuthApproved: true,
        claimStatus: s.claimStatus === 'review' ? 'ready' : s.claimStatus,
        events: [
          ev('hospital', ['patient', 'physician'], 'action', 'Prior authorization cleared', 'The flagged procedures are authorized. The readiness check now passes, the at risk dollars moved to expected reimbursement, and the patient sees the procedure as covered.', [checkFactId('prior_auth')]),
          ...s.events,
        ],
      }
    }
    case 'submitClaim': {
      if (s.claimStatus === 'submitted' || s.claimStatus === 'reimbursed') return s
      return {
        ...s,
        claimStatus: 'submitted',
        events: [
          ev('hospital', ['patient', 'physician'], 'action', 'Claim submitted to payer', 'The claim moved to the payer. The patient can track billing status, and the chart reflects submission.', ['claim:status']),
          ...s.events,
        ],
      }
    }
    case 'applyFinancialAssistance': {
      if (s.financialAssistance) return s
      return {
        ...s,
        financialAssistance: true,
        events: [
          ev('patient', ['hospital'], 'action', 'Financial assistance requested', 'The patient requested assistance screening. The request was routed to revenue cycle; eligibility depends on the hospital policy and household income.', ['plan:assistance']),
          ...s.events,
        ],
      }
    }
    case 'setPlan': {
      return {
        ...s,
        plan: a.plan,
        events: [
          ev('patient', ['hospital'], 'action', 'Plan design updated', 'The cost estimate was recalculated with the new deductible, coinsurance, and out of pocket values.', ['plan:design']),
          ...s.events,
        ],
      }
    }
    case 'setSurvey': {
      const s2 = a.survey
      const changes: string[] = []
      if (s2.transportation) changes.push('a transportation barrier to in person visits')
      if (s2.financialHardship) changes.push('financial hardship')
      if (s2.comorbidities.length) changes.push(`other conditions (${s2.comorbidities.join(', ')})`)
      if (s2.language) changes.push(`a preference for ${s2.language}`)
      if (s2.literacy === 'plain') changes.push('a preference for plain language')
      return {
        ...s,
        survey: { ...s2, submitted: true },
        events: [
          ev(
            'patient',
            ['physician', 'hospital'],
            'action',
            'Patient intake survey submitted',
            changes.length
              ? `The patient reported ${changes.join('; ')}. The care team views reprioritized deterministically from these answers. No score or risk number changed.`
              : 'Intake survey submitted with no additional barriers reported.',
            ['survey'],
          ),
          ...s.events,
        ],
      }
    }
    case 'raiseTask': {
      const already = s.raisedTasks.includes(a.taskId)
      return {
        ...s,
        raisedTasks: already ? s.raisedTasks : [...s.raisedTasks, a.taskId],
        events: already
          ? s.events
          : [ev(a.from, a.to, 'action', a.title, a.body, a.factId ? [a.factId] : undefined), ...s.events],
      }
    }
    case 'sendMessage': {
      if (!a.body.trim()) return s
      return {
        ...s,
        events: [ev(a.from, a.to, 'message', `${portalLabel(a.from)} to ${a.to.map(portalLabel).join(', ')}`, a.body.trim()), ...s.events],
      }
    }
    case 'markRead': {
      return {
        ...s,
        events: s.events.map((e) =>
          e.to.includes(a.portal) && !e.readBy.includes(a.portal) ? { ...e, readBy: [...e.readBy, a.portal] } : e,
        ),
      }
    }
    default:
      return s
  }
}

// Public reducer: the core reducer plus an append-only action log so an encounter
// can be replayed deterministically. markRead is UI-only read tracking and no-op
// transitions are not logged.
export function reducer(s: EncounterState, a: EncAction): EncounterState {
  const next = coreReducer(s, a)
  if (next === s || a.type === 'markRead') return next
  return { ...next, actionLog: [...next.actionLog, a] }
}

// ── Event sourcing: replay an encounter from its base + action log ────────────
// This is the seam for a server-authoritative encounter. The client holds an
// action log; a server can receive { base, actions } and replay it to the exact
// same clinical and financial state. Event ids and timestamps are regenerated on
// replay (they are cosmetic); everything the portals read from derive() is
// reconstructed identically.
export interface EncounterSnapshot {
  base: ExtractionResult
  actions: EncAction[]
}

export function replay(base: ExtractionResult, actions: EncAction[]): EncounterState {
  return actions.reduce(reducer, initEncounter(base))
}

export function serializeEncounter(s: EncounterState): EncounterSnapshot {
  return { base: s.base, actions: s.actionLog }
}

export function deserializeEncounter(snap: EncounterSnapshot): EncounterState {
  return replay(snap.base, snap.actions)
}

// ── Selectors ────────────────────────────────────────────────────────────────
export const inboxFor = (s: EncounterState, p: Portal) => s.events.filter((e) => e.to.includes(p))
// Provenance: the events (newest first) that created or changed a given fact.
export const provenanceFor = (s: EncounterState, factId: string) =>
  s.events.filter((e) => e.factIds?.includes(factId))
export const unreadFor = (s: EncounterState, p: Portal) =>
  s.events.filter((e) => e.to.includes(p) && !e.readBy.includes(p) && e.from !== p).length
