/** Local-only care journey prototype. No API calls, clinical inference, or real
 * insurance eligibility decisions happen in this module. Sample plans/providers
 * are deliberately fictional and never mixed into an imported patient record. */
export type Role = 'patient' | 'clinician' | 'hospital' | 'employer'
export type TaskStatus = 'open' | 'in_progress' | 'done'
export type AuthorizationStatus = 'unknown' | 'not_required' | 'pending' | 'approved' | 'denied'
export interface Evidence { start: number; end: number; text: string; source: string }
export interface Condition { id: string; label: string; explanation: string; status: 'documented' | 'needs_review'; evidence: Evidence }
export interface Medication { id: string; name: string; instructions: string; status: 'documented' | 'stopped' | 'needs_review'; evidence: Evidence }
export interface NextStep { id: string; title: string; detail: string; due: string; owner: 'patient' | 'clinician' | 'hospital'; evidence: Evidence }
export interface Service { id: string; label: string; specialty: string; authorizationRequired: 'unknown' | 'yes' | 'no'; evidence: Evidence }
export interface TeachBackQuestion { id: string; question: string; expectedAnswer: string; evidence: Evidence }
export interface Journey {
  id: string; title: string; note: string; sourceLabel: string; synthetic: boolean;
  conditions: Condition[]; medications: Medication[]; nextSteps: NextStep[]; services: Service[];
  teachBack: TeachBackQuestion[]; limitations: string[];
  context: { location: string; language: string; coverage: string; referralReason: string; careGoal: string };
}
export interface Preferences {
  priority: 'balanced' | 'lowest_premium' | 'predictable_cost';
  maxTravelMiles: number; preferredLanguage: string; monthlyBudget: number; expectedVisits: number;
}
export interface JourneyTask { id: string; title: string; detail: string; owner: Role; due: string; status: TaskStatus; serviceId?: string; evidence?: Evidence }
export interface Authorization { serviceId: string; status: AuthorizationStatus; reference: string; recordedBy: Role | null; updatedAt: number | null }
export interface TimelineEvent { id: string; title: string; detail: string; actor: Role | 'system'; to: Role[]; createdAt: number; kind: 'state' | 'message'; serviceId?: string }
export interface JourneyState {
  journey: Journey; tasks: JourneyTask[]; authorizations: Record<string, Authorization>;
  events: TimelineEvent[]; preferences: Preferences; selectedPlanId: string | null; selectedProviderId: string | null;
  teachBackAnswers: Record<string, string>; clinicalReviewConfirmed: boolean; version: number;
}
export type JourneyAction =
  | { type: 'selectPlan'; planId: string | null }
  | { type: 'selectProvider'; providerId: string | null }
  | { type: 'setPreferences'; preferences: Partial<Preferences> }
  | { type: 'setTaskStatus'; taskId: string; status: TaskStatus; actor: Role }
  | { type: 'recordAuthorization'; serviceId: string; status: AuthorizationStatus; reference?: string; actor: Role }
  | { type: 'answerTeachBack'; questionId: string; answer: string }
  | { type: 'confirmClinicalReview'; actor: 'clinician' }
  | { type: 'sendMessage'; from: Role; to: Role; body: string }
  | { type: 'reset'; journey: Journey }

export interface SamplePlan {
  id: string; name: string; type: string; monthlyPremium: number; deductible: number; oopMax: number;
  coinsurance: number; visitAllowed: number; visitCopay: number | null; sourceLabel: string; fictional: true;
}
export interface PlanMatch extends SamplePlan {
  rank: number; score: number; annualPremium: number; estimatedCareCost: number; totalAnnualCost: number;
  worstCaseAnnualCost: number; reasons: string[]; gaps: string[]; eligible: 'unknown';
  calculation: string; assumptions: string[];
}
export interface SampleProvider {
  id: string; name: string; specialty: string; facility: string; distanceMiles: number; languages: string[];
  nextAvailable: string; samplePlanIds: string[]; sourceLabel: string; fictional: true;
}
export interface ProviderMatch extends SampleProvider { rank: number; score: number; reasons: string[]; gaps: string[]; networkStatus: 'sample_match' | 'unknown' }

const SAMPLE_SOURCE = 'Synthetic clinician note · demonstration only'
const finite = (n: number, fallback: number, min = 0, max = 1_000_000) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(36) }
function evidence(note: string, text: string, source: string, from = 0): Evidence {
  const start = note.indexOf(text, from)
  if (start < 0 || !text) throw new Error('Evidence must be an exact nonempty source span')
  return { start, end: start + text.length, text, source }
}
export function evidenceIsValid(journey: Journey, span: Evidence): boolean {
  return span.start >= 0 && span.end > span.start && journey.note.slice(span.start, span.end) === span.text
}

interface FixtureSpec {
  id: string; title: string; note: string; condition: string; explanation: string;
  medication: string; medicationName: string; followUp: string; due: string; service: string;
  specialty: string; goal: string; question: string;
}
function fixture(s: FixtureSpec): Journey {
  const ev = (text: string) => evidence(s.note, text, SAMPLE_SOURCE)
  return {
    id: s.id, title: s.title, note: s.note, sourceLabel: SAMPLE_SOURCE, synthetic: true,
    conditions: [{ id: `${s.id}-condition`, label: s.condition, explanation: s.explanation, status: 'documented', evidence: ev(s.condition) }],
    medications: [{ id: `${s.id}-medication`, name: s.medicationName, instructions: s.medication, status: 'documented', evidence: ev(s.medication) }],
    nextSteps: [{ id: `${s.id}-followup`, title: 'Follow the documented plan', detail: s.followUp, due: s.due, owner: 'patient', evidence: ev(s.followUp) }],
    services: [{ id: `${s.id}-service`, label: s.service, specialty: s.specialty, authorizationRequired: 'unknown', evidence: ev(s.service) }],
    teachBack: [{ id: `${s.id}-teachback`, question: s.question, expectedAnswer: s.followUp, evidence: ev(s.followUp) }],
    context: { location: 'Example County', language: 'English', coverage: 'Exact plan and eligibility not verified', referralReason: s.service, careGoal: s.goal },
    limitations: [
      'This is a fictional patient, note, plan catalog, and provider directory.',
      'Medication instructions are copied from this synthetic note; they are not advice for a real person.',
      'Network, eligibility, authorization and appointment availability require real source verification.',
    ],
  }
}

export const DEMO_JOURNEYS: Journey[] = [
  fixture({
    id: 'knee-osteoarthritis', title: 'A clearer path for knee pain',
    note: `SYNTHETIC RECORD — not a real patient\nVisit: Outpatient follow-up\nAssessment: Knee osteoarthritis.\nMedication instructions: Acetaminophen 500 mg tablet: take 1 tablet by mouth every 8 hours as needed for knee pain, for up to 5 days. Do not exceed 3 tablets in 24 hours.\nPlan: Arrange a physical therapy assessment within 2 weeks. Return to the clinic in 6 weeks to review progress.\nRequested service: Physical therapy assessment for knee osteoarthritis.\nCare goal: Walk to the neighborhood shop with less knee discomfort.\nCoverage: Plan eligibility, provider network, cost, and authorization requirements have not been verified.`,
    condition: 'Knee osteoarthritis', explanation: 'Wear-related changes in the knee joint can cause pain and stiffness. This is an explanation of the condition documented in the example note.',
    medicationName: 'Acetaminophen 500 mg tablet', medication: 'Acetaminophen 500 mg tablet: take 1 tablet by mouth every 8 hours as needed for knee pain, for up to 5 days. Do not exceed 3 tablets in 24 hours.',
    followUp: 'Arrange a physical therapy assessment within 2 weeks. Return to the clinic in 6 weeks to review progress.', due: 'Assessment within 2 weeks; clinic review in 6 weeks',
    service: 'Physical therapy assessment for knee osteoarthritis', specialty: 'Physical therapy', goal: 'Walk to the neighborhood shop with less knee discomfort.',
    question: 'In your own words, what are the next two appointments in this plan?',
  }),
  fixture({
    id: 'hypertension-followup', title: 'Make the follow-up plan clear',
    note: `SYNTHETIC RECORD — not a real patient\nVisit: Outpatient follow-up\nAssessment: Hypertension.\nMedication instructions: Amlodipine 5 mg tablet: continue 1 tablet by mouth once daily, as documented by the clinician.\nPlan: Bring your home blood pressure log to a primary care follow-up in 2 weeks.\nRequested service: Primary care follow-up for hypertension.\nCare goal: Review home readings with the care team.\nCoverage: Plan eligibility, provider network, cost, and authorization requirements have not been verified.`,
    condition: 'Hypertension', explanation: 'Hypertension means high blood pressure. The example note asks for a review of home readings with the care team.',
    medicationName: 'Amlodipine 5 mg tablet', medication: 'Amlodipine 5 mg tablet: continue 1 tablet by mouth once daily, as documented by the clinician.',
    followUp: 'Bring your home blood pressure log to a primary care follow-up in 2 weeks.', due: 'Within 2 weeks',
    service: 'Primary care follow-up for hypertension', specialty: 'Primary care', goal: 'Review home readings with the care team.',
    question: 'What will you bring to your follow-up, and when is it needed?',
  }),
  fixture({
    id: 'diabetes-followup', title: 'Know what happens after the visit',
    note: `SYNTHETIC RECORD — not a real patient\nVisit: Outpatient follow-up\nAssessment: Type 2 diabetes.\nMedication instructions: Metformin 500 mg tablet: continue 1 tablet by mouth twice daily with meals, as documented by the clinician.\nPlan: Arrange a diabetes education appointment within 4 weeks. Bring your medication list and questions to the appointment.\nRequested service: Diabetes education appointment.\nCare goal: Understand the existing care plan and prepare questions for the educator.\nCoverage: Plan eligibility, provider network, cost, and authorization requirements have not been verified.`,
    condition: 'Type 2 diabetes', explanation: 'Type 2 diabetes affects how the body uses blood sugar. The example plan asks for education about the existing care plan.',
    medicationName: 'Metformin 500 mg tablet', medication: 'Metformin 500 mg tablet: continue 1 tablet by mouth twice daily with meals, as documented by the clinician.',
    followUp: 'Arrange a diabetes education appointment within 4 weeks. Bring your medication list and questions to the appointment.', due: 'Within 4 weeks',
    service: 'Diabetes education appointment', specialty: 'Diabetes education', goal: 'Understand the existing care plan and prepare questions for the educator.',
    question: 'What appointment does the note ask you to arrange, and what will you bring?',
  }),
]

/** Conservative section parser. Extracts only explicitly labelled fields. Free
 * narrative remains available as source text rather than becoming guessed facts. */
export function parseLocalNote(input: string): Journey {
  const note = input.trim()
  const sourceLabel = 'Your pasted note · processed locally · needs clinical review'
  const id = `local-${hash(note)}`
  const journey: Journey = {
    id, title: 'Your local care journey', note, sourceLabel, synthetic: false,
    conditions: [], medications: [], nextSteps: [], services: [], teachBack: [],
    context: { location: 'Not provided', language: 'Not provided', coverage: 'Not verified', referralReason: 'Not extracted', careGoal: 'Not extracted' },
    limitations: ['Local section parsing is not clinical interpretation. A clinician must review extracted content.', 'No real plan, price, provider, eligibility or authorization has been verified.', 'Unlabelled narrative is preserved below; missing facts are not filled in.'],
  }
  let offset = 0
  for (const raw of note.split('\n')) {
    const match = /^\s*(assessment|diagnos(?:is|es)|condition|medication instructions|medications?|follow[ -]?up|plan|requested service|referral|care goal|language|location|coverage)\s*:\s*(.+?)\s*$/i.exec(raw)
    if (match) {
      const key = match[1].toLowerCase(), value = match[2], ev = evidence(note, value, sourceLabel, offset)
      const factId = `${id}-${ev.start}`
      if (/^(assessment|diagnos|condition)/.test(key)) journey.conditions.push({ id: factId, label: value, explanation: 'Copied from the note. Meaning and diagnostic status need clinician review.', status: 'needs_review', evidence: ev })
      else if (/^medication/.test(key)) journey.medications.push({ id: factId, name: value.split(/:\s/)[0], instructions: value, status: /\b(stop|discontinue|hold|stopped)\b/i.test(value) ? 'stopped' : 'needs_review', evidence: ev })
      else if (/^(plan|follow)/.test(key)) {
        journey.nextSteps.push({ id: factId, title: 'Documented next step', detail: value, due: 'Confirm timing from the source', owner: 'patient', evidence: ev })
        journey.teachBack.push({ id: `${factId}-teachback`, question: 'In your own words, what does this part of your plan ask you to do?', expectedAnswer: value, evidence: ev })
      } else if (/^(requested service|referral)$/.test(key)) { journey.services.push({ id: factId, label: value, specialty: 'Needs review', authorizationRequired: 'unknown', evidence: ev }); journey.context.referralReason = value }
      else if (key === 'care goal') journey.context.careGoal = value
      else if (key === 'language') journey.context.language = value
      else if (key === 'location') journey.context.location = value
      else if (key === 'coverage') journey.context.coverage = `${value} (from note; unverified)`
    }
    offset += raw.length + 1
  }
  if (!journey.conditions.length && !journey.medications.length && !journey.nextSteps.length) journey.limitations.unshift('No supported labelled clinical sections found. Add Assessment:, Medication instructions:, Plan:, or Requested service: lines, or review the source manually.')
  return journey
}

export const SAMPLE_PLANS: SamplePlan[] = [
  { id: 'sample-balanced', name: 'Example Balanced PPO', type: 'Fictional PPO', monthlyPremium: 210, deductible: 1500, oopMax: 6500, coinsurance: 0.2, visitAllowed: 140, visitCopay: 35, sourceLabel: 'Authored sample benefit schedule · not an insurance offer', fictional: true },
  { id: 'sample-lowpremium', name: 'Example Saver HDHP', type: 'Fictional high deductible plan', monthlyPremium: 100, deductible: 3200, oopMax: 7000, coinsurance: 0.2, visitAllowed: 130, visitCopay: null, sourceLabel: 'Authored sample benefit schedule · not an insurance offer', fictional: true },
  { id: 'sample-predictable', name: 'Example Predictable HMO', type: 'Fictional HMO', monthlyPremium: 285, deductible: 500, oopMax: 3500, coinsurance: 0.1, visitAllowed: 125, visitCopay: 20, sourceLabel: 'Authored sample benefit schedule · not an insurance offer', fictional: true },
]

/** Shared authored benefits used by both the care journey and insurance demo.
 * Array order follows SAMPLE_PLANS. Values are fictional, not published rates. */
export const SAMPLE_SERVICE_BENEFITS: Readonly<Record<string, { allowed: number[]; copays: (number | null)[] }>> = {
  'knee-osteoarthritis': { allowed: [140, 130, 125], copays: [35, null, 20] },
  'hypertension-followup': { allowed: [110, 100, 105], copays: [25, null, 15] },
  'diabetes-followup': { allowed: [180, 160, 170], copays: [45, null, 25] },
}
export function samplePlanCost(plan: SamplePlan, scenarioId: string, visits: number) {
  const benefits = SAMPLE_SERVICE_BENEFITS[scenarioId]
  const index = SAMPLE_PLANS.findIndex((p) => p.id === plan.id)
  if (!benefits || index < 0 || !Number.isFinite(visits) || visits < 0) throw new Error('A known fictional scenario, plan, and nonnegative visit count are required')
  const visitAllowed = benefits.allowed[index], visitCopay = benefits.copays[index]
  const allowed = visitAllowed * visits
  const deductiblePaid = visitCopay === null ? Math.min(plan.deductible, allowed) : 0
  const care = visitCopay === null ? deductiblePaid + Math.max(0, allowed - deductiblePaid) * plan.coinsurance : visitCopay * visits
  const estimatedCareCost = Math.round(Math.min(plan.oopMax, care) * 100) / 100
  const annualPremium = plan.monthlyPremium * 12
  return { visitAllowed, visitCopay, allowed, deductiblePaid, estimatedCareCost, annualPremium, totalAnnualCost: annualPremium + estimatedCareCost, worstCaseAnnualCost: annualPremium + plan.oopMax }
}
export const SAMPLE_PROVIDERS: SampleProvider[] = [
  ...(['Physical therapy', 'Primary care', 'Diabetes education'] as const).flatMap((specialty, i) => [
    { id: `example-provider-${i}-a`, name: ['Willow Physical Therapy', 'Willow Primary Care', 'Willow Diabetes Education'][i], specialty, facility: 'Example County · Willow center', distanceMiles: 3, languages: ['English', 'Spanish'], nextAvailable: 'Illustrative: within 1 week', samplePlanIds: ['sample-balanced', 'sample-predictable'], sourceLabel: 'Fictional directory entry · not a real provider', fictional: true as const },
    { id: `example-provider-${i}-b`, name: ['Cedar Movement Clinic', 'Cedar Family Practice', 'Cedar Diabetes Learning Center'][i], specialty, facility: 'Example County · Cedar center', distanceMiles: 8, languages: ['English'], nextAvailable: 'Illustrative: within 2 weeks', samplePlanIds: ['sample-balanced', 'sample-lowpremium'], sourceLabel: 'Fictional directory entry · not a real provider', fictional: true as const },
  ]),
]

export function createJourneyState(journey: Journey): JourneyState {
  const tasks: JourneyTask[] = [
    { id: 'clinical-review', title: 'Review the care plan against the note', detail: 'Confirm instructions and resolve missing information before sharing a clinical plan.', owner: 'clinician', due: 'Before patient release', status: 'open' },
    ...journey.services.flatMap((service) => [
      { id: `benefits-${service.id}`, title: 'Verify benefits and network', detail: 'Confirm the exact plan, eligibility, service benefits, provider network, and a sourced cost estimate.', owner: 'hospital' as const, due: 'Before booking', status: 'open' as const, serviceId: service.id, evidence: service.evidence },
      { id: `referral-${service.id}`, title: 'Coordinate the requested appointment', detail: 'Contact the receiving office and record confirmation. Selecting a sample provider does not book an appointment.', owner: 'hospital' as const, due: 'Follow the documented timing', status: 'open' as const, serviceId: service.id, evidence: service.evidence },
    ]),
    ...journey.nextSteps.map((step) => ({ id: step.id, title: step.title, detail: step.detail, owner: step.owner, due: step.due, status: 'open' as const, evidence: step.evidence })),
  ]
  return {
    journey, tasks, authorizations: Object.fromEntries(journey.services.map((s) => [s.id, { serviceId: s.id, status: 'unknown', reference: '', recordedBy: null, updatedAt: null }])),
    events: [{ id: `${journey.id}-0`, title: journey.synthetic ? 'Sample journey opened' : 'Note processed locally', detail: 'Source evidence, next steps, and staff tasks share one local journey. Nothing has been sent or booked.', actor: 'system', to: ['patient', 'clinician', 'hospital'], createdAt: Date.now(), kind: 'state' }],
    preferences: { priority: 'balanced', maxTravelMiles: 10, preferredLanguage: 'English', monthlyBudget: 250, expectedVisits: 6 },
    selectedPlanId: null, selectedProviderId: null, teachBackAnswers: {}, clinicalReviewConfirmed: false, version: 0,
  }
}

function event(state: JourneyState, patch: Partial<JourneyState>, actor: Role, title: string, detail: string, to: Role[] = ['patient', 'clinician', 'hospital'], serviceId?: string, kind: 'state' | 'message' = 'state'): JourneyState {
  return { ...state, ...patch, version: state.version + 1, events: [...state.events, { id: `${state.journey.id}-${state.version + 1}`, title, detail, actor, to, serviceId, createdAt: Date.now(), kind }] }
}

/** Local role checks prevent accidental UI cross-role edits. They are not an
 * authentication boundary; production writes must be authorized on a server. */
export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case 'reset': return createJourneyState(action.journey)
    case 'selectPlan': {
      if (!state.journey.synthetic || (action.planId && !SAMPLE_PLANS.some((p) => p.id === action.planId))) return state
      if (action.planId === state.selectedPlanId) return state
      return event(state, { selectedPlanId: action.planId }, 'patient', 'Sample plan comparison updated', 'Scenario selected locally. This does not establish insurance enrollment, eligibility, or coverage.')
    }
    case 'selectProvider': {
      if (!state.journey.synthetic || (action.providerId && !matchProviders(state).some((p) => p.id === action.providerId))) return state
      if (action.providerId === state.selectedProviderId) return state
      return event(state, { selectedProviderId: action.providerId }, 'patient', 'Provider preference shared locally', 'Fictional option saved to the shared journey. Staff still need to verify network and arrange the appointment.')
    }
    case 'setPreferences': {
      const p = { ...state.preferences, ...action.preferences }
      p.expectedVisits = Math.round(finite(p.expectedVisits, state.preferences.expectedVisits, 0, 100))
      p.maxTravelMiles = finite(p.maxTravelMiles, state.preferences.maxTravelMiles, 1, 100)
      p.monthlyBudget = finite(p.monthlyBudget, state.preferences.monthlyBudget, 0, 10_000)
      p.preferredLanguage = String(p.preferredLanguage).trim().slice(0, 80)
      if (!['balanced', 'lowest_premium', 'predictable_cost'].includes(p.priority)) p.priority = 'balanced'
      return event(state, { preferences: p }, 'patient', 'Care preferences updated', 'The illustrative comparisons now reflect the selected visit count, travel limit, language, budget, and priority.')
    }
    case 'answerTeachBack': {
      if (!state.journey.teachBack.some((q) => q.id === action.questionId)) return state
      return event(state, { teachBackAnswers: { ...state.teachBackAnswers, [action.questionId]: action.answer.slice(0, 2000) } }, 'patient', 'Understanding check shared', 'The patient response is available for the care team to review. Saving an answer does not certify understanding.', ['patient', 'clinician'])
    }
    case 'confirmClinicalReview': {
      if (action.actor !== 'clinician' || state.clinicalReviewConfirmed) return state
      return event(state, { clinicalReviewConfirmed: true, tasks: state.tasks.map((t) => t.id === 'clinical-review' ? { ...t, status: 'done' } : t) }, 'clinician', 'Clinical review recorded locally', 'A local reviewer marked the source and plan reviewed. This prototype does not verify a clinician identity.')
    }
    case 'setTaskStatus': {
      const task = state.tasks.find((t) => t.id === action.taskId)
      if (!task || action.actor !== task.owner || action.actor === 'employer' || !['open', 'in_progress', 'done'].includes(action.status) || task.status === action.status) return state
      if (task.id === 'clinical-review') {
        return event(state, { clinicalReviewConfirmed: action.status === 'done', tasks: state.tasks.map((t) => t.id === task.id ? { ...t, status: action.status } : t) }, action.actor, 'Clinical review status updated', `Review is ${action.status.replace('_', ' ')}.`, ['patient', 'clinician', 'hospital'])
      }
      return event(state, { tasks: state.tasks.map((t) => t.id === task.id ? { ...t, status: action.status } : t) }, action.actor, `${task.title}: ${action.status.replace('_', ' ')}`, 'Task status recorded in this local prototype; no external organization was notified.', ['patient', 'clinician', 'hospital'], task.serviceId)
    }
    case 'recordAuthorization': {
      if (!state.authorizations[action.serviceId] || !['hospital', 'clinician'].includes(action.actor) || !['unknown', 'not_required', 'pending', 'approved', 'denied'].includes(action.status)) return state
      const reference = (action.reference ?? '').trim().slice(0, 1000)
      // A decision without an evidence reference cannot become an approval.
      if (['approved', 'denied', 'not_required'].includes(action.status) && !reference) return state
      const auth: Authorization = { serviceId: action.serviceId, status: action.status, reference, recordedBy: action.actor, updatedAt: Date.now() }
      return event(state, { authorizations: { ...state.authorizations, [action.serviceId]: auth } }, action.actor, `Authorization recorded: ${action.status.replace('_', ' ')}`, 'Staff-recorded status only. Authorization is separate from eligibility, network, benefits, and final payment.', ['patient', 'clinician', 'hospital'], action.serviceId)
    }
    case 'sendMessage': {
      const body = action.body.trim().slice(0, 2000)
      if (!body || action.from === 'employer' || action.to === 'employer' || action.from === action.to || !['patient', 'clinician', 'hospital'].includes(action.from) || !['patient', 'clinician', 'hospital'].includes(action.to)) return state
      return event(state, {}, action.from, `Local message to ${action.to}`, body, [action.from, action.to], undefined, 'message')
    }
    default: return state
  }
}

/** Transparent rules, not a trained model. Plans remain fictional even when
 * ranked. Real eligibility and enrollment are deliberately always unknown. */
export function rankPlans(state: JourneyState): PlanMatch[] {
  if (!state.journey.synthetic) return []
  const { expectedVisits, monthlyBudget, priority } = state.preferences
  const plans = SAMPLE_PLANS.map((p) => ({ ...p, ...samplePlanCost(p, state.journey.id, expectedVisits) }))
  const scale = (value: number, values: number[]) => Math.max(...values) === Math.min(...values) ? 1 : 1 - (value - Math.min(...values)) / (Math.max(...values) - Math.min(...values))
  const weights = priority === 'lowest_premium' ? { premium: .7, total: .2, protection: .1 } : priority === 'predictable_cost' ? { premium: .1, total: .2, protection: .7 } : { premium: .2, total: .6, protection: .2 }
  return plans.map((p): PlanMatch => {
    const budgetPass = p.monthlyPremium <= monthlyBudget
    const utility = weights.premium * scale(p.monthlyPremium, plans.map((x) => x.monthlyPremium)) + weights.total * scale(p.totalAnnualCost, plans.map((x) => x.totalAnnualCost)) + weights.protection * scale(p.oopMax, plans.map((x) => x.oopMax))
    const score = Math.round(100 * utility)
    return {
      ...p, rank: 0, score, eligible: 'unknown',
      reasons: [`${expectedVisits} sample visits: $${p.estimatedCareCost.toLocaleString()} illustrative care spending`, budgetPass ? 'Monthly premium fits your entered budget' : 'Monthly premium exceeds your entered budget', `Priority: ${priority.replace(/_/g, ' ')}; annual cost ${weights.total * 100}%, premium ${weights.premium * 100}%, out-of-pocket limit ${weights.protection * 100}% of ranking`],
      gaps: ['Fictional plan; real eligibility and network are unknown', 'Prescriptions, other care, subsidies and employer contributions are excluded', ...(!budgetPass ? ['Over monthly budget'] : [])],
      calculation: p.visitCopay !== null ? `$${p.monthlyPremium} × 12 + ${expectedVisits} visits × $${p.visitCopay} copay (care capped at $${p.oopMax})` : `$${p.monthlyPremium} × 12 + deductible first, then ${p.coinsurance * 100}% of the remaining $${p.visitAllowed * expectedVisits} allowed charges (care capped at $${p.oopMax})`,
      assumptions: ['All example visits are eligible, in network, and in the same plan year.', p.visitCopay !== null ? 'The authored example benefit waives the deductible for these visits.' : 'The full annual deductible remains before these example visits.', 'Plans within your entered monthly budget rank before over-budget plans.', 'Scores are relative preference points, not probabilities or clinical recommendations.'],
    }
  }).sort((a, b) => Number(a.monthlyPremium > monthlyBudget) - Number(b.monthlyPremium > monthlyBudget) || b.score - a.score || a.totalAnnualCost - b.totalAnnualCost).map((p, i) => ({ ...p, rank: i + 1 }))
}

export function matchProviders(state: JourneyState): ProviderMatch[] {
  if (!state.journey.synthetic) return []
  const specialties = new Set(state.journey.services.map((s) => s.specialty))
  return SAMPLE_PROVIDERS.filter((p) => specialties.has(p.specialty)).map((p): ProviderMatch => {
    const language = p.languages.some((l) => l.toLowerCase() === state.preferences.preferredLanguage.toLowerCase())
    const travel = p.distanceMiles <= state.preferences.maxTravelMiles
    const network = !!state.selectedPlanId && p.samplePlanIds.includes(state.selectedPlanId)
    return { ...p, rank: 0, score: 40 + (travel ? 20 : 0) + (language ? 15 : 0) + (network ? 25 : 0), networkStatus: network ? 'sample_match' : 'unknown',
      reasons: [`Offers the example requested specialty: ${p.specialty}`, travel ? 'Within your travel preference' : 'Outside your travel preference', language ? 'Lists your preferred language in the example directory' : 'Preferred language not listed', network ? 'Listed in the selected fictional plan’s sample directory' : 'Exact-plan participation is not verified'],
      gaps: ['Fictional provider; no real appointment is available to book here', ...(!travel ? ['Outside travel preference'] : []), ...(!language ? ['Language support needs verification'] : []), ...(!network ? ['Network participation unknown'] : [])],
    }
  }).sort((a, b) => b.score - a.score || a.distanceMiles - b.distanceMiles).map((p, i) => ({ ...p, rank: i + 1 }))
}

interface SyntheticNavigationRecord {
  reviewRecorded: boolean; understandingResponse: boolean; providerPreference: boolean;
  openBenefitsTasks: number; openCoordinationTasks: number;
}

/** Authored fictional workflow states, not measured performance or a population
 * dataset. No diagnoses, identities, dates, messages, or clinical text belong in
 * this cohort. Every displayed count is computed from these 24 rows plus the
 * currently open synthetic journey. */
const SYNTHETIC_NAVIGATION_COHORT: readonly SyntheticNavigationRecord[] = [
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: false, providerPreference: true, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: false, understandingResponse: false, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: false, openBenefitsTasks: 0, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: false, understandingResponse: true, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: false, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: false, understandingResponse: false, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: false, providerPreference: false, openBenefitsTasks: 0, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: false, understandingResponse: false, providerPreference: true, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: false, understandingResponse: false, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: false, providerPreference: true, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: false, understandingResponse: true, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: true, understandingResponse: true, providerPreference: true, openBenefitsTasks: 0, openCoordinationTasks: 0 },
  { reviewRecorded: true, understandingResponse: false, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
  { reviewRecorded: false, understandingResponse: false, providerPreference: false, openBenefitsTasks: 1, openCoordinationTasks: 1 },
]

export interface EmployerAggregate {
  visible: boolean; synthetic: boolean; cohortSize: number; minimumCohort: number;
  sourceLabel: string; message: string; noIndividualData: true;
  clinicalReviewsRecorded: number; understandingResponsesRecorded: number;
  providerPreferencesRecorded: number; openBenefitsTasks: number; openCoordinationTasks: number;
}

export function aggregateEmployerJourney(state: JourneyState): EmployerAggregate {
  const hidden: EmployerAggregate = {
    visible: false, synthetic: false, cohortSize: 0, minimumCohort: 10,
    sourceLabel: 'No verified reporting cohort', noIndividualData: true,
    message: 'This pasted note is excluded from employer reporting. A permitted cohort and production access controls are required before aggregate reporting.',
    clinicalReviewsRecorded: 0, understandingResponsesRecorded: 0, providerPreferencesRecorded: 0, openBenefitsTasks: 0, openCoordinationTasks: 0,
  }
  if (!state.journey.synthetic) return hidden
  const current: SyntheticNavigationRecord = {
    reviewRecorded: state.clinicalReviewConfirmed,
    understandingResponse: state.journey.teachBack.some((q) => !!state.teachBackAnswers[q.id]?.trim()),
    providerPreference: !!state.selectedProviderId,
    openBenefitsTasks: state.tasks.filter((t) => t.id.startsWith('benefits-') && t.status !== 'done').length,
    openCoordinationTasks: state.tasks.filter((t) => t.id.startsWith('referral-') && t.status !== 'done').length,
  }
  const rows = [...SYNTHETIC_NAVIGATION_COHORT, current]
  return {
    visible: true, synthetic: true, cohortSize: rows.length, minimumCohort: 10,
    sourceLabel: `Illustrative cohort of ${rows.length} fictional journeys`, noIndividualData: true,
    message: 'Counts come from 24 authored sample workflow records plus the current synthetic journey. They demonstrate shared state, not measured outcomes or real employee data. Responses recorded do not prove understanding; provider preferences do not mean appointments were booked.',
    clinicalReviewsRecorded: rows.filter((r) => r.reviewRecorded).length,
    understandingResponsesRecorded: rows.filter((r) => r.understandingResponse).length,
    providerPreferencesRecorded: rows.filter((r) => r.providerPreference).length,
    openBenefitsTasks: rows.reduce((sum, r) => sum + r.openBenefitsTasks, 0),
    openCoordinationTasks: rows.reduce((sum, r) => sum + r.openCoordinationTasks, 0),
  }
}

export function deriveJourney(state: JourneyState) {
  const doneTasks = state.tasks.filter((t) => t.status === 'done').length
  const openTasks = state.tasks.length - doneTasks
  const answers = state.journey.teachBack.filter((q) => state.teachBackAnswers[q.id]?.trim()).length
  const selectedPlan = rankPlans(state).find((p) => p.id === state.selectedPlanId) ?? null
  const selectedProvider = matchProviders(state).find((p) => p.id === state.selectedProviderId) ?? null
  return {
    doneTasks, openTasks, totalTasks: state.tasks.length, completedTasks: doneTasks,
    completionPercent: state.tasks.length ? Math.round(doneTasks / state.tasks.length * 100) : 0,
    answeredTeachBack: answers, teachBackComplete: state.journey.teachBack.length > 0 && answers === state.journey.teachBack.length,
    clinicalReviewConfirmed: state.clinicalReviewConfirmed, selectedPlan, selectedProvider,
    authorizationPending: Object.values(state.authorizations).filter((a) => a.status === 'unknown' || a.status === 'pending').length,
    coverageStatus: 'Unverified' as const, bookingStatus: 'No appointment booked' as const,
    // Employer analytics must not expose an individual's record or message text.
    employer: aggregateEmployerJourney(state),
  }
}
