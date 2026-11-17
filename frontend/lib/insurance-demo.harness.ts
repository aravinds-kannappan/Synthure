import model from './insurance-demo-model.json'
import { DEFAULT_INSURANCE_INPUT, INSURANCE_SCENARIOS, runInsuranceDemo, type InsuranceInput } from './insurance-demo'
import { DEMO_JOURNEYS, createJourneyState, journeyReducer, rankPlans } from './journey'

export function runInsuranceDemoHarness() {
  const failures: string[] = []
  let checks = 0
  const check = (label: string, ok: boolean) => { checks++; if (!ok) failures.push(label) }
  check('runtime loads actually trained synthetic weights', model.status === 'trained_synthetic_only' && model.training.cases === 1200 && model.weights.some((w) => Math.abs(w) > .01))
  check('heldout metadata is explicitly synthetic and not production readiness', model.evaluation.heldoutCases === 300 && !model.productionReady && model.evaluation.interpretation.includes('Synthetic-policy fidelity'))
  for (const [index, reference] of model.verificationCases.entries()) {
    const result = runInsuranceDemo(reference.input as InsuranceInput)
    check(`runtime matches independent Python model inference for heldout case ${index + 1}`, result.recommendedPlan.id === reference.modelTopPlanId)
  }
  for (const scenario of INSURANCE_SCENARIOS) {
    const base = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: scenario.id })
    check(`${scenario.id}: providers offer the scenario specialty`, base.providers.every((p) => p.specialty === scenario.specialty))
    check(`${scenario.id}: no real plan or provider is presented`, base.plans.every((p) => p.fictional) && base.providers.every((p) => p.fictional))
    const zero = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: scenario.id, expectedVisits: 0 })
    check(`${scenario.id}: zero visits still require premiums`, zero.plans.every((p) => p.estimatedCareCost === 0 && p.totalAnnualCost === p.annualPremium))
    const many = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: scenario.id, expectedVisits: 36 })
    check(`${scenario.id}: care cost does not fall when use increases`, many.plans.every((p) => p.estimatedCareCost >= (base.plans.find((x) => x.id === p.id)?.estimatedCareCost ?? Infinity)))
    check(`${scenario.id}: premiums remain separate from the care cap`, many.plans.every((p) => p.estimatedCareCost <= p.oopMax && p.totalAnnualCost === p.annualPremium + p.estimatedCareCost && p.worstCaseAnnualCost === p.annualPremium + p.oopMax))
    const journey = createJourneyState(DEMO_JOURNEYS.find((j) => j.id === scenario.id)!)
    const transferred = journeyReducer(journey, { type: 'setPreferences', preferences: { expectedVisits: 17, monthlyBudget: 400, priority: 'predictable_cost' } })
    const comparison = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: scenario.id, expectedVisits: 17, monthlyBudget: 400, priority: 'predictable_cost' })
    check(`${scenario.id}: transferring a comparison preserves all plan cost totals`, comparison.plans.every((p) => {
      const j = rankPlans(transferred).find((q) => q.id === p.id)
      return j?.totalAnnualCost === p.totalAnnualCost && j.estimatedCareCost === p.estimatedCareCost && j.worstCaseAnnualCost === p.worstCaseAnnualCost
    }))
  }
  const tight = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, monthlyBudget: 120, priority: 'predictable_cost' })
  check('budget constraint takes precedence over learned preference', tight.recommendedPlan.id === 'sample-lowpremium' && tight.recommendedPlan.budgetFit)
  const impossible = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, monthlyBudget: 0 })
  check('no-budget-match state does not claim a feasible plan', !impossible.hasBudgetMatch && impossible.plans.every((p) => !p.budgetFit) && impossible.explanation.includes('None'))
  const lowPremium = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, monthlyBudget: 600, priority: 'lowest_premium' })
  const predictable = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, monthlyBudget: 600, priority: 'predictable_cost' })
  check('preference changes alter the learned recommendation when budget permits', lowPremium.recommendedPlan.id !== predictable.recommendedPlan.id)
  const saver = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, selectedPlanId: 'sample-lowpremium' })
  const hmo = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, selectedPlanId: 'sample-predictable' })
  check('network mapping uses exact fictional plan IDs', saver.providers.every((p) => (p.networkStatus === 'sample_match') === p.planIds.includes('sample-lowpremium')) && hmo.providers.every((p) => (p.networkStatus === 'sample_match') === p.planIds.includes('sample-predictable')))
  check('selecting a plan remaps the matching provider', saver.providers[0].id !== hmo.providers[0].id && saver.selectedPlan.id === 'sample-lowpremium' && hmo.selectedPlan.id === 'sample-predictable')
  const narrow = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, selectedPlanId: 'sample-lowpremium', preferredLanguage: 'Spanish', maxTravelMiles: 3 })
  check('language/travel gaps remain visible instead of inventing a matching provider', narrow.providers.filter((p) => p.networkStatus === 'sample_match').every((p) => p.gaps.includes('Language preference not matched') && p.gaps.includes('Outside travel preference')))
  const invalid = runInsuranceDemo({ ...DEFAULT_INSURANCE_INPUT, scenarioId: 'not-real', expectedVisits: NaN, monthlyBudget: Infinity, maxTravelMiles: -1, selectedPlanId: 'real-carrier', preferredLanguage: 'Unknown' })
  check('unsupported inputs normalize without invented plans or NaN costs', invalid.scenario.id === INSURANCE_SCENARIOS[0].id && invalid.plans.every((p) => Number.isFinite(p.totalAnnualCost) && Number.isFinite(p.modelScore)) && invalid.input.selectedPlanId === null)
  check('displayed money comes from arithmetic independent of the ranking priority', lowPremium.plans.every((p) => p.totalAnnualCost === predictable.plans.find((q) => q.id === p.id)?.totalAnnualCost))
  const snapshot = JSON.stringify(DEFAULT_INSURANCE_INPUT)
  runInsuranceDemo(DEFAULT_INSURANCE_INPUT)
  check('evaluation does not mutate the caller input', JSON.stringify(DEFAULT_INSURANCE_INPUT) === snapshot)
  const result = { checks, failures }
  console.log(JSON.stringify(result, null, 2))
  return result
}
