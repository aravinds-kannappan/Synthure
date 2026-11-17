/** Explicit authored snapshot for the interactive dashboard. This is not a
 * fallback for a failed live run and must never enter the real run/audit logs.
 * No clinical model, writer, verifier or safety pipeline is represented as run. */
import { DEMO_JOURNEYS, aggregateEmployerJourney, createJourneyState, type Journey } from './journey'
import { DEFAULT_INSURANCE_INPUT, INSURANCE_SCENARIOS, runInsuranceDemo } from './insurance-demo'
import { PIPELINE, type Entity, type Stakeholder, type StakeholderReport, type Synthesis } from './synthure'
import type { SynthesisState } from './useSynthesis'

export interface SyntheticStage {
  id: string; label: string; status: 'skipped'; detail: string;
}
export interface SyntheticPipelineSnapshot {
  mode: 'synthetic_snapshot'; id: string; title: string; note: string; journey: Journey;
  sourceLabel: string; disclaimer: string; entities: Entity[];
  reports: Record<Stakeholder, StakeholderReport>; synthesis: Synthesis;
  state: SynthesisState; stages: SyntheticStage[]; performedSteps: string[]; notPerformed: string[];
  roleLinks: Record<Stakeholder, string>;
  insurance: ReturnType<typeof runInsuranceDemo>;
}

export const SYNTHETIC_PIPELINE_OPTIONS = DEMO_JOURNEYS.map((j) => ({ id: j.id, title: j.title, sourceLabel: j.sourceLabel }))

const SKIPPED: Record<string, string> = {
  deid: 'Not run. This is an authored fictional note; no de-identification or privacy guarantee is claimed.',
  ner: 'Not run. Exact source spans were authored with this fixture and mapped locally; no NER confidence exists.',
  classify: 'Not run. The fixture names its visit type; no note classifier or section model was executed.',
  rag: 'Not run. No ICD or CPT code is inferred, validated, or added to this snapshot.',
  risk: 'Not run. No clinical risk, readmission rate, claim-readiness probability, or missing-info prediction is produced.',
  patient: 'No writer model ran. The patient snapshot uses authored explanations and copies the fixture instructions exactly.',
  physician: 'No writer model ran. The clinician snapshot lists source facts and local review tasks.',
  hospital: 'No writer model ran. The staff snapshot lists local coordination work and an explicitly fictional cost scenario.',
  employer: 'No writer model ran. The employer snapshot counts a separately authored fictional cohort without individual clinical details.',
  verify: 'Not run. No verifier judgment, source-check score, or clinical correctness certification exists for this snapshot.',
  synth: 'No orchestrator model ran. The role connections are authored product examples.',
  critic: 'Not run. No constitution critique or automated clinical safety review is claimed.',
  gate: 'Not run. No live release gate approved these reports. They are visibly labelled authored demonstration content.',
}

function literalEntity(note: string, text: string, type: string): Entity {
  const start = note.indexOf(text)
  if (start < 0) throw new Error('Synthetic facts must preserve exact source text')
  return { text, type, start, end: start + text.length, source: 'literal' }
}

export function createSyntheticPipelineSnapshot(scenarioId: string): SyntheticPipelineSnapshot {
  const journey = DEMO_JOURNEYS.find((j) => j.id === scenarioId)
  if (!journey) throw new Error('Choose one of the authored synthetic scenarios; custom notes are not accepted by this snapshot path')
  const local = createJourneyState(journey)
  const aggregate = aggregateEmployerJourney(local)
  const scenario = INSURANCE_SCENARIOS.find((s) => s.id === journey.id)!
  const insurance = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: journey.id, expectedVisits: scenario.defaultVisits })
  const examplePlan = insurance.recommendedPlan
  const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  const entities = [
    ...journey.conditions.map((c) => literalEntity(journey.note, c.evidence.text, 'DIAGNOSIS')),
    ...journey.medications.map((m) => literalEntity(journey.note, m.name, 'MEDICATION')),
    ...journey.services.map((s) => literalEntity(journey.note, s.evidence.text, 'PROCEDURE')),
  ]
  const reports: Record<Stakeholder, StakeholderReport> = {
    patient: {
      stakeholder: 'patient', headline: 'Know your next step.',
      summary: 'Read your medication directions, see what happens next, and prepare a question for your care team.',
      metrics: [{ label: 'Source', value: 'Fictional note', tone: 'neutral' }, { label: 'Coverage', value: 'Unverified', tone: 'warn' }],
      sections: [
        { heading: 'The documented condition', body: journey.conditions.map((c) => c.label).join('; '), bullets: journey.conditions.map((c) => c.explanation) },
        { heading: 'Medication instructions, copied exactly', body: 'These are directions in the synthetic record, not advice for a real person.', bullets: journey.medications.map((m) => m.instructions) },
        { heading: 'Your next step, copied exactly', body: 'Confirm the plan and timing with the care team in the interactive workspace.', bullets: journey.nextSteps.map((s) => s.detail) },
        { heading: 'A question to check understanding', body: journey.teachBack[0]?.question ?? 'What would you like clarified?', bullets: ['Responses remain available for staff review; saving a response does not certify understanding.'] },
      ], actions: [],
    },
    physician: {
      stakeholder: 'physician', headline: 'Keep the clinical context.',
      summary: 'Review facts against the source note, confirm the plan, and respond to patient questions.',
      metrics: [{ label: 'Clinical review', value: 'Not recorded', tone: 'warn' }, { label: 'Source facts', value: String(entities.length), tone: 'neutral' }],
      sections: [
        { heading: 'Documented facts', body: 'The source is an authored sample, not an imported patient record.', bullets: [...journey.conditions.map((c) => c.evidence.text), ...journey.services.map((s) => s.evidence.text)] },
        { heading: 'Medication directions to review', body: 'No dose or frequency was inferred by the snapshot adapter.', bullets: journey.medications.map((m) => m.evidence.text) },
        { heading: 'Close the communication loop', body: 'The interactive workspace can record a local review, patient response and staff task status.', bullets: ['Confirm the plan against its source.', 'Review the patient’s own explanation and unresolved questions.', 'Route the requested service to a named staff workflow.'] },
      ], actions: [],
    },
    hospital: {
      stakeholder: 'hospital', headline: 'Keep care moving.',
      summary: 'Track benefits checks and referral tasks, with clear owners and evidence for each status.',
      metrics: [{ label: 'Open staff tasks', value: String(local.tasks.filter((t) => t.owner === 'hospital').length), tone: 'warn' }, { label: 'Appointment', value: 'Not booked', tone: 'neutral' }],
      sections: [
        { heading: 'Work to coordinate', body: journey.services.map((s) => s.label).join('; '), bullets: local.tasks.filter((t) => t.owner === 'hospital').map((t) => `${t.title}: ${t.detail}`) },
        { heading: 'Keep authorization separate', body: 'Eligibility, network, benefits, authorization and final payment are different facts.', bullets: ['A staff-recorded authorization needs its own evidence reference.', 'Recording an approval does not turn coverage into a guarantee.'] },
        { heading: 'Illustrative annual comparison', body: `${examplePlan.name}: ${money(examplePlan.totalAnnualCost)} for premiums plus ${insurance.input.expectedVisits} fictional visits. This is not a provider quote or the patient’s verified cost.`, bullets: [examplePlan.calculation, 'The local synthetic ranker orders fictional plans; exact sample-plan IDs map their fictional provider networks.'] },
      ], actions: [],
    },
    employer: {
      stakeholder: 'employer', headline: 'See where care gets stuck.',
      summary: `Follow review, response, and coordination counts across ${aggregate.cohortSize} fictional journeys.`,
      metrics: [{ label: 'Fictional journeys', value: String(aggregate.cohortSize), tone: 'neutral' }, { label: 'Open benefits tasks', value: String(aggregate.openBenefitsTasks), tone: 'neutral' }],
      sections: [
        { heading: 'Aggregate workflow', body: 'Twenty-four separately authored fictional records plus the current fictional journey. No patient-level drilldown is included.', bullets: [`Clinical reviews recorded: ${aggregate.clinicalReviewsRecorded}`, `Understanding responses recorded: ${aggregate.understandingResponsesRecorded}`, `Provider preferences recorded: ${aggregate.providerPreferencesRecorded}`, `Open coordination tasks: ${aggregate.openCoordinationTasks}`] },
        { heading: 'Interpret these counts carefully', body: 'Recorded responses do not prove comprehension, and a provider preference is not an appointment.', bullets: ['No diagnoses, medication details, notes or individual messages belong in this view.', 'Real employer reporting needs an authorized cohort, access controls and privacy review.'] },
      ], actions: [],
    },
  }
  const synthesis: Synthesis = {
    summary: 'An authored example of one care journey viewed by four roles. The patient plan, clinician review and staff tasks share source facts; the employer sees only fictional aggregate workflow counts.',
    connections: ['Patient questions become local items for the care team to review.', 'Staff verifies plan and service requirements separately from clinical review.', 'Provider selection expresses a preference; booking still needs confirmation.', 'Aggregate counts describe workflow activity, not proven health or financial outcomes.'],
  }
  const stages = PIPELINE.map((p): SyntheticStage => ({ id: p.id, label: p.name, status: 'skipped', detail: SKIPPED[p.id] }))
  const state: SynthesisState = {
    phase: 'complete', // Authored snapshot loaded; this is not a pipeline release.
    modelProgress: {}, status: Object.fromEntries(stages.map((s) => [s.id, s.status])),
    activeId: null, deid: null, stageInfo: {}, extraction: null,
    reports, revised: [], verification: null, synthesis, safety: null, guardrails: null, harness: null,
    live: false, error: null,
  }
  const roleLinks = Object.fromEntries((['patient', 'physician', 'hospital', 'employer'] as Stakeholder[]).map((role) => [role, `/demo?scenario=${encodeURIComponent(journey.id)}&visits=${insurance.input.expectedVisits}&role=${role === 'physician' ? 'clinician' : role}`])) as Record<Stakeholder, string>
  return {
    mode: 'synthetic_snapshot', id: journey.id, title: journey.title, note: journey.note, journey,
    sourceLabel: 'Authored synthetic snapshot · no clinical pipeline run',
    disclaimer: 'This demonstration loads authored example reports and exact source spans. It does not run clinical extraction, coding, report writers, verification or safety gates. Costs and provider mappings are fictional scenarios; the separate local insurance preference ranker runs on synthetic inputs. Nothing is sent or persisted by this adapter.',
    entities, reports, synthesis, state, stages, roleLinks, insurance,
    performedSteps: ['Loaded an authored fictional note and its exact evidence spans.', 'Constructed four authored report snapshots.', 'Computed fictional benefit arithmetic and exact sample-plan network matches.', 'Executed the separately trained synthetic insurance preference ranker locally.', 'Counted an explicitly fictional employer workflow cohort.'],
    notPerformed: ['No real-patient de-identification or clinical extraction.', 'No diagnostic coding, prescribing, clinical risk score or claims decision.', 'No language-model report generation, verifier, critic or release gate.', 'No real coverage, provider availability, authorization or price verification.', 'No messages, bookings, claims, enrollment, real run logging or network calls.'],
  }
}
