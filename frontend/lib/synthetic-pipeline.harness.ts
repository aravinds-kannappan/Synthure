import { DEMO_JOURNEYS } from './journey'
import { PIPELINE, STAKEHOLDER_ORDER } from './synthure'
import { createSyntheticPipelineSnapshot } from './synthetic-pipeline'
import { DEFAULT_INSURANCE_INPUT, INSURANCE_SCENARIOS, runInsuranceDemo } from './insurance-demo'

export function runSyntheticPipelineHarness() {
  const failures: string[] = []
  let checks = 0
  const check = (label: string, ok: boolean) => { checks++; if (!ok) failures.push(label) }
  for (const journey of DEMO_JOURNEYS) {
    const snap = createSyntheticPipelineSnapshot(journey.id)
    check(`${journey.id}: every source entity preserves its exact span without confidence`, snap.entities.every((e) => e.start != null && e.end != null && snap.note.slice(e.start, e.end) === e.text && e.confidence === undefined))
    check(`${journey.id}: all real clinical stages are skipped`, PIPELINE.every((p) => snap.state.status[p.id] === 'skipped') && snap.stages.length === PIPELINE.length)
    check(`${journey.id}: no fabricated extraction, risk, timing or audit measurements`, snap.state.extraction === null && snap.state.verification === null && snap.state.safety === null && snap.state.guardrails === null && snap.state.harness === null && Object.keys(snap.state.stageInfo).length === 0)
    check(`${journey.id}: all four roles receive authored reports`, STAKEHOLDER_ORDER.every((role) => snap.reports[role].stakeholder === role && snap.reports[role].sections.length > 0))
    const patientText = JSON.stringify(snap.reports.patient)
    check(`${journey.id}: patient medication directions are copied exactly`, journey.medications.every((m) => patientText.includes(m.instructions)))
    check(`${journey.id}: employer snapshot has no condition or medication text`, !JSON.stringify(snap.reports.employer).includes(journey.conditions[0].label) && !JSON.stringify(snap.reports.employer).includes(journey.medications[0].name))
    check(`${journey.id}: no external actions are claimed`, STAKEHOLDER_ORDER.every((role) => snap.reports[role].actions.length === 0) && snap.state.live === false)
    const scenario = INSURANCE_SCENARIOS.find((s) => s.id === journey.id)!
    check(`${journey.id}: clinician role link preserves scenario visit count`, snap.roleLinks.physician === `/demo?scenario=${journey.id}&visits=${scenario.defaultVisits}&role=clinician`)
    check(`${journey.id}: insurance engine retains the same scenario`, snap.insurance.scenario.id === journey.id && snap.insurance.model.status === 'trained_synthetic_only')
    const insuranceDefault = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: scenario.id, expectedVisits: scenario.defaultVisits })
    check(`${journey.id}: dashboard and insurance defaults use identical assumptions and totals`, snap.insurance.input.expectedVisits === scenario.defaultVisits && snap.insurance.plans.every((p) => insuranceDefault.plans.find((q) => q.id === p.id)?.totalAnnualCost === p.totalAnnualCost))
  }
  let refused = false
  try { createSyntheticPipelineSnapshot('a private note') } catch { refused = true }
  check('snapshot path refuses custom patient text instead of making a fallback report', refused)
  const result = { checks, failures }
  console.log(JSON.stringify(result, null, 2))
  return result
}
