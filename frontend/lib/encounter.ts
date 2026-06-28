// ── Shared encounter state ──────────────────────────────────────────────────
// One mutable encounter that all four portals read from and write to. Actions in
// any portal mutate this state and emit cross-portal events, and a pure derive()
// recomputes risk, cost, reimbursement, and cohort so every change ripples
// through the others. This is what makes the four portals one interconnected
// operational layer rather than four independent views.

import type { ExtractionResult, Stakeholder } from './synthure'
import priorAuthList from './models/prior_auth.json'
import { PLAIN_DX, MED_INFO, CPT_PRICE, LAB_MEANING, icdKey, fmt$ } from './knowledge'

export type Portal = Stakeholder
export const PORTALS: Portal[] = ['patient', 'physician', 'hospital', 'employer']

export type ClaimStatus = 'review' | 'ready' | 'submitted' | 'reimbursed'

export interface EncDx { code: string; name: string; plain: string; known: boolean; accepted: boolean }
export interface EncProc { code: string; label: string; price: number; known: boolean; accepted: boolean; authNeeded: boolean }
export interface EncMed { name: string; use: string; how: string; active: boolean }
export interface EncLab { label: string; meaning: string }

export type EventKind = 'system' | 'action' | 'message'
export interface EncEvent {
  id: string
  ts: number
  from: Portal | 'system'
  to: Portal[]
  kind: EventKind
  title: string
  body?: string
  readBy: Portal[]
}

export interface EncounterState {
  base: ExtractionResult
  diagnoses: EncDx[]
  procedures: EncProc[]
  medications: EncMed[]
  labs: EncLab[]
  symptoms: string[]
  priorAuthApproved: boolean
  financialAssistance: boolean
  claimStatus: ClaimStatus
  events: EncEvent[]
}

let _seq = 0
const uid = () => `e${Date.now().toString(36)}_${(_seq++).toString(36)}`
// Sourced from the same published prior authorization lists the engine uses,
// so the interactive portal and the report agree on what needs authorization.
const AUTH_CODES = new Set([
  ...Object.keys(priorAuthList.codes),
  ...Object.keys(priorAuthList.commercial_common),
])
const PORTAL_LABEL: Record<Portal, string> = { patient: 'Patient', physician: 'Clinician', hospital: 'Revenue Cycle', employer: 'Benefits' }
export const portalLabel = (p: Portal | 'system') => (p === 'system' ? 'System' : PORTAL_LABEL[p])

function ev(from: Portal | 'system', to: Portal[], kind: EventKind, title: string, body?: string): EncEvent {
  return { id: uid(), ts: Date.now(), from, to, kind, title, body, readBy: from === 'system' ? [] : [from as Portal] }
}

export function initEncounter(ex: ExtractionResult): EncounterState {
  const diagnoses: EncDx[] = ex.icd10.map((c) => ({
    code: c.code,
    name: c.label !== 'ICD 10 diagnosis code' ? c.label : 'A condition noted by your clinician',
    plain: PLAIN_DX[icdKey(c.code)] || 'something your care team is watching closely and will explain at your visit.',
    known: c.label !== 'ICD 10 diagnosis code',
    accepted: true,
  }))
  const procedures: EncProc[] = ex.cpt.map((c) => ({
    code: c.code,
    label: c.label,
    price: CPT_PRICE[c.code] ?? 150,
    known: c.label !== 'CPT procedure code',
    accepted: true,
    authNeeded: AUTH_CODES.has(c.code),
  }))
  const medications: EncMed[] = ex.entities
    .filter((e) => e.type === 'MEDICATION')
    .map((e) => {
      const info = MED_INFO[e.text]
      return {
        name: e.text,
        use: info?.use ?? 'helps manage your condition',
        how: info?.how ?? 'taken exactly as prescribed; ask your pharmacist about side effects.',
        active: true,
      }
    })
  const labs: EncLab[] = ex.entities
    .filter((e) => e.type === 'LAB_VALUE')
    .map((e) => ({ label: e.text, meaning: LAB_MEANING[e.text] ?? 'discussed with your care team as part of your results.' }))
  const symptoms = ex.entities.filter((e) => e.type === 'SIGN_SYMPTOM').map((e) => e.text)
  return {
    base: ex,
    diagnoses,
    procedures,
    medications,
    labs,
    symptoms,
    priorAuthApproved: false,
    financialAssistance: false,
    claimStatus: 'review',
    events: [ev('system', [...PORTALS], 'system', 'Encounter synthesized from the clinical note', 'Four portals opened from one note. Every action here ripples across all of them.')],
  }
}

// ── Derived (pure recompute) ─────────────────────────────────────────────────
export interface DerivedService { code: string; label: string; price: number; patient: number }
export interface Derived {
  reviewRisk: number
  readmissionRisk: number
  route: 'standard' | 'frontier'
  allowed: number
  expectedReimb: number
  patientLow: number
  patientHigh: number
  estPay: string
  medMonthly: number
  services: DerivedService[]
  cohort: 'cardiometabolic' | 'chronic care'
  cohortLabel: string
  costTier: 'Moderate' | 'Higher'
  pipeline: { label: string; state: 'done' | 'active' | 'todo' }[]
  anyAuthNeeded: boolean
  authorizedAll: boolean
  acceptedCodes: number
  totalCodes: number
  inNetwork: number
  trend: number[]
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

export function derive(s: EncounterState): Derived {
  const activeProc = s.procedures.filter((p) => p.accepted)
  const billedDx = s.diagnoses.filter((d) => d.accepted)
  const allowed = activeProc.reduce((a, p) => a + p.price, 0)
  const coins = 0.2

  const anyAuthNeeded = s.procedures.some((p) => p.accepted && p.authNeeded)
  const authorizedAll = !anyAuthNeeded || s.priorAuthApproved

  // Claim readiness recomputed from the current claim state, not a denial model.
  // Readiness improves when the required authorization is approved or an
  // authorization sensitive procedure is dropped, both auditable changes.
  let review = s.base.reviewRisk
  if (s.priorAuthApproved && anyAuthNeeded) review = Math.max(5, review - 35)
  const removed = s.procedures.length - activeProc.length
  review -= removed * 4
  if (s.claimStatus === 'submitted' || s.claimStatus === 'reimbursed') review -= 4
  review = Math.max(5, Math.min(95, Math.round(review)))
  const route: Derived['route'] = review > 60 ? 'frontier' : 'standard'

  const expectedReimb = Math.round(allowed * (1 - (review / 100) * 0.35))

  const faFactor = s.financialAssistance ? 0.4 : 1
  const services: DerivedService[] = activeProc.map((p) => ({
    code: p.code,
    label: p.label,
    price: p.price,
    patient: Math.round(p.price * coins * faFactor),
  }))
  const medMonthly = s.medications.filter((m) => m.active).length * 10
  let patient = services.reduce((a, x) => a + x.patient, 0) + Math.round(medMonthly * faFactor)
  patient = Math.max(0, patient)
  const patientLow = Math.round(patient * 0.6)
  const patientHigh = Math.round(patient * 1.4)

  const cohort: Derived['cohort'] =
    billedDx.some((c) => /^E1[01]/.test(c.code)) || billedDx.some((c) => icdKey(c.code).startsWith('I'))
      ? 'cardiometabolic'
      : 'chronic care'

  const slope = 1.5 + (review / 100) * 4
  const trend = Array.from({ length: 8 }, (_, i) => Math.round(100 + slope * i + (i % 2 === 0 ? 1.5 : -1)))

  return {
    reviewRisk: review,
    readmissionRisk: s.base.readmissionRisk,
    route,
    allowed,
    expectedReimb,
    patientLow,
    patientHigh,
    estPay: allowed || medMonthly ? `${fmt$(patientLow)} to ${fmt$(patientHigh)}` : 'Low',
    medMonthly: Math.round(medMonthly * faFactor),
    services,
    cohort,
    cohortLabel: cohort === 'cardiometabolic' ? 'Cardiometabolic' : 'Chronic care',
    costTier: activeProc.length && anyAuthNeeded ? 'Higher' : 'Moderate',
    pipeline: pipelineFor(s.claimStatus),
    anyAuthNeeded,
    authorizedAll,
    acceptedCodes: billedDx.length + activeProc.length,
    totalCodes: s.diagnoses.length + s.procedures.length,
    inNetwork: 100,
    trend,
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
  | { type: 'sendMessage'; from: Portal; to: Portal[]; body: string }
  | { type: 'markRead'; portal: Portal }

export function reducer(s: EncounterState, a: EncAction): EncounterState {
  switch (a.type) {
    case 'toggleDx': {
      const dx = s.diagnoses.find((d) => d.code === a.code)
      if (!dx) return s
      const on = !dx.accepted
      return {
        ...s,
        diagnoses: s.diagnoses.map((d) => (d.code === a.code ? { ...d, accepted: on } : d)),
        events: [
          ev('physician', ['hospital', 'employer'], 'action', `Diagnosis ${on ? 'confirmed' : 'removed'}: ${dx.code}`, `${dx.name} ${on ? 'added to' : 'removed from'} the billed diagnosis set. Cohort and claim updated.`),
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
          ev('physician', ['patient', 'hospital', 'employer'], 'action', `${on ? 'Procedure added to' : 'Procedure removed from'} the plan: ${pr.code}`, `${pr.label}. Patient cost, expected reimbursement, and claim readiness were recalculated.`),
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
          ev('physician', ['patient'], 'action', `Medication ${on ? 'resumed' : 'paused'}: ${md.name}`, `Your medication list and monthly cost estimate were updated.`),
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
          ev('physician', ['patient', 'hospital'], 'action', 'Prior authorization approved', 'The flagged procedures are authorized. Claim readiness improved and the claim is cleared for submission. The patient now sees the procedure as covered.'),
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
          ev('hospital', ['patient', 'physician'], 'action', 'Claim submitted to payer', 'The claim moved to the payer. The patient can track billing status, and the chart reflects submission.'),
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
          ev('patient', ['hospital'], 'action', 'Financial assistance requested', 'The patient applied for assistance. Their out of pocket estimate dropped and the request was routed to revenue cycle for screening.'),
          ...s.events,
        ],
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

// ── Selectors ────────────────────────────────────────────────────────────────
export const inboxFor = (s: EncounterState, p: Portal) => s.events.filter((e) => e.to.includes(p))
export const unreadFor = (s: EncounterState, p: Portal) =>
  s.events.filter((e) => e.to.includes(p) && !e.readBy.includes(p) && e.from !== p).length
