import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, FileText, HeartHandshake, LockKeyhole, Scale, GitBranch, FlaskConical } from 'lucide-react'
import Nav from '@/components/SiteNav'
import { SiteFooter } from '@/components/Landing'

export const metadata = {
  title: 'Our approach · Synthure',
  description: 'Source-linked care journeys, a trained synthetic preference demo, and the evidence still needed for real use.',
}

export default function ResearchPage() {
  return <div className="synthure-site"><Nav /><main className="site-container evidence-main">
    <Link className="eyebrow-link" href="/"><ArrowLeft size={13} />Back to Synthure</Link>
    <div className="site-eyebrow">OUR APPROACH</div>
    <h1>A connected journey.<br /><em>A clear source of truth.</em></h1>
    <p className="evidence-lede">Understand the care plan, see the next responsible person, and explore the trade-offs in finding care. Each view should make the evidence and the unanswered questions easier to see.</p>
    <div className="evidence-callout"><FlaskConical size={21} /><div><strong>A working prototype with fictional examples.</strong><p>The care workspace and preference demo run locally. Example notes, providers, and plans are synthetic. Their controls demonstrate decisions and handoffs; they do not book appointments, enroll someone in insurance, or submit claims.</p></div></div>

    <div className="evidence-grid">
      <article className="evidence-card"><FileText size={24} /><h2 style={{ marginTop: 18 }}>Keep the source close.</h2><p>Patient instructions point back to the original note. Medication directions stay as documented. Missing directions remain unknown, and custom notes become drafts for review.</p></article>
      <article className="evidence-card"><GitBranch size={24} /><h2 style={{ marginTop: 18 }}>Connect the handoffs.</h2><p>Patient, clinician, and care operations views share one local journey. Review requests, referral progress, and recorded authorization evidence update that state.</p></article>
      <article className="evidence-card"><Scale size={24} /><h2 style={{ marginTop: 18 }}>Explain the trade-offs.</h2><p>The workspace offers rule-based sample comparisons. The separate insurance demo uses a model trained on synthetic preferences. Neither establishes real eligibility, network participation, or a negotiated price.</p></article>
      <article className="evidence-card"><LockKeyhole size={24} /><h2 style={{ marginTop: 18 }}>Respect the boundaries.</h2><p>The employer view receives a separate aggregate projection, with no individual note, diagnosis, medication, or message. Role switching demonstrates the views; it is not authentication.</p></article>
    </div>

    <section className="evidence-section"><h2>Two matching paths, different evidence.</h2><div className="evidence-list">
      <div className="evidence-row"><strong>Trained synthetic demo</strong><span>A fitted preference-ranking model orders fictional plans after a monthly-budget check. Costs and provider matches come from authored tables; the model does not interpret raw clinical notes. Its labels come from a designed simulation policy. Held-out results measure how well it reproduces that policy, not how well it recommends insurance for real people. <Link className="text-link" href="/insurance">Explore the model<ArrowUpRight size={13} /></Link></span></div>
      <div className="evidence-row"><strong>Verified-data research kit</strong><span>The separate offline trainer requires permitted, reviewed real-world plan-preference examples. No verified dataset or trained model is supplied for that track. Training the synthetic demo does not change this status.</span></div>
      <div className="evidence-row"><strong>Clinical research</strong><span>The older extraction and coding models support a separate clinical research pipeline. Their historical benchmarks do not validate either insurance matching or the redesigned care journey.</span></div>
    </div></section>

    <section className="evidence-section"><h2>What starts with the note—and what needs more.</h2><div className="evidence-list">
      <div className="evidence-row"><strong>Clinical context</strong><span>Documented assessment, exact medication instructions, explicit next steps, and source text support a draft. They do not create new clinical advice.</span></div>
      <div className="evidence-row"><strong>Personal preferences</strong><span>Affordability, access, provider continuity, and other priorities come from the person. A preference can change a ranking without changing the clinical plan.</span></div>
      <div className="evidence-row"><strong>Insurance fit</strong><span>Real recommendations need actual available plans, current eligibility, covered benefits, verified networks, and service-specific prices. Synthetic comparison scores cannot supply those facts.</span></div>
      <div className="evidence-row"><strong>Operational completion</strong><span>A named owner and a recorded outcome help close a handoff. Local status changes demonstrate the workflow; real submission requires an external acknowledgment.</span></div>
    </div></section>
    <div className="evidence-callout"><HeartHandshake size={21} /><div><strong>“Not enough information” is a useful answer.</strong><p>When evidence cannot support a personal conclusion, Synthure should make the missing information and the next person to contact clear.</p></div></div>
    <div className="evidence-actions"><Link className="site-button" href="/journey">See the connected flow<ArrowUpRight size={17} /></Link><Link className="text-link" href="/insurance">Explore synthetic matching<ArrowUpRight size={16} /></Link><Link className="text-link" href="/evals">Review the evidence<ArrowUpRight size={16} /></Link></div>
  </main><SiteFooter /></div>
}
