'use client'

import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, FileText, Heart, Stethoscope, Building2, Users, FlaskConical, MessageCircle, ShieldCheck, RotateCcw } from 'lucide-react'
import { Logo } from '@/components/SiteNav'
import { DEMO_JOURNEYS, aggregateEmployerJourney, createJourneyState, journeyReducer, parseLocalNote, type Journey, type JourneyState, type JourneyAction, type Role } from '@/lib/journey'
import { INSURANCE_SCENARIOS, runInsuranceDemo } from '@/lib/insurance-demo'
import { evaluateCareRehearsal, REHEARSAL_OPTIONS } from '@/lib/care-rehearsal'
import './dashboard.css'

const ROLES = [
  { id: 'patient' as const, label: 'Patient', icon: Heart },
  { id: 'clinician' as const, label: 'Clinician', icon: Stethoscope },
  { id: 'hospital' as const, label: 'Care team', icon: Building2 },
  { id: 'employer' as const, label: 'Employer', icon: Users },
]
const roleName = (role: Role) => ROLES.find(r => r.id === role)!.label
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
const sampleLabels = ['Knee care', 'Blood pressure follow-up', 'Diabetes follow-up']
function initialState(journey: Journey) {
  const state = createJourneyState(journey)
  state.preferences.expectedVisits = INSURANCE_SCENARIOS.find(s => s.id === journey.id)?.defaultVisits ?? 6
  if (journey.synthetic) state.selectedPlanId = runInsuranceDemo({ ...state.preferences, scenarioId: journey.id, selectedPlanId: null }).recommendedPlan.id
  return state
}

function TaskList({ state, owner, dispatch }: { state: JourneyState; owner: Role; dispatch: Dispatch<JourneyAction> }) {
  const tasks = state.tasks.filter(t => t.owner === owner)
  return <div className="care-task-list">{tasks.map(task => <div className="care-task" key={task.id}>
    <span className={`care-task-dot ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' ? <Check size={15}/> : null}</span>
    <div><strong>{task.title}</strong><p>{task.detail}</p><small>{task.due}</small></div>
    <select aria-label={`Status: ${task.title}`} value={task.status} onChange={e => dispatch({ type: 'setTaskStatus', taskId: task.id, status: e.target.value as 'open'|'in_progress'|'done', actor: owner })}>
      <option value="open">To do</option><option value="in_progress">In progress</option><option value="done">Recorded done</option>
    </select>
  </div>)}{!tasks.length && <p className="care-muted">No assigned tasks for this view.</p>}</div>
}

export default function InteractiveDashboard() {
  const [state, dispatch] = useReducer(journeyReducer, DEMO_JOURNEYS[0], initialState)
  const [role, setRole] = useState<Role>('patient')
  const [noteDraft, setNoteDraft] = useState(DEMO_JOURNEYS[0].note)
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState('')
  const [recipient, setRecipient] = useState<Role>('clinician')
  const [status, setStatus] = useState('')
  const [rehearsalId, setRehearsalId] = useState('baseline')
  const [authorizationRef, setAuthorizationRef] = useState('')
  const [authorizationStatus, setAuthorizationStatus] = useState<'unknown'|'pending'|'not_required'|'approved'|'denied'>('unknown')
  const rolePanel = useRef<HTMLElement>(null)
  const noteDetails = useRef<HTMLDetailsElement>(null)
  const journey = state.journey
  const aggregate = aggregateEmployerJourney(state)
  const baseline = useMemo(() => evaluateCareRehearsal(state, 'baseline'), [state])
  const rehearsal = useMemo(() => evaluateCareRehearsal(state, rehearsalId as Parameters<typeof evaluateCareRehearsal>[1]), [state, rehearsalId])
  const insurance = useMemo(() => journey.synthetic ? runInsuranceDemo({ ...state.preferences, scenarioId: journey.id, selectedPlanId: state.selectedPlanId }) : null, [state, journey])
  const question = journey.teachBack[0]
  const service = journey.services[0]
  const selectedProvider = insurance?.providers.find(p => p.id === state.selectedProviderId)
  const done = state.tasks.filter(t => t.status === 'done').length
  const messages = state.events.filter(e => e.kind === 'message' && e.to.includes(role))

  function loadJourney(next: Journey) {
    dispatch({type:'reset',journey:next})
    dispatch({type:'setPreferences',preferences:initialState(next).preferences})
    dispatch({type:'selectPlan',planId:initialState(next).selectedPlanId})
    setNoteDraft(next.note); setAnswer(''); setMessage(''); setRehearsalId('baseline')
    setAuthorizationRef(''); setAuthorizationStatus('unknown'); setStatus('A new journey is ready.')
    if(role === 'employer' && !next.synthetic) setRole('patient')
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sample = DEMO_JOURNEYS.find(j => j.id === params.get('scenario'))
    if(sample) { dispatch({type:'reset',journey:sample}); dispatch({type:'setPreferences',preferences:initialState(sample).preferences}); dispatch({type:'selectPlan',planId:initialState(sample).selectedPlanId}); setNoteDraft(sample.note) }
    const incomingRole = params.get('role')
    if(ROLES.some(r=>r.id===incomingRole)) { setRole(incomingRole as Role); setRecipient(incomingRole === 'clinician' ? 'patient' : 'clinician') }
  }, [])
  function chooseRole(next: Role, scroll = false) {
    setRole(next); setStatus(''); setRecipient(next === 'clinician' ? 'patient' : 'clinician')
    if(scroll) requestAnimationFrame(() => rolePanel.current?.scrollIntoView({behavior:'smooth',block:'start'}))
  }
  function sendMessage() {
    if(!message.trim() || role === 'employer' || recipient === role || recipient === 'employer') return
    dispatch({type:'sendMessage',from:role,to:recipient,body:message}); setMessage(''); setStatus('Question shared with the selected team view in this demo.')
  }
  function shareRehearsal() {
    const to = rehearsal.bottleneck.questionTo
    if (to === role) { chooseRole('patient', true); return }
    dispatch({type:'sendMessage',from:role,to,body:`Hypothetical rehearsal — ${rehearsal.title}: ${rehearsal.bottleneck.question}`})
    setStatus(`Rehearsal question added to the ${roleName(to).toLowerCase()} view. No plan or appointment was changed.`)
  }

  return <div className="care-dashboard">
    <header className="care-header"><Logo/><Link href="/">Home <ArrowUpRight size={17}/></Link></header>
    <main className="care-page">
      <div className="care-intro"><div><span className="care-eyebrow">YOUR CONNECTED CARE DASHBOARD</span><h1>Make the next step clear.</h1><p>Understand the plan, work through the obstacles, and keep everyone in sync.</p></div><span className="care-demo-badge"><FlaskConical size={16}/>Synthetic demo</span></div>
      <div className="care-toolbar">
        {role !== 'employer' ? <label>Example journey<select aria-label="Example journey" value={journey.synthetic ? journey.id : 'custom'} onChange={e=>{const j=DEMO_JOURNEYS.find(j=>j.id===e.target.value);if(j)loadJourney(j)}}>{DEMO_JOURNEYS.map((j,i)=><option value={j.id} key={j.id}>{sampleLabels[i]}</option>)}{!journey.synthetic&&<option value="custom">Your pasted note</option>}</select></label> : <strong>{aggregate.visible ? `${aggregate.cohortSize} fictional journeys · aggregate view` : 'No reporting cohort'}</strong>}
        <span>One shared journey. Updates carry across the four views.</span>
        <button className="care-text-button" onClick={()=>loadJourney(journey)}><RotateCcw size={15}/>Reset demo</button>
      </div>
      <nav className="care-role-tabs" aria-label="Care perspectives" role="tablist">{ROLES.map(r=>{const Icon=r.icon;return <button key={r.id} id={`care-tab-${r.id}`} aria-controls="care-role-panel" role="tab" aria-selected={role===r.id} onClick={()=>chooseRole(r.id)}><Icon size={19}/>{r.label}</button>})}</nav>
      <div role="status" aria-live="polite" className="care-status">{status}</div>

      <div className={`care-main-grid ${role === 'employer' ? 'care-employer-grid' : ''}`}>
        <section ref={rolePanel} id="care-role-panel" role="tabpanel" aria-labelledby={`care-tab-${role}`} className="care-panel care-role-panel">
          {role==='patient' && <>
            <span className="care-eyebrow">YOUR PLAN, IN PLAIN LANGUAGE</span><h2>{journey.conditions[0]?.label ?? 'Let’s review the source together.'}</h2>
            <p className="care-lead">{journey.conditions[0]?.explanation ?? 'Use labelled sections such as Assessment: and Plan: to show the documented facts. Missing details stay unknown.'}</p>
            <div className="care-instruction"><span>What happens next</span><p>{journey.nextSteps.map(s=>s.detail).join(' ') || 'No next step was extracted. Ask the clinician to clarify the plan.'}</p></div>
            {journey.medications.length>0&&<details className="care-details"><summary>Medication directions from the note <ChevronDown size={17}/></summary>{journey.medications.map(m=><p className="care-quoted" key={m.id}>{m.instructions}</p>)}<small>Copied exactly from this example. These are not personal treatment instructions.</small></details>}
            {question&&<div className="care-understanding"><h3>Does the plan make sense?</h3><label htmlFor="care-answer">{question.question}</label><textarea id="care-answer" value={answer} placeholder="Write the next step in your own words…" onChange={e=>setAnswer(e.target.value)}/><div className="care-action-row"><button className="care-button" disabled={!answer.trim()} onClick={()=>{dispatch({type:'answerTeachBack',questionId:question.id,answer});setStatus('Your response is ready for the clinician to review.')}}>Share with care team <ArrowRight size={16}/></button>{state.teachBackAnswers[question.id]&&<span className="care-success"><Check size={15}/>Response recorded</span>}</div></div>}
            <details className="care-details"><summary>Record my progress <ChevronDown size={17}/></summary><TaskList state={state} owner="patient" dispatch={dispatch}/></details>
          </>}
          {role==='clinician'&&<>
            <span className="care-eyebrow">CLINICIAN VIEW</span><h2>Review the plan. Close the loop.</h2><p className="care-lead">Keep the documented instructions and the patient’s understanding together.</p>
            <div className="care-instruction"><span>Documented next step</span><p>{journey.nextSteps.map(s=>s.detail).join(' ') || 'The note needs a documented next step.'}</p></div>
            {journey.conditions.map(c=><p key={c.id}><strong>Assessment:</strong> {c.label}</p>)}
            <div className="care-response"><h3>The patient’s own words</h3>{question&&state.teachBackAnswers[question.id]?<blockquote>{state.teachBackAnswers[question.id]}</blockquote>:<p>No response recorded yet. Ask the patient to describe the next step.</p>}<small>A recorded response still needs clinical review.</small></div>
            <button className="care-button" disabled={state.clinicalReviewConfirmed} onClick={()=>{dispatch({type:'confirmClinicalReview',actor:'clinician'});setStatus('Clinical review recorded for this demonstration.')}}>{state.clinicalReviewConfirmed?<><Check size={17}/>Review recorded</>:<>Record source and plan review <Check size={17}/></>}</button>
          </>}
          {role==='hospital'&&<>
            <span className="care-eyebrow">CARE COORDINATION</span><h2>Every next step has an owner.</h2><p className="care-lead">Keep benefits checks and appointment coordination separate.</p>
            <div className="care-context-line"><strong>Provider preference</strong><span>{selectedProvider?.name ?? 'Not selected yet'}</span></div>
            <div className="care-context-line"><strong>Sample plan comparison</strong><span>{insurance?.selectedPlan.name ?? 'No fictional comparison for this note'}</span></div>
            <TaskList state={state} owner="hospital" dispatch={dispatch}/>
            {service&&<details className="care-details"><summary>Record authorization evidence <ChevronDown size={17}/></summary><p>{service.label}</p><label>Staff-recorded status<select aria-label="Staff-recorded authorization status" value={authorizationStatus} onChange={e=>setAuthorizationStatus(e.target.value as typeof authorizationStatus)}><option value="unknown">Not checked</option><option value="pending">Pending</option><option value="not_required">Recorded not required</option><option value="approved">Recorded approved</option><option value="denied">Recorded denied</option></select></label><label>Evidence reference<input aria-label="Evidence reference" value={authorizationRef} onChange={e=>setAuthorizationRef(e.target.value)} placeholder="Example payer reference or source"/></label><button className="care-button" disabled={['approved','denied','not_required'].includes(authorizationStatus)&&!authorizationRef.trim()} onClick={()=>{dispatch({type:'recordAuthorization',serviceId:service.id,status:authorizationStatus,reference:authorizationRef,actor:'hospital'});setStatus('Authorization status recorded locally; coverage remains unverified.')}}>Record status</button><p className="care-muted">Current record: {state.authorizations[service.id]?.status.replace('_',' ')}. Authorization does not establish eligibility or payment.</p></details>}
          </>}
          {role==='employer'&&<>
            <span className="care-eyebrow">AGGREGATE WORKFLOW ONLY</span><h2>See where care gets stuck.</h2><p className="care-lead">A view of navigation work, without individual clinical details.</p>
            {aggregate.visible?<><div className="care-aggregate"><div><strong>{aggregate.cohortSize}</strong><span>Fictional journeys</span></div><div><strong>{aggregate.openBenefitsTasks}</strong><span>Open benefits tasks</span></div><div><strong>{aggregate.openCoordinationTasks}</strong><span>Open coordination tasks</span></div><div><strong>{aggregate.understandingResponsesRecorded}</strong><span>Understanding responses</span></div></div><p className="care-muted">{aggregate.message}</p></>:<p className="care-instruction">{aggregate.message}</p>}
          </>}
        </section>

        {role!=='employer'?<aside className="care-next-panel"><span className="care-eyebrow">THE NEXT HANDOFF</span><h2>{baseline.bottleneck.title}</h2><p>{baseline.bottleneck.reason}</p><div className="care-owner"><span>Next owner</span><strong>{roleName(baseline.bottleneck.owner)}</strong></div><div className="care-next-action"><ArrowRight size={20}/><p>{baseline.bottleneck.nextAction}</p></div>{baseline.bottleneck.owner!==role&&<button className="care-button care-button-light" onClick={()=>chooseRole(baseline.bottleneck.owner,true)}>Open {roleName(baseline.bottleneck.owner).toLowerCase()} view <ArrowUpRight size={17}/></button>}<div className="care-progress"><span>{done} of {state.tasks.length} tasks recorded done</span><progress value={done} max={state.tasks.length||1}/></div><p className="care-next-note">Coverage is unverified. No appointment is booked.</p></aside>:<aside className="care-next-panel"><ShieldCheck size={30}/><h2>Context without a chart.</h2><p>Employer reporting shows aggregate workflow counts. Source notes, diagnoses, medication directions, and individual messages stay out of this view.</p></aside>}
      </div>

      {role!=='employer'&&<>
        <details ref={noteDetails} className="care-source"><summary><span><FileText size={19}/>Read or change the source note</span><ChevronDown size={18}/></summary><div className="care-source-body"><p>The examples are fictional. Editing uses a local section parser, not clinical AI. Use Assessment:, Medication instructions:, Plan:, and Requested service: labels.</p><label htmlFor="care-note">Clinical note<textarea aria-label="Clinical note" id="care-note" value={noteDraft} onChange={e=>setNoteDraft(e.target.value)}/></label><button className="care-button" disabled={!noteDraft.trim()||noteDraft===journey.note} onClick={()=>{const fixture=DEMO_JOURNEYS.find(j=>j.note.trim()===noteDraft.trim());loadJourney(fixture??parseLocalNote(noteDraft));noteDetails.current?.removeAttribute('open')}}>Use this note <ArrowRight size={17}/></button><small>Custom notes are kept separate from the fictional plan catalog.</small></div></details>

        <section className="care-rehearsal"><div className="care-rehearsal-intro"><div><span className="care-eyebrow"><FlaskConical size={16}/>CARE REHEARSAL</span><h2>What could get in the way?</h2><p>Change one assumption. See the consequences and the question that moves care forward.</p></div><label>Try a what-if<select aria-label="Try a what-if" value={rehearsalId} onChange={e=>setRehearsalId(e.target.value)}>{REHEARSAL_OPTIONS.map(o=><option value={o.id} key={o.id}>{o.title}</option>)}</select></label></div>
          {rehearsalId==='baseline'?<div className="care-rehearsal-empty"><span>01 <strong>A constraint changes</strong></span><ArrowRight/><span>02 <strong>Its effects become visible</strong></span><ArrowRight/><span>03 <strong>The next owner gets a clear question</strong></span></div>:<div className="care-rehearsal-result">
            <div className="care-rehearsal-finding"><span className="care-pill">Hypothetical · nothing changed in your plan</span><h3>{rehearsal.bottleneck.title}</h3><p>{rehearsal.bottleneck.reason}</p>{rehearsal.bottleneck.evidence.length>0&&<blockquote><small>WHY THIS STEP EXISTS IN THE NOTE</small>“{rehearsal.bottleneck.evidence[0].text}”</blockquote>}</div>
            {rehearsal.comparison?.plans && <div className="care-whatif-comparison"><div className="care-budget-delta"><span>Monthly premium budget</span><strong>{money(rehearsal.comparison.plans.beforeMonthlyBudget)} <ArrowRight size={22}/> {money(rehearsal.comparison.plans.afterMonthlyBudget)}</strong></div><div className="care-budget-options">{rehearsal.comparison.plans.options.map(p=><div key={p.id}><strong>{p.name.replace('Example ','')}</strong><span>{money(p.monthlyPremium)}/month</span><span className={p.afterBudgetFit?'fits':'gap'}>{p.afterBudgetFit?'Fits new budget':'Over new budget'}</span></div>)}</div></div>}
            {rehearsal.comparison?.providers && <div className="care-provider-delta"><div><span>Hypothetically unavailable</span><strong>{rehearsal.comparison.providers.currentProviderName ?? 'No proposed provider'}</strong></div><ArrowRight size={24}/><div><span>{rehearsal.comparison.providers.alternative?'Compatible fictional alternative':'Unresolved gap'}</span><strong>{rehearsal.comparison.providers.alternative?.name ?? 'No matching alternative'}</strong><small>{rehearsal.comparison.providers.alternative?`${rehearsal.comparison.providers.alternative.distanceMiles} miles · real availability unknown`:rehearsal.comparison.providers.gap}</small></div></div>}
            <div className="care-effects">{ROLES.map(r=><div key={r.id}><strong>{r.label}</strong><p><span className="care-effect-label">Now</span>{rehearsal.roles[r.id].before}</p><p><span className="care-effect-label">What if</span>{rehearsal.roles[r.id].after}</p></div>)}</div>
            <div className="care-rehearsal-question"><div><span>QUESTION FOR THE {roleName(rehearsal.bottleneck.questionTo).toUpperCase()}</span><p>{rehearsal.bottleneck.question}</p></div><button className="care-button care-button-light" onClick={shareRehearsal}>{role===rehearsal.bottleneck.questionTo?'Open patient view to ask':'Add to team questions'} <ArrowRight size={17}/></button></div><p className="care-rehearsal-note">{rehearsal.disclaimer}</p>
          </div>}
        </section>

        {insurance&&role==='patient'&&<section className="care-panel care-coverage"><div className="care-section-heading"><div><span className="care-eyebrow">CARE & COVERAGE</span><h2>Make the trade-offs visible.</h2><p>Compare fictional plans and providers in the same journey.</p></div><span className="care-soft-badge">Illustrative costs</span></div>
          <div className="care-preferences"><label>What matters most<select aria-label="Plan priority" value={state.preferences.priority} onChange={e=>dispatch({type:'setPreferences',preferences:{priority:e.target.value as typeof state.preferences.priority}})}><option value="balanced">Balance cost and protection</option><option value="lowest_premium">Lower monthly premiums</option><option value="predictable_cost">Protection from large costs</option></select></label><label>Monthly premium budget<input aria-label="Monthly premium budget" type="number" min="0" max="600" value={state.preferences.monthlyBudget} onChange={e=>dispatch({type:'setPreferences',preferences:{monthlyBudget:Math.min(600,Math.max(0,Number(e.target.value)))}})}/></label><label>Example visits / year<input aria-label="Example visits per year" type="number" min="0" max="36" value={state.preferences.expectedVisits} onChange={e=>dispatch({type:'setPreferences',preferences:{expectedVisits:Math.min(36,Math.max(0,Number(e.target.value)))}})}/></label></div>
          <div className="care-plan-table" role="radiogroup" aria-label="Fictional benefit plan">{insurance.plans.map(plan=><label key={plan.id} className={insurance.selectedPlan.id===plan.id?'selected':''}><input type="radio" name="care-plan" value={plan.id} checked={insurance.selectedPlan.id===plan.id} onChange={()=>dispatch({type:'selectPlan',planId:plan.id})}/><span><strong>{plan.name.replace('Example ','')}</strong><small>{plan.budgetFit?'Within premium budget':'Over premium budget'}</small></span><span>{money(plan.monthlyPremium)}<small>per month</small></span><span><strong>{money(plan.totalAnnualCost)}</strong><small>annual scenario</small></span></label>)}</div>
          {!insurance.hasBudgetMatch&&<p className="care-empty-budget">None of these fictional plans fits the entered premium budget. The comparison does not select an affordable option where none exists.</p>}
          <p className="care-calculation"><strong>{insurance.selectedPlan.name.replace('Example ','')}:</strong> {insurance.selectedPlan.calculation}</p>
          <div className="care-provider-heading"><h3>Providers for this sample plan</h3><details className="care-provider-filters"><summary>Travel & language <ChevronDown size={16}/></summary><div><label>Travel limit (miles)<input type="number" min="1" max="25" value={state.preferences.maxTravelMiles} onChange={e=>dispatch({type:'setPreferences',preferences:{maxTravelMiles:Math.min(25,Math.max(1,Number(e.target.value)))}})}/></label><label>Preferred language<select value={state.preferences.preferredLanguage} onChange={e=>dispatch({type:'setPreferences',preferences:{preferredLanguage:e.target.value}})}><option>English</option><option>Spanish</option></select></label></div></details></div>
          <div className="care-providers">{insurance.providers.map(provider=><div key={provider.id}><span className="care-provider-avatar">{provider.name.split(' ').slice(0,2).map(s=>s[0]).join('')}</span><div><strong>{provider.name}</strong><p>{provider.specialty} · {provider.distanceMiles} miles</p><small>{provider.networkStatus==='sample_match'?'Listed in this fictional plan':'Outside this fictional plan'} · {provider.languages.join(', ')}</small></div><button className="care-button care-button-outline" onClick={()=>{dispatch({type:'selectProvider',providerId:provider.id});setStatus('Provider preference saved. The care team can see it; no booking was made.')}}>{state.selectedProviderId===provider.id?<><Check size={16}/>Saved</>:'Save preference'}</button></div>)}</div>
          <p className="care-muted">A synthetic preference model orders the examples. Costs use authored benefit schedules. Real eligibility, provider availability, and coverage remain unverified.</p>
        </section>}

        <details className="care-questions"><summary><span><MessageCircle size={19}/>Questions for the team {messages.length>0&&<b>{messages.length}</b>}</span><ChevronDown size={18}/></summary><div className="care-question-body">{messages.map(m=><article key={m.id}><strong>{roleName(m.actor as Role)}</strong><p>{m.detail}</p></article>)}{!messages.length&&<p className="care-muted">Questions stay attached to this journey and appear in the recipient’s view.</p>}<label>To<select value={recipient} onChange={e=>setRecipient(e.target.value as Role)}>{ROLES.filter(r=>r.id!=='employer'&&r.id!==role).map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label>Question<textarea aria-label="Question" value={message} onChange={e=>setMessage(e.target.value)} placeholder="What would help you take the next step?"/></label><button className="care-button" disabled={!message.trim()} onClick={sendMessage}>Share question <ArrowRight size={16}/></button></div></details>
      </>}
      <footer className="care-footer"><span>Synthure · A connected care prototype</span><p>Fictional examples. Changes stay in this session and clear on refresh. No messages, bookings, or payer requests leave this demo.</p></footer>
    </main>
  </div>
}
