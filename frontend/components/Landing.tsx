import Link from 'next/link'
import { ArrowUpRight, Building2, Check, FileText, HeartHandshake, Stethoscope, BriefcaseBusiness, Wallet, MapPin, MessageCircle } from 'lucide-react'
import Nav, { Logo } from './SiteNav'

const perspectives = [
  { name: 'Patient', detail: 'Know the next step.', icon: HeartHandshake, tone: 'patient' },
  { name: 'Clinician', detail: 'Keep the source close.', icon: Stethoscope, tone: 'clinician' },
  { name: 'Hospital', detail: 'Own the handoff.', icon: Building2, tone: 'hospital' },
  { name: 'Employer', detail: 'See group progress.', icon: BriefcaseBusiness, tone: 'employer' },
]

function ConnectedNote() {
  return <figure className="landing-note-visual" aria-label="One example clinical note connected to four care perspectives">
    <div className="landing-note-paper">
      <div className="landing-note-header"><span><FileText size={17}/>Clinical note</span><span>Example</span></div>
      <div className="landing-note-content"><span className="landing-note-label">ASSESSMENT</span><h2>Knee osteoarthritis</h2><span className="landing-note-label">THE NEXT STEP</span><p>Arrange a physical therapy assessment within 2 weeks.</p><div className="landing-note-source"><Check size={14}/>Context stays connected.</div></div>
    </div>
    <div className="landing-note-branch" aria-hidden="true"/>
    <div className="landing-role-grid">{perspectives.map(({ name, detail, icon: Icon, tone }) => <div className={`landing-role-card ${tone}`} key={name}><span className="landing-role-icon"><Icon size={20}/></span><div><strong>{name}</strong><p>{detail}</p></div></div>)}</div>
    <figcaption>One note. Four perspectives.<br/>Employer details stay at the group level.</figcaption>
  </figure>
}

export function SiteFooter() {
  return <footer className="site-footer"><div><Logo/><p>Clarity for the people.<br/>Connection for the journey.</p></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Synthure</span><span>Research prototype · Synthetic examples</span></div></footer>
}

export default function Landing() {
  return <div className="synthure-site"><Nav/><main>
    <section className="site-container landing-hero">
      <div className="landing-hero-copy"><span className="site-eyebrow">CARE, MADE CONNECTED</span><h1>One note.<br/>A clearer<br/><em>next step.</em></h1><p>Understand the care plan. Connect the people doing the work. Find care that fits the person.</p><Link className="site-button" href="/dashboard">Explore the dashboard <ArrowUpRight size={20}/></Link><span className="landing-hero-footnote">Start with a fictional example. No account needed.</span></div>
      <ConnectedNote/>
    </section>

    <section className="site-container landing-purpose">
      <div className="landing-section-heading"><span className="site-eyebrow">FOR THE SPACE BETWEEN VISITS</span><h2>Less guessing.<br/><em>More follow-through.</em></h2></div>
      <div className="landing-needs">
        <article><span className="landing-need-number">01 / UNDERSTAND</span><h3>Make care<br/>understandable.</h3><p>Read the plan, see where it came from, and ask about anything that still feels unclear.</p></article>
        <article><span className="landing-need-number">02 / COORDINATE</span><h3>Keep people<br/>in sync.</h3><p>Give each next step an owner. See the questions, tasks, and updates in one shared journey.</p></article>
        <article><span className="landing-need-number">03 / FIND THE FIT</span><h3>Find care<br/>that fits.</h3><p>Compare sample providers, plans, and spending around the person’s budget and access needs.</p></article>
      </div>
    </section>

    <section className="site-container landing-rehearsal-wrap"><div className="landing-rehearsal">
      <div><span className="site-eyebrow">TRY A DIFFERENT PATH</span><h2>Rehearse<br/><em>the next step.</em></h2><p>See what changes when cost, access, or understanding gets in the way—before moving the example journey forward.</p><span className="landing-rehearsal-note">A scenario to explore. Not a prediction.</span></div>
      <div className="landing-scenarios">
        <div><span><Wallet size={22}/></span><div><h3>“The cost is too much.”</h3><p>Compare spending trade-offs.</p></div></div>
        <div><span><MapPin size={22}/></span><div><h3>“My provider isn’t available.”</h3><p>Find a compatible option or an explicit gap.</p></div></div>
        <div><span><MessageCircle size={22}/></span><div><h3>“I’m not sure what to do.”</h3><p>Make clarification part of the handoff.</p></div></div>
      </div>
    </div></section>

    <section className="site-container landing-closing"><div><h2>The whole journey.<br/><em>One place to work.</em></h2><p>Move between four perspectives and watch a change carry through.</p></div><Link className="site-button" href="/dashboard">Open dashboard <ArrowUpRight size={20}/></Link></section>
  </main><SiteFooter/></div>
}
