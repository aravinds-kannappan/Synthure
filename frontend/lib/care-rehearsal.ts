/** Read-only counterfactuals for the local demonstration. A rehearsal is neither
 * a clinical recommendation nor an update to the shared journey. */
import {
  aggregateEmployerJourney, evidenceIsValid, matchProviders,
  type Evidence, type JourneyState, type Role,
} from './journey'
import { INSURANCE_SCENARIOS, runInsuranceDemo, type InsuranceInput } from './insurance-demo'

export type RehearsalScenario = 'baseline' | 'budget_pressure' | 'access_delay' | 'unclear_plan'
export const REHEARSAL_OPTIONS: ReadonlyArray<{ id: RehearsalScenario; title: string; description: string }> = [
  { id: 'baseline', title: 'Find the next handoff', description: 'See which open step needs an owner next.' },
  { id: 'budget_pressure', title: 'A tighter budget', description: 'Compare the same care assumptions with a smaller premium budget.' },
  { id: 'access_delay', title: 'The provider is unavailable', description: 'Test whether another fictional provider fits the same preferences.' },
  { id: 'unclear_plan', title: 'The plan is unclear', description: 'Prepare a specific question for the care team.' },
]

export interface RehearsalBottleneck {
  id: string; title: string; owner: Exclude<Role, 'employer'>; reason: string;
  evidence: Evidence[]; nextAction: string; question: string; questionTo: 'clinician' | 'hospital';
}
export interface RehearsalPlanComparison {
  beforeMonthlyBudget: number; afterMonthlyBudget: number;
  currentPlanId: string | null; currentPlanName: string | null;
  selectedPlanUnchanged: true; hasBudgetMatch: boolean;
  options: Array<{ id: string; name: string; monthlyPremium: number; totalAnnualCost: number; beforeBudgetFit: boolean; afterBudgetFit: boolean }>;
  summary: string;
}
export interface RehearsalProviderComparison {
  currentProviderId: string | null; currentProviderName: string | null;
  unavailableProviderId: string | null;
  alternative: { id: string; name: string; specialty: string; distanceMiles: number; languages: string[] } | null;
  selectedProviderUnchanged: true; gap: string | null; summary: string;
}
export interface CareRehearsalResult {
  scenario: RehearsalScenario; title: string; hypothetical: true; sourceLabel: string; disclaimer: string;
  bottleneck: RehearsalBottleneck;
  roles: Record<Role, { before: string; after: string }>;
  comparison: { plans: RehearsalPlanComparison | null; providers: RehearsalProviderComparison | null } | null;
  assumptions: string[];
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const answered = (state: JourneyState, id: string) => !!state.teachBackAnswers[id]?.trim()
const finiteBudget = (state: JourneyState) => Number.isFinite(state.preferences.monthlyBudget) ? Math.max(0, state.preferences.monthlyBudget) : 250

function sourceEvidence(state: JourneyState, candidates: Array<Evidence | undefined>): Evidence[] {
  const seen = new Set<string>()
  return candidates.filter((e): e is Evidence => {
    if (!e || !evidenceIsValid(state.journey, e)) return false
    const key = `${e.start}:${e.end}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3).map((e) => ({ ...e }))
}

function baselineBottleneck(state: JourneyState): RehearsalBottleneck {
  const j = state.journey
  const relevant = sourceEvidence(state, [...j.nextSteps.map((s) => s.evidence), ...j.services.map((s) => s.evidence)])
  if (!state.clinicalReviewConfirmed) return {
    id: 'clinical-review', title: 'The plan needs a clinical review', owner: 'clinician',
    reason: 'The care team has not recorded a review of the documented instructions.',
    evidence: relevant, nextAction: 'Check the source instructions and timing, then record the review.',
    question: 'Can you review the documented next steps and confirm what needs clarification before we coordinate them?', questionTo: 'clinician',
  }
  const unanswered = j.teachBack.find((q) => !answered(state, q.id))
  if (unanswered) return {
    id: 'understanding-response', title: 'The care team is waiting to hear the plan back', owner: 'patient',
    reason: 'The care team is waiting for a response to the understanding prompt.',
    evidence: sourceEvidence(state, [unanswered.evidence]), nextAction: 'Describe the next step in your own words and flag any questions.',
    question: unanswered.question, questionTo: 'clinician',
  }
  if (j.services.length && !matchProviders(state).some((p) => p.id === state.selectedProviderId)) return {
    id: 'provider-preference', title: 'The provider handoff needs a preference', owner: 'patient',
    reason: j.synthetic ? 'No provider preference is saved for the requested specialty.' : 'No verified provider directory is connected to this note.',
    evidence: sourceEvidence(state, j.services.map((s) => s.evidence)),
    nextAction: j.synthetic ? 'Compare the fictional providers and share a preference for staff to verify.' : 'Ask for providers matching the service, exact plan, travel limit, and language.',
    question: 'Which provider options fit the requested service, my exact plan, travel limit, and language needs?', questionTo: 'hospital',
  }
  const benefits = state.tasks.find((t) => t.id.startsWith('benefits-') && t.status !== 'done')
  if (benefits) return {
    id: 'benefits-review', title: 'Benefits need a sourced review', owner: 'hospital',
    reason: 'Benefits remain unchecked; authorization alone does not establish eligibility, network, cost, or payment.',
    evidence: sourceEvidence(state, [benefits.evidence, ...j.services.map((s) => s.evidence)]),
    nextAction: 'Check the exact-plan benefits, provider network, and estimate against their sources.',
    question: 'Can you verify the exact-plan benefits and provider network for this service, and explain the estimate and any authorization requirement?', questionTo: 'hospital',
  }
  const patientTask = state.tasks.find((t) => t.owner === 'patient' && t.status !== 'done')
  if (patientTask) return {
    id: 'patient-next-step', title: 'A documented next step is still open', owner: 'patient',
    reason: `“${patientTask.title}” is recorded as ${patientTask.status.replace('_', ' ')}.`,
    evidence: sourceEvidence(state, [patientTask.evidence]), nextAction: 'Review the documented step and tell the care team what help you need.',
    question: 'Can you help me confirm the timing and practical arrangements for the documented next step?', questionTo: 'hospital',
  }
  const coordination = state.tasks.find((t) => t.owner === 'hospital' && t.status !== 'done')
  if (coordination) return {
    id: 'coordination', title: 'The coordination loop is still open', owner: 'hospital',
    reason: `“${coordination.title}” is recorded as ${coordination.status.replace('_', ' ')}.`,
    evidence: sourceEvidence(state, [coordination.evidence]), nextAction: 'Confirm the next handoff and record the source of any scheduling update.',
    question: 'What remains before this appointment can be arranged, and who will send me the next update?', questionTo: 'hospital',
  }
  return {
    id: 'no-open-handoff', title: 'No tracked handoff remains open', owner: 'hospital',
    reason: 'Completing local tasks does not establish that care was delivered or insurance paid.',
    evidence: relevant, nextAction: 'Check with the care team for any updates still to record.',
    question: 'Is there any external update or follow-up that still needs to be reflected in this journey?', questionTo: 'hospital',
  }
}

function employerConsequence(state: JourneyState): { before: string; after: string } {
  const a = aggregateEmployerJourney(state)
  if (!a.visible) return { before: 'Aggregate view suppressed for a custom note.', after: 'No employer data or fictional cohort is created.' }
  return {
    before: `${a.sourceLabel}: ${a.clinicalReviewsRecorded} reviews, ${a.understandingResponsesRecorded} understanding responses, ${a.providerPreferencesRecorded} provider preferences; ${a.openBenefitsTasks} benefits tasks and ${a.openCoordinationTasks} coordination tasks open.`,
    after: 'Aggregate counts stay unchanged until a workflow action is recorded.',
  }
}

function baselineRoles(state: JourneyState, b: RehearsalBottleneck): CareRehearsalResult['roles'] {
  const responses = state.journey.teachBack.filter((q) => answered(state, q.id)).length
  const openTasks = state.tasks.filter((t) => t.owner === 'hospital' && t.status !== 'done').length
  return {
    patient: {
      before: `${responses} of ${state.journey.teachBack.length} understanding prompts answered; provider preference ${state.selectedProviderId ? 'saved' : 'not saved'}.`,
      after: b.owner === 'patient' ? b.nextAction : 'The responsible team could clarify the next practical step.',
    },
    clinician: {
      before: state.clinicalReviewConfirmed ? 'Clinical review is recorded; understanding responses still need human review.' : 'Clinical review is not recorded.',
      after: b.id === 'clinical-review' ? 'The clinician could record the review after checking the source and plan.' : 'The team could review the question against the source note.',
    },
    hospital: {
      before: `${openTasks} coordination tasks remain open; coverage and availability are unverified.`,
      after: b.owner === 'hospital' ? b.nextAction : 'The coordinator could follow up with the next owner.',
    },
    employer: employerConsequence(state),
  }
}

export function evaluateCareRehearsal(state: JourneyState, scenario: RehearsalScenario): CareRehearsalResult {
  const option = REHEARSAL_OPTIONS.find((o) => o.id === scenario) ?? REHEARSAL_OPTIONS[0]
  const baseline = baselineBottleneck(state)
  const result: CareRehearsalResult = {
    scenario: option.id, title: option.title, hypothetical: true,
    sourceLabel: state.journey.synthetic ? 'Fictional journey · hypothetical rehearsal' : 'Local source note · hypothetical rehearsal',
    disclaimer: 'Hypothetical only. No journey state or care instructions change, and no external action occurs. Coverage, availability, outcomes, and savings are not verified or predicted.',
    bottleneck: baseline, roles: baselineRoles(state, baseline), comparison: null,
    assumptions: ['The biggest open handoff follows a fixed workflow priority, not clinical risk triage.', 'Before describes recorded local state; after describes a possible workflow response, not an outcome forecast.', 'Quoted evidence must exactly match the source note. Workflow gaps come from the shared journey state.'],
  }

  if (option.id === 'unclear_plan') {
    const prompt = state.journey.teachBack.find((q) => !answered(state, q.id)) ?? state.journey.teachBack[0]
    const missing = !!prompt && !answered(state, prompt.id)
    const quotedPlan = prompt && evidenceIsValid(state.journey, prompt.evidence) ? prompt.evidence.text : null
    result.bottleneck = {
      id: 'clarify-plan', title: missing ? 'Turn the unanswered prompt into a care-team question' : 'Ask the team to clarify the plan', owner: 'clinician',
      reason: missing ? 'The understanding prompt has no response yet.' : prompt ? 'A response is saved, but the care team has not assessed its correctness.' : 'No understanding prompt was extracted from the note.',
      evidence: sourceEvidence(state, prompt ? [prompt.evidence] : state.journey.nextSteps.map((s) => s.evidence)),
      nextAction: 'Explain the documented step, then ask the patient to describe it back.',
      question: quotedPlan ? `Could you help me understand this part of the plan: “${quotedPlan}”? What is the next step and when is it needed?` : 'Could you explain the next step and its timing from my source note? I am unsure what to do next.',
      questionTo: 'clinician',
    }
    result.roles.patient = { before: missing ? 'An understanding response is missing.' : 'A saved response does not certify understanding.', after: 'The patient could hear an explanation and describe the plan in their own words.' }
    result.roles.clinician = { before: 'The prototype has not assessed understanding.', after: 'The clinician could explain the documented plan and assess the response.' }
    result.roles.hospital = { before: 'Practical arrangements may still need clarification.', after: 'A clarified plan could help the coordinator confirm the next handoff.' }
    return result
  }

  if (option.id !== 'budget_pressure' && option.id !== 'access_delay') return result
  const knownScenario = state.journey.synthetic && INSURANCE_SCENARIOS.some((s) => s.id === state.journey.id)
  if (!knownScenario) {
    result.bottleneck = {
      id: 'comparison-source-gap', title: 'A sourced catalog is needed for this comparison', owner: 'hospital',
      reason: 'This note has no linked benefit or provider catalog.',
      evidence: sourceEvidence(state, state.journey.services.map((s) => s.evidence)),
      nextAction: 'Obtain verified benefit and provider sources for the exact plan and service.',
      question: 'Can you obtain the benefit and provider sources needed to compare the options for this plan and service?', questionTo: 'hospital',
    }
    result.roles = baselineRoles(state, result.bottleneck)
    return result
  }

  const beforeBudget = finiteBudget(state)
  const input: InsuranceInput = { scenarioId: state.journey.id, ...state.preferences, selectedPlanId: state.selectedPlanId }
  const before = runInsuranceDemo(input)
  const selectedPlan = before.plans.find((p) => p.id === state.selectedPlanId) ?? null
  result.assumptions.push('All plan prices, benefits, providers, and network links are fictional. Learned ordering reproduces an authored synthetic preference policy, not real insurance suitability.', 'A monthly premium budget is distinct from total annual care spending. Visit count is a scenario assumption, not prescribed care.')
  if (before.input.expectedVisits !== state.preferences.expectedVisits) result.assumptions.push(`The insurance demo supports 0–36 whole visits. This comparison uses ${before.input.expectedVisits} visits; the shared journey's visit assumption is not changed.`)

  if (option.id === 'budget_pressure') {
    const afterBudget = Math.max(0, Math.round(beforeBudget / 2))
    const after = runInsuranceDemo({ ...input, monthlyBudget: afterBudget })
    const options = after.plans.map((p) => ({ id: p.id, name: p.name, monthlyPremium: p.monthlyPremium, totalAnnualCost: p.totalAnnualCost, beforeBudgetFit: p.monthlyPremium <= beforeBudget, afterBudgetFit: p.monthlyPremium <= afterBudget }))
    const hasBudgetMatch = options.some((p) => p.afterBudgetFit)
    const summary = hasBudgetMatch
      ? `Fictional plans within the ${money(afterBudget)}/month premium limit: ${options.filter((p) => p.afterBudgetFit).length}; annual cost assumptions stay unchanged.`
      : `No fictional plan fits the ${money(afterBudget)}/month premium limit.`
    result.comparison = { plans: { beforeMonthlyBudget: beforeBudget, afterMonthlyBudget: afterBudget, currentPlanId: selectedPlan?.id ?? null, currentPlanName: selectedPlan?.name ?? null, selectedPlanUnchanged: true, hasBudgetMatch, options, summary }, providers: null }
    result.bottleneck = {
      id: hasBudgetMatch ? 'budget-tradeoff' : 'budget-gap', title: hasBudgetMatch ? 'A tighter budget changes the tradeoffs' : 'No sample plan fits this budget', owner: 'hospital',
      reason: `Comparing ${money(beforeBudget)} with ${money(afterBudget)}/month ${hasBudgetMatch ? 'leaves sample plans within the new premium budget' : 'shows no fictional plan within the new premium budget'}.`,
      evidence: sourceEvidence(state, state.journey.services.map((s) => s.evidence)),
      nextAction: hasBudgetMatch ? 'Review total annual costs with a benefits navigator before choosing a plan.' : 'Ask a benefits navigator about real options that could address this budget gap.',
      question: `With a hypothetical ${money(afterBudget)}/month premium budget, what real options and total spending should I review for the documented service?`, questionTo: 'hospital',
    }
    result.roles.patient = { before: `${money(beforeBudget)}/month premium budget; ${selectedPlan ? `${selectedPlan.name} selected` : 'no plan preference saved'}.`, after: summary }
    result.roles.clinician = { before: 'The documented care plan and scenario visit count are unchanged.', after: 'The financial question can be discussed without reducing visits or changing treatment.' }
    result.roles.hospital = { before: 'Eligibility, network, benefits, and costs need source verification.', after: hasBudgetMatch ? 'A navigator could compare the tradeoffs, while eligibility and payment remain unverified.' : 'The navigator has an affordability gap to investigate.' }
    result.assumptions.push('The hypothetical premium budget is half the entered monthly budget, rounded to whole dollars with a minimum of $0.')
    return result
  }

  const specialtyProviders = matchProviders(state)
  const current = specialtyProviders.find((p) => p.id === state.selectedProviderId) ?? specialtyProviders[0] ?? null
  const language = state.preferences.preferredLanguage.trim().toLowerCase()
  const alternative = selectedPlan && current ? specialtyProviders.find((p) => p.id !== current.id
    && p.specialty === current.specialty
    && p.samplePlanIds.includes(selectedPlan.id)
    && p.distanceMiles <= state.preferences.maxTravelMiles
    && p.languages.some((l) => l.toLowerCase() === language)) ?? null : null
  const gap = !current ? 'No fictional provider matches a documented specialty.'
    : !selectedPlan ? 'Select an exact fictional plan before comparing network-matched alternatives.'
    : !alternative ? 'No alternative fictional provider matches the specialty, selected plan, language, and travel limit together.' : null
  const summary = alternative
    ? `If ${current!.name} were unavailable, ${alternative.name} fits the same specialty, sample plan, language, and travel limit; real availability is unknown.`
    : `${current ? `If ${current.name} were unavailable: ` : ''}${gap}`
  result.comparison = {
    plans: null,
    providers: { currentProviderId: current?.id ?? null, currentProviderName: current?.name ?? null, unavailableProviderId: current?.id ?? null,
      alternative: alternative ? { id: alternative.id, name: alternative.name, specialty: alternative.specialty, distanceMiles: alternative.distanceMiles, languages: [...alternative.languages] } : null,
      selectedProviderUnchanged: true, gap, summary },
  }
  result.bottleneck = {
    id: alternative ? 'provider-alternative' : 'provider-access-gap', title: alternative ? 'Keep the referral moving with an alternative' : 'The provider handoff has an access gap', owner: 'hospital',
    reason: summary, evidence: sourceEvidence(state, state.journey.services.map((s) => s.evidence)),
    nextAction: alternative ? `Verify ${alternative.name} against the real plan, service, and availability before offering a change.` : 'Ask for a sourced alternative that meets the specialty, plan, language, and travel requirements.',
    question: alternative ? `If the current provider were unavailable, could you verify whether ${alternative.name} is an appropriate option for this service and my exact plan?` : 'If the proposed provider were unavailable, which sourced alternatives meet the service, exact plan, language, and travel requirements?',
    questionTo: 'hospital',
  }
  result.roles.patient = { before: current ? `${current.name} is ${current.id === state.selectedProviderId ? 'the saved fictional preference' : 'a proposed fictional option, not a saved preference'}.` : 'No matching fictional provider is listed.', after: alternative ? `${alternative.name} could be checked as an alternative, without changing the saved preference.` : gap! }
  result.roles.clinician = { before: 'The requested service comes from the source note.', after: 'The access question leaves the requested specialty and treatment unchanged.' }
  result.roles.hospital = { before: 'Real provider availability has not been checked.', after: alternative ? 'Staff could verify the alternative’s network participation and availability.' : 'The coordinator still needs a compatible alternative.' }
  return result
}
