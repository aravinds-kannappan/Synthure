// ── Cross portal tasks / handoffs ────────────────────────────────────────────
// A task is a unit of work that originates in one portal and is resolved in
// another. Tasks are derived from the live readiness checks and encounter state,
// so they stay in sync with what is actually open; only their handoff status
// lives in state (encounter.raisedTasks). Resolving a task dispatches the same
// underlying action the portal already supports, so the fix ripples through
// derive() exactly as a direct action would. No task invents a number.

import type { EncounterState, Derived, Portal, EncAction } from './encounter'
import { checkFactId } from './encounter'

export interface Task {
  id: string
  title: string
  detail: string
  owner: Portal // the portal that resolves it
  raisedBy: Portal // the portal it originates from
  factId: string // the fact this task acts on, for provenance threading
  source: string
  action: EncAction | null // dispatch to resolve; null when resolved off platform
  done: boolean
  raised: boolean // explicitly handed off to the owner
}

// Build the current task set from state + derived. Pure, no side effects.
export function buildTasks(s: EncounterState, d: Derived): Task[] {
  const tasks: Task[] = []
  const authProcs = s.procedures.filter((p) => p.accepted && p.authNeeded)
  const flagged = (id: string) => d.checks.find((c) => c.id === id && c.status === 'flag')

  if (authProcs.length || s.priorAuthApproved) {
    tasks.push({
      id: 'prior_auth',
      title: 'Clear prior authorization',
      detail: authProcs.length
        ? `${authProcs.map((p) => `${p.label} (${p.code})`).join('; ')} require prior authorization before the claim can proceed.`
        : 'Prior authorization is on file.',
      owner: 'hospital',
      raisedBy: 'physician',
      factId: checkFactId('prior_auth'),
      source: 'CMS OPD prior authorization list; published commercial payer lists',
      action: s.priorAuthApproved ? null : { type: 'approvePriorAuth' },
      done: s.priorAuthApproved || authProcs.length === 0,
      raised: s.raisedTasks.includes('prior_auth'),
    })
  }

  const linkage = flagged('linkage')
  if (linkage) {
    tasks.push({
      id: 'supporting_diagnosis',
      title: 'Add a supporting diagnosis',
      detail: 'A billed procedure has no diagnosis to establish medical necessity. Confirm at least one diagnosis on the claim.',
      owner: 'physician',
      raisedBy: 'hospital',
      factId: checkFactId('linkage'),
      source: 'Claim completeness (structural)',
      action: null, // resolved by toggling a diagnosis back on in the clinician console
      done: false,
      raised: true,
    })
  }

  const billable = flagged('billable')
  if (billable) {
    tasks.push({
      id: 'billable',
      title: 'Resolve a non billable diagnosis code',
      detail: 'A diagnosis on the claim is a category header, not a billable code. Code to the highest available specificity.',
      owner: 'physician',
      raisedBy: 'hospital',
      factId: checkFactId('billable'),
      source: 'CMS ICD 10 CM FY2026 order file',
      action: null,
      done: false,
      raised: true,
    })
  }

  if (s.financialAssistance) {
    tasks.push({
      id: 'financial_assistance',
      title: 'Review financial assistance request',
      detail: 'The patient requested financial assistance screening. Eligibility depends on the hospital policy and household income.',
      owner: 'hospital',
      raisedBy: 'patient',
      factId: 'plan:assistance',
      source: 'Hospital financial assistance policy',
      action: null, // reviewed off platform by the billing team
      done: false,
      raised: true,
    })
  }

  // ── Survey-driven handoffs (deterministic, sourced to the intake survey) ────
  if (s.survey.submitted && s.survey.transportation) {
    tasks.push({
      id: 'telehealth_follow_up',
      title: 'Offer a telehealth follow up',
      detail: 'The patient reported a transportation barrier to in person visits. Offer a telehealth follow up where clinically appropriate.',
      owner: 'physician',
      raisedBy: 'patient',
      factId: 'survey',
      source: 'Patient intake survey',
      action: null,
      done: false,
      raised: true,
    })
  }
  if (s.survey.submitted && s.survey.financialHardship && !s.financialAssistance) {
    tasks.push({
      id: 'offer_financial_assistance',
      title: 'Proactively offer financial assistance',
      detail: 'The patient reported financial hardship. Offer financial assistance screening before any balance is billed.',
      owner: 'hospital',
      raisedBy: 'patient',
      factId: 'plan:assistance',
      source: 'Patient intake survey',
      action: null,
      done: false,
      raised: true,
    })
  }
  if (s.survey.submitted && s.survey.comorbidities.length) {
    tasks.push({
      id: 'reconcile_comorbidities',
      title: 'Reconcile patient-reported conditions',
      detail: `The patient reported conditions that may not be in the note: ${s.survey.comorbidities.join(', ')}. Reconcile with the chart and document if confirmed.`,
      owner: 'physician',
      raisedBy: 'patient',
      factId: 'survey',
      source: 'Patient intake survey',
      action: null,
      done: false,
      raised: true,
    })
  }

  return tasks
}

export const openTasksFor = (tasks: Task[], p: Portal) => tasks.filter((t) => t.owner === p && !t.done)
export const openTaskCount = (tasks: Task[], p: Portal) => openTasksFor(tasks, p).length
