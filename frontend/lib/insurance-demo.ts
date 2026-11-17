/** Synthetic insurance mapping. This module has no network or storage access.
 * Cost math and exact fictional plan/provider mapping are deterministic. Only
 * the ordering within the eligible demo choices uses learned synthetic weights. */
import artifact from './insurance-demo-model.json'
import { DEMO_JOURNEYS, SAMPLE_PLANS, SAMPLE_PROVIDERS, samplePlanCost } from './journey'

export interface InsuranceInput {
  scenarioId: string; priority: 'balanced' | 'lowest_premium' | 'predictable_cost';
  expectedVisits: number; monthlyBudget: number; maxTravelMiles: number;
  preferredLanguage: string; selectedPlanId: string | null;
}
export interface InsuranceScenario {
  id: string; title: string; note: string; condition: string; serviceLabel: string;
  specialty: string; description: string; defaultVisits: number; sourceLabel: string;
}
export interface InsurancePlanResult {
  id: string; name: string; type: string; rank: number; score: number; modelScore: number;
  monthlyPremium: number; annualPremium: number; deductible: number; oopMax: number;
  coinsurance: number; estimatedCareCost: number; totalAnnualCost: number;
  worstCaseAnnualCost: number; budgetFit: boolean; calculation: string;
  reasons: string[]; gaps: string[]; networkProviderCount: number; fictional: true;
}
export interface InsuranceProviderResult {
  id: string; name: string; specialty: string; facility: string; distanceMiles: number;
  languages: string[]; nextAvailable: string; rank: number; score: number;
  networkStatus: 'sample_match' | 'not_in_sample_network'; planIds: string[];
  reasons: string[]; gaps: string[]; fictional: true;
}

export const INSURANCE_SCENARIOS: InsuranceScenario[] = DEMO_JOURNEYS.map((j, i) => ({
  id: j.id, title: j.title, note: j.note, condition: j.conditions[0].label,
  serviceLabel: j.services[0].label, specialty: j.services[0].specialty,
  description: j.context.careGoal, defaultVisits: [6, 4, 8][i], sourceLabel: 'Fictional care scenario and authored benefit schedules',
}))
export const DEFAULT_INSURANCE_INPUT: InsuranceInput = {
  scenarioId: 'knee-osteoarthritis', priority: 'balanced', expectedVisits: 6,
  monthlyBudget: 250, maxTravelMiles: 10, preferredLanguage: 'English', selectedPlanId: null,
}

export const SYNTHETIC_MODEL_INFO = {
  status: artifact.status,
  label: 'Locally trained synthetic preference ranker',
  modelType: artifact.modelType,
  trainingRows: artifact.training.rows,
  trainingCases: artifact.training.cases,
  holdoutCases: artifact.evaluation.heldoutCases,
  heldoutSyntheticFidelity: artifact.evaluation.top1PolicyAgreement,
  pairwiseSyntheticFidelity: artifact.evaluation.pairwisePolicyAgreement,
  features: artifact.features,
  disclaimer: 'The model learned an authored preference policy on fictional cases. Held-out results measure reproduction of that policy, not real insurance accuracy, eligibility, savings, or clinical benefit.',
}

const finite = (v: number, fallback: number, lo: number, hi: number) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
const currency = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export function runInsuranceDemo(raw: InsuranceInput) {
  const scenario = INSURANCE_SCENARIOS.find((s) => s.id === raw.scenarioId) ?? INSURANCE_SCENARIOS[0]
  const priority = ['balanced', 'lowest_premium', 'predictable_cost'].includes(raw.priority) ? raw.priority : 'balanced'
  const input: InsuranceInput = {
    scenarioId: scenario.id, priority,
    expectedVisits: Math.round(finite(raw.expectedVisits, scenario.defaultVisits, 0, 36)),
    monthlyBudget: finite(raw.monthlyBudget, DEFAULT_INSURANCE_INPUT.monthlyBudget, 0, 600),
    maxTravelMiles: finite(raw.maxTravelMiles, DEFAULT_INSURANCE_INPUT.maxTravelMiles, 1, 25),
    preferredLanguage: raw.preferredLanguage === 'Spanish' ? 'Spanish' : 'English',
    selectedPlanId: SAMPLE_PLANS.some((p) => p.id === raw.selectedPlanId) ? raw.selectedPlanId : null,
  }
  const specialtyProviders = SAMPLE_PROVIDERS.filter((p) => p.specialty === scenario.specialty)
  const plans = SAMPLE_PLANS.map((plan): InsurancePlanResult => {
    const costs = samplePlanCost(plan, scenario.id, input.expectedVisits)
    const { allowed, deductiblePaid, estimatedCareCost, annualPremium, totalAnnualCost, worstCaseAnnualCost } = costs
    const copay = costs.visitCopay
    const matches = specialtyProviders.filter((p) => p.samplePlanIds.includes(plan.id))
    const accessible = matches.filter((p) => p.distanceMiles <= input.maxTravelMiles && p.languages.includes(input.preferredLanguage))
    const budgetFit = plan.monthlyPremium <= input.monthlyBudget
    // These fixed scaling constants and feature ordering are exported by the
    // training artifact. No real personal-health feature enters the ranker.
    const base = [
      totalAnnualCost / 10000,
      annualPremium / 4000,
      worstCaseAnnualCost / 12000,
      matches.length / 2,
      accessible.length / 2,
    ]
    const features = (['balanced', 'lowest_premium', 'predictable_cost'] as const).flatMap((p) => base.map((v) => p === priority ? v : 0))
    const modelScore = features.reduce((sum, value, i) => sum + value * artifact.weights[i], 0)
    const formula = copay === null
      ? `${currency(annualPremium)} premiums + ${currency(deductiblePaid)} toward the deductible + ${Math.round(plan.coinsurance * 100)}% × ${currency(Math.max(0, allowed - deductiblePaid))} after the deductible`
      : `${currency(plan.monthlyPremium)} × 12 months + ${input.expectedVisits} visits × ${currency(copay)} copay; deductible waived for these fictional visits`
    return {
      id: plan.id, name: plan.name, type: plan.type, rank: 0, score: 0, modelScore,
      monthlyPremium: plan.monthlyPremium, annualPremium, deductible: plan.deductible, oopMax: plan.oopMax,
      coinsurance: plan.coinsurance, estimatedCareCost, totalAnnualCost, worstCaseAnnualCost,
      budgetFit, calculation: `${formula}. Covered-care cost capped at ${currency(plan.oopMax)}; premiums are outside that cap.`,
      networkProviderCount: matches.length, fictional: true,
      reasons: [
        budgetFit ? `Within your ${currency(input.monthlyBudget)}/month premium budget` : `Above your ${currency(input.monthlyBudget)}/month premium budget`,
        `${input.expectedVisits} example ${scenario.specialty.toLowerCase()} visits produce ${currency(estimatedCareCost)} in modeled care costs`,
        `${matches.length} fictional provider${matches.length === 1 ? '' : 's'} in this exact sample plan; ${accessible.length} also fit your language and travel preferences`,
        `Learned preference ordering for “${priority.replace(/_/g, ' ')}”; actual prices and network matches come from the authored fixture tables`,
      ],
      gaps: [
        'Fictional benefit schedule; not an available insurance offer',
        'Other services, prescriptions, subsidies, employer contributions and out-of-network care are excluded',
        ...(!budgetFit ? ['Exceeds your entered monthly premium budget'] : []),
        ...(!accessible.length ? ['No example provider meets both your travel and language preferences under this plan'] : []),
      ],
    }
  }).sort((a, b) => Number(!a.budgetFit) - Number(!b.budgetFit) || b.modelScore - a.modelScore || a.totalAnnualCost - b.totalAnnualCost)
  // Relative display points are not probabilities. The UI uses ordinal rank.
  const low = Math.min(...plans.map((p) => p.modelScore)), high = Math.max(...plans.map((p) => p.modelScore))
  plans.forEach((p, i) => { p.rank = i + 1; p.score = high === low ? 50 : Math.round(100 * (p.modelScore - low) / (high - low)) })
  const recommendedPlan = plans[0]
  const selectedPlan = plans.find((p) => p.id === input.selectedPlanId) ?? recommendedPlan
  const providers = specialtyProviders.map((p): InsuranceProviderResult => {
    const network = p.samplePlanIds.includes(selectedPlan.id)
    const travel = p.distanceMiles <= input.maxTravelMiles
    const language = p.languages.includes(input.preferredLanguage)
    return {
      id: p.id, name: p.name, specialty: p.specialty, facility: p.facility,
      distanceMiles: p.distanceMiles, languages: p.languages, nextAvailable: p.nextAvailable,
      rank: 0, score: Number(network) * 60 + Number(travel) * 20 + Number(language) * 20,
      networkStatus: network ? 'sample_match' : 'not_in_sample_network', planIds: p.samplePlanIds, fictional: true,
      reasons: [network ? `Exact sample-plan match: ${selectedPlan.name}` : `Not listed in ${selectedPlan.name}’s fictional network`, travel ? 'Within your travel preference' : 'Beyond your travel preference', language ? `Lists ${input.preferredLanguage}` : `${input.preferredLanguage} is not listed`],
      gaps: ['Fictional listing and availability; no real appointment is booked', ...(!network ? ['Outside the selected sample network'] : []), ...(!travel ? ['Outside travel preference'] : []), ...(!language ? ['Language preference not matched'] : [])],
    }
  }).sort((a, b) => b.score - a.score || a.distanceMiles - b.distanceMiles).map((p, i) => ({ ...p, rank: i + 1 }))
  const hasBudgetMatch = plans.some((p) => p.budgetFit)
  return {
    input, scenario, plans, providers, selectedPlan, recommendedPlan, hasBudgetMatch,
    explanation: hasBudgetMatch
      ? `${recommendedPlan.name} ranks first under your example preferences. Plans within budget are considered first, then the trained synthetic ranker orders them. This is a fictional comparison, not enrollment advice.`
      : 'None of the fictional plans fits this monthly premium budget. The options remain visible for comparison; no budget-feasible match is claimed.',
    assumptions: [
      'All patients, insurance plans, rates, networks and provider listings in this demo are fictional.',
      'Cost arithmetic uses one year, the entered visit count, and only the selected scenario’s service. These are scenario inputs, not prescribed care.',
      'The sample deductible starts unused. Stated copays waive it; the sample high-deductible plan applies it first.',
      'Out-of-pocket caps apply only to covered care in the example; premiums are always added separately.',
      'The network mapper checks exact fictional plan IDs. It does not verify a real insurer’s directory.',
      'No data is sent, no insurer is contacted, and no enrollment or appointment takes place.',
    ],
    model: SYNTHETIC_MODEL_INFO,
  }
}
