'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, ClipboardCheck, Download, FileText, Heart, History, Layers3, LockKeyhole, MapPin, Network, Play, RotateCcw, ShieldCheck, Stethoscope, Users, Building2, X } from 'lucide-react'
import { BrandMark } from '@/components/SiteNav'
import { DEMO_JOURNEYS, createJourneyState } from '@/lib/journey'
import { createSyntheticPipelineSnapshot, type SyntheticPipelineSnapshot } from '@/lib/synthetic-pipeline'
import type { Stakeholder } from '@/lib/synthure'
import './dashboard.css'

const roles: { id: Stakeholder; label: string; icon: typeof Heart; color: string }[] = [
  { id: 'patient', label: 'Patient', icon: Heart, color: '#bade99' },
  { id: 'physician', label: 'Clinician', icon: Stethoscope, color: '#b8bcf2' },
  { id: 'hospital', label: 'Hospital', icon: Building2, color: '#8bcdd4' },
  { id: 'employer', label: 'Employer', icon: Users, color: '#d7b4d8' },
]
const steps = [
  { label: 'Source note', icon: FileText, detail: 'Load the selected fictional note and preserve the original text.' },
  { label: 'Linked context', icon: Layers3, detail: 'Locate exact source spans for the authored assessment, instructions, and service.' },
  { label: 'Four perspectives', icon: Users, detail: 'Prepare authored views for the patient, clinician, hospital, and employer.' },
  { label: 'Insurance fit', icon: ShieldCheck, detail: 'Run the synthetic preference ranker and exact fictional provider-network mapping.' },
  { label: 'Connected work', icon: Network, detail: 'Create task owners and open the selected care workspace with the same scenario.' },
]
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

export default function InteractiveDashboard() {
  const [scenario, setScenario] = useState(DEMO_JOURNEYS[0].id)
  const [snapshot, setSnapshot] = useState<SyntheticPipelineSnapshot | null>(null)
  const [selectedStep, setSelectedStep] = useState(0)
  const [activeRole, setActiveRole] = useState<Stakeholder>('patient')
  const [compare, setCompare] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [runs, setRuns] = useState<{ id: number; title: string; time: string; scenario: string }[]>([])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inspectorRef = useRef<HTMLElement>(null)
  const inspect = (step: number) => {
    setSelectedStep(step)
    if (window.innerWidth <= 1150) requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }))
  }
  const current = DEMO_JOURNEYS.find(j => j.id === scenario) ?? DEMO_JOURNEYS[0]
  const insurance = snapshot?.insurance ?? null
  const tasks = useMemo(() => snapshot ? createJourneyState(snapshot.journey).tasks : [], [snapshot])
  const report = snapshot?.reports[activeRole]
  const activeRoleLabel = roles.find(r => r.id === activeRole)!.label

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('scenario')
    if (DEMO_JOURNEYS.some(j => j.id === requested)) setScenario(requested!)
  }, [])
  useEffect(() => {
    if (sourceOpen && !dialogRef.current?.open) dialogRef.current?.showModal()
    if (!sourceOpen && dialogRef.current?.open) dialogRef.current?.close()
  }, [sourceOpen])

  const run = (id = scenario) => {
    const next = createSyntheticPipelineSnapshot(id)
    setSnapshot(next); setScenario(id); setSelectedStep(1); setCompare(false)
    setRuns(previous => [{ id: Date.now(), title: next.title, scenario: id, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }, ...previous].slice(0, 8))
  }
  const reset = () => { setSnapshot(null); setSelectedStep(0); setCompare(false); setActiveRole('patient') }
  const exportSample = () => {
    if (!snapshot || !insurance) return
    const payload = { mode: 'synthetic_demo', note: snapshot.note, reports: snapshot.reports, insurance: { selectedPlan: insurance.selectedPlan, providers: insurance.providers }, performed: snapshot.performedSteps, notPerformed: snapshot.notPerformed }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `synthure-${snapshot.id}-synthetic.json`; anchor.click(); URL.revokeObjectURL(url)
  }

  return <div className="ops-dashboard">
    <header className="ops-header"><Link href="/" className="ops-logo"><BrandMark/><strong>SYNTHURE</strong><span>// DASHBOARD</span></Link><span role="status" aria-live="polite" className={`ops-status ${snapshot ? 'ready' : ''}`}><i/>{snapshot ? 'SAMPLE READY' : 'READY TO EXPLORE'}</span><nav aria-label="Dashboard navigation"><Link href="/demo">Care workspace<ArrowUpRight size={12}/></Link><Link href="/insurance">Insurance</Link><Link href="/lab">Live model pipeline</Link><Link href="/observability">Run history</Link><Link href="/">Home</Link></nav></header>
    <div className="ops-mode"><span><span className="ops-mode-dot"/>SYNTHETIC DEMO</span><p>Authored clinical examples. Live local calculations and interactive workspaces. No API key needed.</p><Link href="/lab">Run the original clinical models<ArrowUpRight size={12}/></Link></div>
    <main className="ops-columns">
      <aside className="ops-note-rail"><div className="ops-section-title"><span>01 / INPUT</span><FileText size={14}/></div><h1>Start with a note.</h1><p className="ops-subtle">Choose a sample, run it, then inspect how the context connects.</p>
        <div className="ops-samples">{DEMO_JOURNEYS.map((j, i) => <button key={j.id} aria-pressed={scenario === j.id} onClick={() => {setScenario(j.id); reset()}}>{['Knee care', 'Blood pressure', 'Diabetes care'][i]}</button>)}</div>
        <label className="ops-note-label">Fictional clinical note<textarea value={current.note} readOnly spellCheck={false}/></label>
        <div className="ops-run-actions"><button className="ops-run" onClick={() => run()}><Play size={15}/>{snapshot ? 'RUN AGAIN' : 'RUN SAMPLE'}</button><button className="ops-icon-button" disabled={!snapshot} onClick={reset} aria-label="Reset dashboard"><RotateCcw size={15}/></button></div>
        <div className="ops-input-note"><LockKeyhole size={14}/><span>The sample stays in this browser. Use the care workspace to try a labelled note, or the live pipeline to run clinical models.</span></div>
        <div className="ops-note-links"><Link href="/demo">Try your own note<ArrowUpRight size={12}/></Link><button onClick={() => setSourceOpen(true)}>Expand source<ArrowUpRight size={12}/></button></div>
        <section className="ops-session"><div className="ops-section-title"><span>THIS SESSION</span><History size={14}/></div>{runs.length ? <ul>{runs.map((r, i) => <li key={`${r.id}-${i}`}><button onClick={() => run(r.scenario)}><span>{r.title}</span><small>{r.time}<RotateCcw size={11}/></small></button></li>)}</ul> : <p className="ops-subtle">Your sample runs will appear here. Replay any example without leaving the dashboard.</p>}</section>
      </aside>

      <section className="ops-center"><div className="ops-heading"><div><span className="ops-section-title">02 / THE CONNECTIONS</span><h2>One note. Every next step.</h2></div><div className="ops-summary-count"><strong>{snapshot ? '4' : '—'}</strong><span>connected views</span></div></div>
        <div className={`ops-flow ${snapshot ? 'populated' : ''}`} aria-label="Interactive processing steps">{steps.map((s, i) => {const Icon=s.icon; return <button key={s.label} onClick={() => inspect(i)} aria-pressed={selectedStep===i} className={selectedStep===i?'selected':''}><span className="ops-flow-icon"><Icon size={19}/>{snapshot && <i><Check size={9}/></i>}</span><span>{s.label}</span><small>{snapshot ? 'Inspect' : `0${i+1}`}</small></button>})}</div>
        <div className="ops-stage-description"><span>0{selectedStep+1}</span><p>{steps[selectedStep].detail}</p><span className="ops-stage-state">{snapshot ? (selectedStep === 3 ? 'Computed locally' : 'Sample loaded') : 'Waiting for sample'}</span></div>
        <div className="ops-portal-heading"><h2>Four perspectives</h2><button disabled={!snapshot} onClick={() => setCompare(!compare)} aria-pressed={compare}><Layers3 size={13}/>{compare ? 'Compact view' : 'Compare all'}</button></div>
        <div className={`ops-portals ${compare ? 'expanded' : ''}`}>{roles.map(r => {const Icon=r.icon, projection=snapshot?.reports[r.id]; return <article key={r.id} className={snapshot && activeRole===r.id?'active':''} style={{'--role-accent':r.color} as CSSProperties}><button className="ops-portal-button" disabled={!snapshot} onClick={() => {setActiveRole(r.id);inspect(2)}}><div className="ops-portal-top"><Icon size={18}/><strong>{r.label}</strong><span>{projection?'READY':'AWAITING NOTE'}</span></div><h3>{projection?.headline ?? ({patient:'Understand the plan.',physician:'Keep the clinical context.',hospital:'Coordinate the next step.',employer:'See the bigger picture.'}[r.id])}</h3><p>{projection?.summary ?? 'Run a sample to load this perspective.'}</p>{projection && <span className="ops-inspect-link">Inspect this view<ArrowRight size={13}/></span>}</button>{compare && projection && <div className="ops-compare-body">{projection.sections.slice(0,2).map(section=><div key={section.heading}><h4>{section.heading}</h4><p>{section.body}</p>{section.bullets && <ul>{section.bullets.map(b => <li key={b}>{b}</li>)}</ul>}</div>)}</div>}{snapshot && <Link className="ops-open-workspace" href={snapshot.roleLinks[r.id]}>Open {r.label.toLowerCase()} workspace<ArrowUpRight size={13}/></Link>}</article>})}</div>
        {snapshot && insurance ? <section className="ops-insurance-summary"><div><span className="ops-section-title">INSURANCE CONNECTION</span><h3>{insurance.selectedPlan.name}</h3><p>{insurance.providers.filter(p=>p.networkStatus==='sample_match').length} fictional network matches · {insurance.input.expectedVisits} example visits · {money(insurance.selectedPlan.totalAnnualCost)} annual scenario</p></div><Link href={`/insurance?scenario=${snapshot.id}`}>Adjust preferences<ArrowUpRight size={15}/></Link></section> : <section className="ops-empty"><Network size={25}/><h3>The dashboard comes alive with your sample.</h3><p>Run the note, click a stage, compare the views, and open a workspace to take the next action.</p><button onClick={() => run()}>Run this sample<ArrowRight size={14}/></button></section>}
        <div className="ops-footer-note"><LockKeyhole size={12}/>Employer output is aggregate-only. Source notes and individual clinical details stay in the care views.</div>
      </section>

      <aside ref={inspectorRef} className="ops-inspector"><div className="ops-section-title"><span>03 / INSPECT & EXPLORE</span><Layers3 size={14}/></div><h2>{steps[selectedStep].label}</h2>
        {!snapshot ? <div className="ops-inspector-empty"><FileText size={24}/><p>Run a sample to inspect the source, projections, calculations, and handoffs.</p></div> : <>
          {selectedStep===0 && <><p className="ops-inspector-caption">Exact authored source. No patient record was imported.</p><pre className="ops-source-preview">{snapshot.note}</pre></>}
          {selectedStep===1 && <><p className="ops-inspector-caption">Each fact links to the exact words in the sample note.</p><div className="ops-facts">{snapshot.entities.map((entity,i)=><button key={i} onClick={()=>setSourceOpen(true)}><span>{entity.type.replaceAll('_',' ')}</span><p>{entity.text}</p><small>See source<FileText size={10}/></small></button>)}</div></>}
          {selectedStep===2 && report && <><div className="ops-role-tabs">{roles.map(r=><button key={r.id} aria-pressed={activeRole===r.id} onClick={()=>setActiveRole(r.id)}>{r.label}</button>)}</div><div className="ops-report"><span className="ops-report-tag">AUTHORED {activeRoleLabel.toUpperCase()} VIEW</span><h3>{report.headline}</h3>{report.sections.map(section=><section key={section.heading}><h4>{section.heading}</h4><p>{section.body}</p>{section.bullets&&<ul>{section.bullets.map(b=><li key={b}>{b}</li>)}</ul>}</section>)}<Link href={snapshot.roleLinks[activeRole]}>Interact with this workspace<ArrowUpRight size={13}/></Link></div></>}
          {selectedStep===3 && insurance && <><p className="ops-inspector-caption">Synthetic model ranking with explicit cost arithmetic. No eligibility decision.</p><div className="ops-plan-list">{insurance.plans.map(p=><Link key={p.id} href={`/insurance?scenario=${snapshot.id}&plan=${p.id}`}><span>0{p.rank}<ShieldCheck size={14}/></span><div><strong>{p.name}</strong><p>{money(p.monthlyPremium)}/month · {money(p.totalAnnualCost)} annual scenario</p></div><ArrowUpRight size={13}/></Link>)}</div><h3 className="ops-small-heading">Example provider network</h3>{insurance.providers.map(p=><div className="ops-provider-row" key={p.id}><MapPin size={14}/><div><strong>{p.name}</strong><p>{p.distanceMiles} miles · {p.networkStatus==='sample_match'?'Sample-plan match':'Outside sample network'}</p></div></div>)}</>}
          {selectedStep===4 && <><p className="ops-inspector-caption">These tasks are created from the sample. Open a workspace to record progress and see it across roles.</p><div className="ops-task-list">{tasks.map(t=><Link key={t.id} href={`/demo?scenario=${snapshot.id}&visits=${insurance?.input.expectedVisits ?? 6}&role=${t.owner}`}><ClipboardCheck size={15}/><div><span>{t.owner.toUpperCase()} · TO DO</span><strong>{t.title}</strong><p>{t.due}</p></div><ArrowUpRight size={12}/></Link>)}</div></>}
          <details className="ops-model-boundary"><summary>What ran in this demo?</summary><ul>{snapshot.performedSteps.map(s=><li key={s}>{s}</li>)}</ul><p>{snapshot.disclaimer}</p><ul>{snapshot.notPerformed.map(s=><li key={s}>{s}</li>)}</ul><Link href="/lab">Open the actual model pipeline<ArrowUpRight size={12}/></Link></details>
          <button className="ops-export" onClick={exportSample}><Download size={14}/>Export synthetic session</button>
        </>}
      </aside>
    </main>
    <dialog aria-labelledby="ops-source-title" ref={dialogRef} onClose={()=>setSourceOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setSourceOpen(false)}} className="ops-source-dialog"><div><header><h2 id="ops-source-title">Fictional source note</h2><button onClick={()=>setSourceOpen(false)} aria-label="Close source note"><X size={18}/></button></header><pre>{snapshot?.note??current.note}</pre><p>This is an authored demonstration record, not a real patient’s chart.</p></div></dialog>
  </div>
}
