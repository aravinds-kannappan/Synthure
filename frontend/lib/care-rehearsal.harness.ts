import { evaluateCareRehearsal, REHEARSAL_OPTIONS } from './care-rehearsal'
import { createJourneyState, DEMO_JOURNEYS, evidenceIsValid, journeyReducer, parseLocalNote, SAMPLE_PROVIDERS, type JourneyState } from './journey'
import { INSURANCE_SCENARIOS, runInsuranceDemo } from './insurance-demo'

/** Executable behavioral regressions. No network, timer, or external test runner. */
export function runCareRehearsalHarness() {
  const failures: string[] = []
  let checks = 0
  const check = (label: string, ok: boolean) => { checks++; if (!ok) failures.push(label) }
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
  const freeze = <T>(value: T): T => {
    if (value && typeof value === 'object') {
      Object.freeze(value)
      Object.values(value).forEach(freeze)
    }
    return value
  }
  const select = (state: JourneyState, planId = 'sample-balanced', providerId = 'example-provider-0-a') => journeyReducer(journeyReducer(state, { type: 'selectPlan', planId }), { type: 'selectProvider', providerId })

  for (const journey of DEMO_JOURNEYS) {
    const state = createJourneyState(journey)
    const before = JSON.stringify(state)
    freeze(state)
    for (const option of REHEARSAL_OPTIONS) {
      const result = evaluateCareRehearsal(state, option.id)
      check(`${journey.id}/${option.id}: exact evidence only`, result.bottleneck.evidence.length > 0 && result.bottleneck.evidence.every((e) => evidenceIsValid(journey, e)))
      check(`${journey.id}/${option.id}: explicit hypothetical boundary`, result.hypothetical && result.disclaimer.includes('No journey state') && result.sourceLabel.includes('hypothetical'))
      const employer = JSON.stringify(result.roles.employer)
      check(`${journey.id}/${option.id}: employer has no individual clinical content`, !employer.includes(journey.conditions[0].label) && !employer.includes(journey.medications[0].name) && !employer.includes(journey.note) && !employer.includes(journey.id) && employer.includes('25 fictional journeys'))
    }
    check(`${journey.id}: all rehearsals are pure on a deeply frozen state`, JSON.stringify(state) === before)
    const budget = evaluateCareRehearsal(state, 'budget_pressure').comparison!.plans!
    const insurance = runInsuranceDemo({ scenarioId: journey.id, ...state.preferences, selectedPlanId: null })
    check(`${journey.id}: budget-only changes do not invent savings or change care costs`, budget.options.every((p) => p.totalAnnualCost === insurance.plans.find((q) => q.id === p.id)?.totalAnnualCost))
    check(`${journey.id}: no implicit plan choice`, budget.currentPlanId === null && budget.currentPlanName === null && state.selectedPlanId === null)
  }

  let state = createJourneyState(copy(DEMO_JOURNEYS[0]))
  check('baseline starts with clinical review', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'clinical-review')
  state = journeyReducer(state, { type: 'confirmClinicalReview', actor: 'clinician' })
  check('baseline next waits for an understanding response', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'understanding-response')
  state = journeyReducer(state, { type: 'answerTeachBack', questionId: state.journey.teachBack[0].id, answer: '  ' })
  check('whitespace is not an understanding response', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'understanding-response')
  state = journeyReducer(state, { type: 'answerTeachBack', questionId: state.journey.teachBack[0].id, answer: 'I am unsure about the timing.' })
  check('a recorded answer moves to provider preference without certifying comprehension', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'provider-preference')
  state = select(state)
  check('a saved compatible provider exposes the benefits handoff', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'benefits-review')
  state = journeyReducer(state, { type: 'recordAuthorization', serviceId: state.journey.services[0].id, status: 'approved', reference: 'Synthetic staff reference', actor: 'hospital' })
  const authorized = evaluateCareRehearsal(state, 'baseline')
  check('recorded authorization does not complete benefits or claim coverage', authorized.bottleneck.id === 'benefits-review' && authorized.bottleneck.reason.includes('does not establish eligibility') && authorized.roles.hospital.before.includes('unverified'))
  for (const task of state.tasks.filter((t) => t.id.startsWith('benefits-'))) state = journeyReducer(state, { type: 'setTaskStatus', taskId: task.id, status: 'done', actor: 'hospital' })
  check('patient next step follows benefits review', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'patient-next-step')
  for (const task of state.tasks.filter((t) => t.owner === 'patient')) state = journeyReducer(state, { type: 'setTaskStatus', taskId: task.id, status: 'done', actor: 'patient' })
  check('coordination remains after patient tasks', evaluateCareRehearsal(state, 'baseline').bottleneck.id === 'coordination')
  for (const task of state.tasks.filter((t) => t.owner === 'hospital')) state = journeyReducer(state, { type: 'setTaskStatus', taskId: task.id, status: 'done', actor: 'hospital' })
  const complete = evaluateCareRehearsal(state, 'baseline')
  check('complete local workflow does not assert delivered care', complete.bottleneck.id === 'no-open-handoff' && complete.bottleneck.reason.includes('does not establish that care was delivered'))

  const affordableBefore = journeyReducer(select(createJourneyState(copy(DEMO_JOURNEYS[0]))), { type: 'setPreferences', preferences: { monthlyBudget: 100 } })
  const noAffordable = evaluateCareRehearsal(affordableBefore, 'budget_pressure')
  const budget = noAffordable.comparison!.plans!
  check('budget pressure can eliminate every affordable sample option', budget.beforeMonthlyBudget === 100 && budget.afterMonthlyBudget === 50 && !budget.hasBudgetMatch && budget.options.every((p) => !p.afterBudgetFit) && noAffordable.bottleneck.id === 'budget-gap')
  check('budget gap never replaces the selected plan with first-ranked choice', budget.currentPlanId === 'sample-balanced' && budget.selectedPlanUnchanged && affordableBefore.selectedPlanId === 'sample-balanced')
  const lower = evaluateCareRehearsal(journeyReducer(affordableBefore, { type: 'setPreferences', preferences: { monthlyBudget: 50 } }), 'budget_pressure')
  check('a low budget is still reduced instead of raised to a floor', lower.comparison!.plans!.beforeMonthlyBudget === 50 && lower.comparison!.plans!.afterMonthlyBudget === 25 && !lower.comparison!.plans!.hasBudgetMatch)

  for (let i = 0; i < DEMO_JOURNEYS.length; i++) {
    const original = select(createJourneyState(copy(DEMO_JOURNEYS[i])), 'sample-balanced', `example-provider-${i}-a`)
    const access = evaluateCareRehearsal(original, 'access_delay').comparison!.providers!
    const alternative = SAMPLE_PROVIDERS.find((p) => p.id === access.alternative?.id)
    check(`${DEMO_JOURNEYS[i].id}: unavailable preference has a compatible different alternative`, access.unavailableProviderId === original.selectedProviderId && !!alternative && alternative.id !== original.selectedProviderId && alternative.specialty === original.journey.services[0].specialty && alternative.samplePlanIds.includes(original.selectedPlanId!) && alternative.distanceMiles <= original.preferences.maxTravelMiles && alternative.languages.includes(original.preferences.preferredLanguage))
    check(`${DEMO_JOURNEYS[i].id}: access rehearsal does not reschedule or change preference`, access.selectedProviderUnchanged && original.selectedProviderId === `example-provider-${i}-a` && access.summary.includes('real availability is unknown'))
  }
  const selected = select(createJourneyState(copy(DEMO_JOURNEYS[0])))
  const spanish = journeyReducer(selected, { type: 'setPreferences', preferences: { preferredLanguage: 'Spanish' } })
  const spanishGap = evaluateCareRehearsal(spanish, 'access_delay').comparison!.providers!
  check('no alternative when only the unavailable provider speaks the requested language', spanishGap.alternative === null && !!spanishGap.gap)
  const travel = journeyReducer(selected, { type: 'setPreferences', preferences: { maxTravelMiles: 5 } })
  check('travel preference is a hard alternative constraint', evaluateCareRehearsal(travel, 'access_delay').comparison!.providers!.alternative === null)
  const network = journeyReducer(selected, { type: 'selectPlan', planId: 'sample-predictable' })
  check('exact fictional plan is a hard alternative constraint', evaluateCareRehearsal(network, 'access_delay').comparison!.providers!.alternative === null)
  const unset = journeyReducer(selected, { type: 'selectPlan', planId: null })
  const unsetResult = evaluateCareRehearsal(unset, 'access_delay').comparison!.providers!
  check('an unselected plan never borrows the ranking winner network', unsetResult.alternative === null && unsetResult.gap!.includes('Select an exact fictional plan'))
  const unsupportedLanguage = journeyReducer(selected, { type: 'setPreferences', preferences: { preferredLanguage: 'Tamil' } })
  check('unsupported language is not silently normalized to English for access', evaluateCareRehearsal(unsupportedLanguage, 'access_delay').comparison!.providers!.alternative === null)

  const unclear = evaluateCareRehearsal(selected, 'unclear_plan')
  check('unclear-plan question quotes the documented plan exactly', unclear.bottleneck.question.includes(selected.journey.teachBack[0].evidence.text) && unclear.bottleneck.questionTo === 'clinician')
  check('unclear-plan rehearsal does not change medication directions', selected.journey.medications[0].instructions === DEMO_JOURNEYS[0].medications[0].instructions && unclear.roles.clinician.after.includes('documented plan'))
  const tampered = copy(selected)
  tampered.journey.teachBack[0].expectedAnswer = 'Invented treatment direction'
  tampered.journey.teachBack[0].evidence = { start: 0, end: 7, text: 'Invalid quotation', source: 'untrusted' }
  const guarded = evaluateCareRehearsal(tampered, 'unclear_plan')
  check('invalid evidence and divergent expected answers are not presented as source quotations', guarded.bottleneck.evidence.length === 0 && !guarded.bottleneck.question.includes('Invented treatment') && !guarded.bottleneck.question.includes('Invalid quotation'))

  const custom = createJourneyState(parseLocalNote('Assessment: Private diagnosis.\nPlan: Bring a private list to the clinic.\nRequested service: Private service.'))
  for (const option of REHEARSAL_OPTIONS) {
    const result = evaluateCareRehearsal(custom, option.id)
    check(`custom/${option.id}: employer stays suppressed`, result.roles.employer.before.includes('suppressed') && !JSON.stringify(result.roles.employer).includes('Private'))
    check(`custom/${option.id}: no invented catalog`, result.comparison === null)
  }
  const unknown = copy(selected)
  unknown.journey.id = 'unknown-synthetic-record'
  check('unknown synthetic ID cannot fall through to the knee catalog', evaluateCareRehearsal(unknown, 'budget_pressure').comparison === null)
  check('scenario definitions still cover all demo fixture IDs', DEMO_JOURNEYS.every((j) => INSURANCE_SCENARIOS.some((s) => s.id === j.id)))
  const result = { checks, failures }
  console.log(JSON.stringify(result, null, 2))
  return result
}
