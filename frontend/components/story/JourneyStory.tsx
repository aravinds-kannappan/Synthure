'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, CheckCheck, ChevronLeft, ChevronRight, FileText, Heart, LockKeyhole, MapPin, Pause, Play, RotateCcw, ShieldCheck, Stethoscope, Building2 } from 'lucide-react'
import Nav, { BrandMark } from '@/components/SiteNav'
import { SiteFooter } from '@/components/Landing'
import { DEMO_JOURNEYS, type Role } from '@/lib/journey'
import './story.css'

const stages = [
  { name: 'The note', eyebrow: '01 / THE STARTING POINT', title: 'One note. The context that matters.', detail: 'The assessment, medication instructions, and next step stay linked to the words the clinician documented.', icon: FileText, role: null },
  { name: 'Patient', eyebrow: '02 / UNDERSTANDING', title: 'A plan someone can follow.', detail: 'Turn the visit into a clear next step. Keep the original instructions close, and invite the patient to explain their plan in their own words.', icon: Heart, role: 'patient' },
  { name: 'Clinician', eyebrow: '03 / CLINICAL CONTINUITY', title: 'The handoff keeps its context.', detail: 'The clinician sees the source, the patient’s questions, and the requested service together. Review becomes a shared event.', icon: Stethoscope, role: 'clinician' },
  { name: 'Hospital', eyebrow: '04 / CARE & COVERAGE', title: 'Find a path through the practical details.', detail: 'The requested service connects to provider options, sample insurance benefits, and a task with a clear owner.', icon: Building2, role: 'hospital' },
  { name: 'Employer', eyebrow: '05 / THE BIGGER PICTURE', title: 'See the pattern. Protect the person.', detail: 'The employer sees aggregate navigation signals across a fictional cohort. The note, medications, and personal messages stay out of that view.', icon: BriefcaseBusiness, role: 'employer' },
] as const
const samples = ['Knee care', 'Blood pressure', 'Diabetes care']

export default function JourneyStory({ initialScenario }: { initialScenario?: string }) {
  const [sample, setSample] = useState(() => Math.max(0, DEMO_JOURNEYS.findIndex(j => j.id === initialScenario)))
  const [stage, setStage] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const journey = DEMO_JOURNEYS[sample]
  const current = stages[stage]
  const CurrentIcon = current.icon

  useEffect(() => {
    if (!playing) return
    if (stage === stages.length - 1) { setPlaying(false); return }
    const timeout = window.setTimeout(() => setStage(s => s + 1), 4200)
    return () => window.clearTimeout(timeout)
  }, [playing, stage])

  const selectStage = (index: number) => { setStage(index); setPlaying(false) }
  const play = () => { if (stage === stages.length - 1) setStage(0); setPlaying(p => !p) }
  const sampleLink = (path: string, role?: Role) => `${path}?scenario=${encodeURIComponent(journey.id)}${role ? `&role=${role}` : ''}`
  const outputs = [
    { label: 'Patient', icon: Heart, title: 'Your next step', text: journey.nextSteps[0].detail, tag: 'A plain-language care plan', color: 'patient' },
    { label: 'Clinician', icon: Stethoscope, title: 'Review & handoff', text: journey.services[0].label, tag: 'Source + patient understanding', color: 'clinician' },
    { label: 'Hospital', icon: Building2, title: 'Care navigation', text: `${journey.services[0].specialty} · provider & plan mapping`, tag: 'Benefits and referral tasks', color: 'hospital' },
    { label: 'Employer', icon: BriefcaseBusiness, title: 'Population insight', text: 'Navigation progress across 25 fictional journeys.', tag: 'Aggregate only · no clinical text', color: 'employer' },
  ]
  const evidence = stage === 0 ? journey.conditions[0].evidence.text : stage === 1 ? journey.nextSteps[0].evidence.text : journey.services[0].evidence.text

  return <div className="synthure-site story-site"><Nav /><main>
    <section className="site-container story-intro">
      <div><Link href="/" className="eyebrow-link"><ArrowLeft size={13}/>Back to Synthure</Link><div className="site-eyebrow">FOLLOW THE NOTE</div><h1>A little context.<br/><em>A whole journey.</em></h1></div>
      <div className="story-intro-right"><span className="story-demo-label"><span/>INTERACTIVE SYNTHETIC DEMO</span><p>Watch one clinical note become four connected perspectives. Choose a step, or play the story.</p><button className="site-button" onClick={play}>{playing ? <Pause size={16}/> : <Play size={16}/>} {playing ? 'Pause the story' : stage === 4 ? 'Replay the story' : 'Play the story'}</button></div>
    </section>

    <section className="site-container story-experience" aria-label="Interactive note journey">
      <div className="story-toolbar"><div className="story-sample-options"><span>CHOOSE A NOTE</span>{samples.map((name, i) => <button key={name} aria-pressed={sample === i} onClick={() => { setSample(i); setStage(0); setPlaying(false) }}>{name}</button>)}</div><span className="story-local"><span/>RUNS LOCALLY</span></div>
      <div className={`story-canvas step-${stage} ${playing ? 'is-playing' : ''}`}>
        <div className="story-canvas-heading"><span>THE JOURNEY, CONNECTED</span><span>ONE SHARED CONTEXT / FOUR PERSPECTIVES</span></div>
        <div className="story-graph">
          <svg className="story-wires" viewBox="0 0 1000 390" preserveAspectRatio="none" aria-hidden="true"><path d="M250 195H420"/><path d="M420 195C480 195 460 90 540 90H620" className={stage >= 1 ? 'lit' : ''}/><path d="M420 195C550 195 650 90 810 90H865" className={stage >= 2 ? 'lit' : ''}/><path d="M420 195C480 195 460 300 540 300H620" className={stage >= 3 ? 'lit' : ''}/><path d="M420 195C550 195 650 300 810 300H865" className={stage >= 4 ? 'lit private-path' : ''}/></svg>
          <button className={`story-source ${stage === 0 ? 'active' : ''}`} onClick={() => selectStage(0)} aria-label="Show the source-note step"><div className="story-source-top"><FileText size={17}/><span>CLINICAL NOTE</span><span>01</span></div><div className="story-source-body"><span>OUTPATIENT FOLLOW-UP</span><h3>{journey.conditions[0].label}</h3><p><b>Assessment</b><mark>{journey.conditions[0].evidence.text}</mark></p><p><b>Next step</b>{journey.services[0].label}</p><div className="story-source-foot"><span/>Original source preserved</div></div><span className="story-paper-edge"/></button>
          <div className="story-engine"><div className="story-engine-orbit"/><BrandMark/><span>SHARED<br/>CONTEXT</span></div>
          <div className="story-destinations">{outputs.map((output, i) => { const Icon = output.icon; return <button key={output.label} onClick={() => selectStage(i + 1)} aria-pressed={stage === i + 1} className={`story-destination ${output.color} ${stage === i + 1 ? 'active' : ''} ${stage >= i + 1 ? 'arrived' : ''}`}><div className="story-destination-top"><span><Icon size={17}/>{output.label}</span>{stage >= i + 1 ? <Check size={14}/> : <span className="story-pending-dot"/>}</div><h3>{output.title}</h3><p>{output.text}</p><span className="story-destination-tag">{i === 3 ? <LockKeyhole size={11}/> : <CheckCheck size={11}/>} {output.tag}</span></button> })}</div>
        </div>
        <div className="story-canvas-footer"><span><LockKeyhole size={12}/>The employer branch receives an aggregate projection, never the note.</span><span>ILLUSTRATED FLOW · NO EXTERNAL TRANSMISSIONS</span></div>
      </div>

      <div className="story-timeline" aria-label="Journey steps">{stages.map((s, i) => { const Icon = s.icon; return <button key={s.name} onClick={() => selectStage(i)} className={`${i === stage ? 'active' : ''} ${i < stage ? 'complete' : ''}`} aria-current={i === stage ? 'step' : undefined}><span className="story-timeline-number">{i < stage ? <Check size={13}/> : `0${i + 1}`}</span><span><Icon size={14}/>{s.name}</span><i className={i === stage && playing ? 'progress' : ''}/></button> })}</div>
      <div className="story-transport"><button aria-label="Restart journey" onClick={() => { setStage(0); setPlaying(false) }}><RotateCcw size={14}/></button><span>STEP {stage + 1} OF 5</span><div><button aria-label="Previous step" disabled={stage === 0} onClick={() => selectStage(stage - 1)}><ChevronLeft size={17}/></button><button aria-label={playing ? 'Pause journey' : 'Play journey'} onClick={play}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button><button aria-label="Next step" disabled={stage === 4} onClick={() => selectStage(stage + 1)}><ChevronRight size={17}/></button></div></div>
    </section>

    <section className="site-container story-detail" aria-live="polite" aria-atomic="false">
      <div className="story-detail-copy" key={`copy-${stage}`}><span className="site-eyebrow"><CurrentIcon size={15}/>{current.eyebrow}</span><h2>{current.title}</h2><p>{current.detail}</p><Link className="text-link" href={stage === 3 ? sampleLink('/insurance') : sampleLink('/demo', (current.role ?? 'patient') as Role)}>{stage === 3 ? 'Try the insurance mapping' : `Open the ${current.role ?? 'patient'} workspace`}<ArrowUpRight size={17}/></Link></div>
      <div className="story-output-panel" key={`output-${stage}`}>
        {stage === 0 && <><div className="story-output-head"><FileText size={16}/>FROM DOCUMENT TO CONTEXT<span>3 linked fields</span></div><dl className="story-fields"><div><dt>Assessment</dt><dd>{journey.conditions[0].label}<span>Linked to source <Check size={12}/></span></dd></div><div><dt>Instructions</dt><dd>Medication directions preserved verbatim<span>No new dose inferred <Check size={12}/></span></dd></div><div><dt>Requested care</dt><dd>{journey.services[0].specialty}<span>{journey.nextSteps[0].due}</span></dd></div></dl></>}
        {stage === 1 && <><div className="story-output-head"><Heart size={16}/>A CLEARER NEXT STEP<span>Patient view</span></div><div className="story-patient-output"><span>YOUR CLINICIAN’S PLAN</span><p>{journey.nextSteps[0].detail}</p><div><span>Check understanding</span><strong>{journey.teachBack[0].question}</strong></div></div></>}
        {stage === 2 && <><div className="story-output-head"><Stethoscope size={16}/>A HANDOFF WITH CONTEXT<span>Clinician view</span></div><div className="story-handoff"><div><span className="story-mini-icon"><FileText size={20}/></span><span>Original note<strong>{journey.conditions[0].label}</strong></span></div><div className="story-handoff-line"><ArrowRight size={16}/><span>Review source + patient response</span></div><div><span className="story-mini-icon"><Building2 size={20}/></span><span>Coordination task<strong>{journey.services[0].specialty}</strong></span></div></div><div className="story-output-note">Shared status keeps the patient and care team connected.</div></>}
        {stage === 3 && <><div className="story-output-head"><ShieldCheck size={16}/>THE PRACTICAL PATH<span>Synthetic mapping</span></div><div className="story-mapping"><div><FileText size={19}/><span>Documented service<strong>{journey.services[0].specialty}</strong></span></div><ArrowRight size={16}/><div><ShieldCheck size={19}/><span>Insurance fit<strong>Benefits + preferences</strong></span></div><ArrowRight size={16}/><div><MapPin size={19}/><span>Provider shortlist<strong>Specialty + sample network</strong></span></div></div><Link className="story-inline-cta" href={sampleLink('/insurance')}>Change the preferences. Watch the match change.<ArrowUpRight size={17}/></Link></>}
        {stage === 4 && <><div className="story-output-head"><LockKeyhole size={16}/>ONLY THE BIGGER PICTURE<span>Illustrative cohort</span></div><div className="story-aggregate"><div className="story-people" aria-label="25 fictional people">{Array.from({length:25}, (_,i) => <span key={i} className={i < 17 ? 'ready' : ''}/>)}</div><div><strong>25</strong><span>fictional journeys</span><p>Individual context stays in care.<br/>Only group progress is shown here.</p></div></div><div className="story-privacy-tags"><span><LockKeyhole size={12}/>No clinical notes</span><span>No medications</span><span>No messages</span></div></>}
      </div>
      <div className="story-evidence"><span><FileText size={14}/>{stage === 4 ? 'DATA BOUNDARY' : 'SOURCE ANCHOR'}</span><p>{stage === 4 ? 'The employer view uses separate fictional cohort data. No source-note excerpt is passed to it.' : `“${evidence}”`}</p><button onClick={() => setShowNote(!showNote)} aria-expanded={showNote}>{showNote ? 'Hide' : 'Read'} the sample note<ChevronRight size={14}/></button></div>
      {showNote && <pre className="story-full-note">{journey.note}</pre>}
    </section>

    <section className="site-container story-next"><div><span className="site-eyebrow">NOW MAKE IT PERSONAL</span><h2>The same note.<br/><em>A different set of priorities.</em></h2><p>Adjust visit count, budget, and access preferences in the insurance demo. See the costs, the provider network, and the reasons behind each match.</p></div><Link className="site-button" href={sampleLink('/insurance')}>Try insurance mapping<ArrowUpRight size={18}/></Link></section>
  </main><SiteFooter/></div>
}
