// ── Fact registry ─────────────────────────────────────────────────────────────
// A fact is one truth that surfaces in more than one portal. Each fact resolves
// to a per portal "lens": the same truth as each reader actually sees it. This is
// what makes the four portals one system rather than four tabs. Every lens is a
// projection of the shared encounter and its published sources, never a new
// number. Provenance (which events touched a fact) comes from provenanceFor() in
// encounter.ts, keyed by the same fact ids used here.

import type { EncounterState, Derived, Portal } from './encounter'
import { dxFactId, svcFactId, checkFactId } from './encounter'
import { fmt$ } from './engine'
import { PAYERS } from './pricing'

export type FactKind = 'dx' | 'service' | 'check'

export interface FactLens {
  label: string
  detail: string
}

export interface Fact {
  id: string
  kind: FactKind
  title: string
  code?: string
  source: string
  lenses: Record<Portal, FactLens>
}

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n).trimEnd()}...` : s)

// Build every clickable fact from the current encounter. Pure.
export function buildFacts(s: EncounterState, d: Derived): Record<string, Fact> {
  const facts: Record<string, Fact> = {}
  const cohort = d.cohortLabel

  // Diagnoses that are on the claim.
  for (const dx of s.diagnoses.filter((x) => x.accepted)) {
    const provenance = dx.source === 'linked' ? `Linked from the note phrase "${dx.entity ?? ''}"` : 'Written literally in the note'
    facts[dxFactId(dx.code)] = {
      id: dxFactId(dx.code),
      kind: 'dx',
      title: dx.name,
      code: dx.code,
      source: dx.billable ? 'CMS ICD 10 CM FY2026 order file' : 'CMS ICD 10 CM FY2026 order file (category header, not billable)',
      lenses: {
        patient: {
          label: 'Your diagnosis',
          detail: dx.plain ? clip(dx.plain) : 'Explained in plain language in your report below.',
        },
        physician: {
          label: dx.billable ? 'Billable code' : 'Not billable, category header',
          detail: provenance,
        },
        hospital: {
          label: 'Supports medical necessity',
          detail: 'Establishes the necessity that justifies the billed services on the claim.',
        },
        employer: {
          label: 'Population category',
          detail: `Rolls into the ${cohort} cohort (AHRQ CCSR), anonymized and aggregated.`,
        },
      },
    }
  }

  // Billed services and their dollars.
  for (const svc of d.services) {
    const proc = s.procedures.find((p) => p.code === svc.code)
    const payerLabel = PAYERS[s.plan.payer].label
    facts[svcFactId(svc.code)] = {
      id: svcFactId(svc.code),
      kind: 'service',
      title: svc.label,
      code: svc.code,
      source: 'CMS Physician Fee Schedule and Clinical Lab Fee Schedule 2026',
      lenses: {
        patient: {
          label: 'Your estimated share',
          detail:
            svc.patient != null
              ? `About ${fmt$(svc.patient)} of this service after your benefits, part of the ${d.estPay} estimate.`
              : 'No published amount, so no out of pocket estimate is shown.',
        },
        physician: {
          label: 'Ordered service',
          detail: proc?.authNeeded ? 'Commonly requires prior authorization before it can be billed.' : 'Standard submission, no authorization required.',
        },
        hospital: {
          label: svc.atRisk ? 'At risk dollars' : 'Expected reimbursement',
          detail: svc.atRisk
            ? svc.atRiskWhy ?? 'Tied to an open readiness check.'
            : `Priced at ${svc.payerPrice != null ? `${fmt$(svc.payerPrice)} (${payerLabel})` : 'no CMS amount'}.`,
        },
        employer: {
          label: 'Published cost',
          detail: `Contributes ${svc.price != null ? fmt$(svc.price) : 'no published amount'} to the population cost for this cohort.`,
        },
      },
    }
  }

  // The prior authorization readiness check, if present.
  const auth = d.checks.find((c) => c.id === 'prior_auth')
  if (auth) {
    facts[checkFactId('prior_auth')] = {
      id: checkFactId('prior_auth'),
      kind: 'check',
      title: 'Prior authorization',
      source: auth.source,
      lenses: {
        patient: {
          label: s.priorAuthApproved ? 'Covered' : 'Pending',
          detail: s.priorAuthApproved ? 'Your procedure is authorized, so it is covered.' : 'Your care team is arranging authorization.',
        },
        physician: {
          label: s.priorAuthApproved ? 'On file' : 'Handed to Revenue',
          detail: s.priorAuthApproved ? 'Authorization is on file and the check passes.' : 'Flagged and handed to Revenue Cycle to clear.',
        },
        hospital: {
          label: s.priorAuthApproved ? 'Cleared' : 'Action needed',
          detail: auth.detail,
        },
        employer: {
          label: `${d.route === 'frontier' ? 'Frontier' : 'Standard'} review`,
          detail: s.priorAuthApproved ? 'No longer routing this encounter to frontier review on this check.' : 'Keeps this encounter in the frontier review lane until cleared.',
        },
      },
    }
  }

  return facts
}
