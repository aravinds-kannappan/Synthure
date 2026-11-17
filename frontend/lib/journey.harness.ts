import { DEMO_JOURNEYS, aggregateEmployerJourney, createJourneyState, deriveJourney, evidenceIsValid, journeyReducer, matchProviders, parseLocalNote, rankPlans } from './journey'

/** Behavioral checks for high-consequence distinctions: documented directions,
 * independent authorization/coverage, local-only actions, and scenario pricing. */
export function runJourneyHarness() {
  const failures: string[] = []
  let checks = 0
  const check = (label: string, ok: boolean) => { checks++; if (!ok) failures.push(label) }
  for (const j of DEMO_JOURNEYS) {
    const facts = [...j.conditions, ...j.medications, ...j.nextSteps, ...j.services, ...j.teachBack]
    check(`${j.id}: every displayed clinical fact links to an exact source span`, facts.every((f) => evidenceIsValid(j, f.evidence)))
    check(`${j.id}: medication instructions are copied verbatim`, j.medications.every((m) => m.instructions === m.evidence.text))
  }
  const knee = createJourneyState(DEMO_JOURNEYS[0])
  check('as-needed medication is not transformed into a daily instruction', knee.journey.medications[0].instructions.includes('as needed') && !knee.journey.medications[0].instructions.includes('every day'))
  const local = parseLocalNote('Assessment: No evidence of pneumonia.\nMedication instructions: Stop metformin until the clinician reviews the result.\nPlan: Call the clinic tomorrow.\nRequested service: Clinic review.')
  check('negation is preserved rather than turned into a confirmed diagnosis', local.conditions[0].label === 'No evidence of pneumonia.' && local.conditions[0].status === 'needs_review')
  check('stopped medication is not active', local.medications[0].status === 'stopped')
  check('custom medication instruction is unchanged', local.medications[0].instructions === 'Stop metformin until the clinician reviews the result.')
  check('custom evidence offsets are valid', [...local.conditions, ...local.medications, ...local.nextSteps, ...local.services].every((f) => evidenceIsValid(local, f.evidence)))
  const custom = createJourneyState(local)
  check('fictional insurance plans are not recommended for a custom note', rankPlans(custom).length === 0)
  check('fictional providers are not recommended for a custom note', matchProviders(custom).length === 0)
  const unstructured = parseLocalNote('The patient came in with a complex history and discussed medication.')
  check('unknown narrative does not produce invented diagnoses or medicine directions', unstructured.conditions.length === 0 && unstructured.medications.length === 0 && unstructured.services.length === 0)

  const serviceId = knee.journey.services[0].id
  check('an approval requires a source reference', journeyReducer(knee, { type: 'recordAuthorization', serviceId, status: 'approved', actor: 'hospital' }) === knee)
  check('the patient cannot record payer authorization', journeyReducer(knee, { type: 'recordAuthorization', serviceId, status: 'approved', reference: 'test', actor: 'patient' }) === knee)
  const twice = createJourneyState({ ...knee.journey, services: [...knee.journey.services, { ...knee.journey.services[0], id: 'second-service' }] })
  const approved = journeyReducer(twice, { type: 'recordAuthorization', serviceId, status: 'approved', reference: 'SYNTHETIC decision A1', actor: 'hospital' })
  check('authorization applies only to the referenced service', approved.authorizations[serviceId].status === 'approved' && approved.authorizations['second-service'].status === 'unknown')
  check('authorization does not imply coverage', deriveJourney(approved).coverageStatus === 'Unverified')
  check('authorization does not complete a benefits verification task', approved.tasks.find((t) => t.id === `benefits-${serviceId}`)?.status === 'open')
  check('authorization does not change the hypothetical plan arithmetic', rankPlans(approved)[0].totalAnnualCost === rankPlans(twice)[0].totalAnnualCost)
  check('employer cannot complete clinical review', journeyReducer(knee, { type: 'setTaskStatus', taskId: 'clinical-review', status: 'done', actor: 'employer' }) === knee)
  check('patient messages cannot be routed to an employer', journeyReducer(knee, { type: 'sendMessage', from: 'patient', to: 'employer', body: 'Private condition' }) === knee)
  check('custom notes are excluded from sample employer reporting', !aggregateEmployerJourney(custom).visible && aggregateEmployerJourney(custom).cohortSize === 0)
  const employer = aggregateEmployerJourney(knee)
  check('synthetic employer view counts an explicitly labelled 25-record cohort', employer.visible && employer.synthetic && employer.cohortSize === 25 && employer.sourceLabel.includes('fictional'))
  check('aggregate payload excludes individual source text, diagnoses, identity and messages', !['note', 'conditions', 'medications', 'events', 'tasks', 'patient', 'journey', 'id'].some((key) => key in employer) && !JSON.stringify(employer).includes(knee.journey.conditions[0].label))
  const reviewed = journeyReducer(knee, { type: 'confirmClinicalReview', actor: 'clinician' })
  check('clinical review updates one aggregate count', aggregateEmployerJourney(reviewed).clinicalReviewsRecorded === employer.clinicalReviewsRecorded + 1)
  const benefitsDone = journeyReducer(knee, { type: 'setTaskStatus', taskId: `benefits-${serviceId}`, status: 'done', actor: 'hospital' })
  check('closing a benefits task changes the aggregate workload', aggregateEmployerJourney(benefitsDone).openBenefitsTasks === employer.openBenefitsTasks - 1 && aggregateEmployerJourney(benefitsDone).openCoordinationTasks === employer.openCoordinationTasks)

  const selected = journeyReducer(knee, { type: 'selectProvider', providerId: matchProviders(knee)[0].id })
  check('selecting a provider does not book a visit', deriveJourney(selected).bookingStatus === 'No appointment booked')
  check('selecting a provider does not finish coordination', selected.tasks.find((t) => t.id === `referral-${serviceId}`)?.status === 'open')
  check('provider preference changes aggregate without claiming booking', aggregateEmployerJourney(selected).providerPreferencesRecorded === employer.providerPreferencesRecorded + 1 && aggregateEmployerJourney(selected).openCoordinationTasks === employer.openCoordinationTasks)
  const q = knee.journey.teachBack[0]
  const answered = journeyReducer(knee, { type: 'answerTeachBack', questionId: q.id, answer: 'I have a question about the timing.' })
  check('an understanding response remains available for human review', answered.teachBackAnswers[q.id] === 'I have a question about the timing.' && !answered.clinicalReviewConfirmed)
  check('saving a patient response updates the aggregate response count', aggregateEmployerJourney(answered).understandingResponsesRecorded === employer.understandingResponsesRecorded + 1)
  const noVisits = journeyReducer(knee, { type: 'setPreferences', preferences: { expectedVisits: 0 } })
  check('zero visits still incur premiums', rankPlans(noVisits).every((p) => p.estimatedCareCost === 0 && p.totalAnnualCost === p.annualPremium))
  const manyVisits = journeyReducer(knee, { type: 'setPreferences', preferences: { expectedVisits: 100 } })
  check('illustrative covered care is capped but premiums are outside the cap', rankPlans(manyVisits).every((p) => p.estimatedCareCost <= p.oopMax && p.totalAnnualCost === p.annualPremium + p.estimatedCareCost && p.worstCaseAnnualCost === p.annualPremium + p.oopMax))
  check('more visits do not decrease sample care costs', rankPlans(manyVisits).every((p) => p.estimatedCareCost >= (rankPlans(knee).find((base) => base.id === p.id)?.estimatedCareCost ?? Infinity)))
  const invalid = journeyReducer(knee, { type: 'setPreferences', preferences: { expectedVisits: NaN, monthlyBudget: -10, maxTravelMiles: Infinity } })
  check('invalid numbers cannot create NaN prices', rankPlans(invalid).every((p) => Number.isFinite(p.totalAnnualCost)) && invalid.preferences.monthlyBudget === 0)
  const reset = journeyReducer(approved, { type: 'reset', journey: DEMO_JOURNEYS[1] })
  check('a new note cannot inherit the prior patient’s approvals or answers', Object.values(reset.authorizations).every((a) => a.status === 'unknown') && Object.keys(reset.teachBackAnswers).length === 0 && reset.selectedPlanId === null)
  const result = { checks, failures }
  console.log(JSON.stringify(result, null, 2))
  return result
}
