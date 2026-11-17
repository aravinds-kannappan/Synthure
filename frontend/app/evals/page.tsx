import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, FlaskConical } from 'lucide-react'
import Nav from '@/components/SiteNav'
import { SiteFooter } from '@/components/Landing'
import { evals, formatMetric, type EvalMetric } from '@/lib/evals'
import preferenceModel from '@/lib/insurance-demo-model.json'

export const metadata = {
  title: 'Research & evidence · Synthure',
  description: 'Synthetic preference-model measurements, historical clinical benchmarks, and clear limits on what they establish.',
}
const labels = { measured: 'Measured', deferred: 'Not yet measured', by_construction: 'Structural property' }
const caveat = (m: EvalMetric) => m.key === 'openmed.deid_recall'
  ? '90 seeded name spans in synthetic notes, scored by overlap. This is not evidence of complete identifier removal or validated privacy.'
  : m.caveat
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

export default function EvalsPage() {
  const training = preferenceModel.training
  const evaluation = preferenceModel.evaluation
  return <div className="synthure-site"><Nav /><main className="site-container evidence-main">
    <Link className="eyebrow-link" href="/research"><ArrowLeft size={13} />Our approach</Link>
    <div className="site-eyebrow">RESEARCH & EVIDENCE</div>
    <h1>Every number<br /><em>needs its context.</em></h1>
    <p className="evidence-lede">The preference demo has trained weights and a held-out synthetic evaluation. Historical clinical-model results are listed separately. Neither is evidence of improved outcomes for real patients.</p>

    <div className="evidence-callout"><FlaskConical size={22} /><div><strong>Trained on synthetic preferences. Not validated on real choices.</strong><p>The model learns a designed simulation policy over fictional plan scenarios. Its test cases are held out from training but use the same generation assumptions. Agreement with that policy is not insurance suitability, coverage accuracy, or a savings estimate.</p></div></div>
    <section className="evidence-section"><h2>The synthetic preference model.</h2><p>A pairwise linear ranker learns relative preferences between fictional plans. A deterministic budget check precedes ranking; costs and provider matches are calculated separately from authored tables. These values come directly from the shipped model artifact.</p>
      <table className="metric-table"><thead><tr><th>MEASURE</th><th>RESULT</th><th>CONTEXT</th></tr></thead><tbody>
        <tr><td>Training scenarios<small>{training.rows.toLocaleString()} fictional plan rows</small></td><td>{training.cases.toLocaleString()}</td><td><span className="metric-status measured">Synthetic</span></td></tr>
        <tr><td>Held-out scenarios<small>{evaluation.heldoutRows.toLocaleString()} fictional plan rows</small></td><td>{evaluation.heldoutCases.toLocaleString()}</td><td><span className="metric-status measured">Synthetic</span></td></tr>
        <tr><td>Top-ranked policy agreement<small>How often the ranking pipeline, including its budget check, agrees with the simulation policy.</small></td><td>{percent(evaluation.top1PolicyAgreement)}</td><td><span className="metric-status measured">Synthetic only</span></td></tr>
        <tr><td>Pairwise policy agreement<small>Learned-score ordering across {evaluation.heldoutPairs.toLocaleString()} held-out pairs; budget ordering is excluded.</small></td><td>{percent(evaluation.pairwisePolicyAgreement)}</td><td><span className="metric-status measured">Synthetic only</span></td></tr>
      </tbody></table>
      <div className="evidence-list"><div className="evidence-row"><strong>What it shows</strong><span>The training and browser inference path work, and the model can be checked against its simulated preference labels. Scores rank examples; they are not probabilities of coverage or personal suitability.</span></div><div className="evidence-row"><strong>What it cannot show</strong><span>Real patient preferences, current plan availability, provider quality, coverage determinations, clinical safety, or prospective savings. New synthetic cases do not replace independent real-world evaluation.</span></div><div className="evidence-row"><strong>Verified-data track</strong><span>The separate insurance research trainer remains untrained on verified data. It requires permitted, reviewed preferences and independent evaluation before a real-use claim.</span></div></div>
      <Link className="text-link" href="/insurance">Explore the synthetic model<ArrowUpRight size={16} /></Link>
    </section>

    <section className="evidence-section"><h2>Historical clinical-model benchmarks.</h2><p>The records below predate this redesign and were not remeasured for the new experience. They do not evaluate the preference demo, patient understanding, or referral completion.</p><div className="evidence-list"><div className="evidence-row"><strong>Clinical coding</strong><span>The neural coder benchmark measures mention-to-code ranking on translated CodiEsp cases. It does not establish that an entire encounter is correctly coded.</span></div><div className="evidence-row"><strong>Synthetic evaluation</strong><span>Shared note and label generation limits the value of template-generated results as estimates of real clinical performance.</span></div><div className="evidence-row"><strong>Automated safeguards</strong><span>Deterministic adversarial tests check specific failure modes. Passing those cases does not establish that all clinical errors are prevented.</span></div></div></section>
    {evals.groups.map(group => <details className="metric-group" key={group.id}><summary>{group.title}<span>{group.metrics.length} records</span></summary><p>{group.blurb}</p><table className="metric-table"><thead><tr><th>MEASURE</th><th>RESULT</th><th>STATUS</th></tr></thead><tbody>{group.metrics.map(m => <tr key={m.key}><td>{m.label}<small>{evals.datasets[m.dataset]?.name}{m.n != null ? ` · N = ${m.n.toLocaleString()}` : ''}</small>{caveat(m) && <small>{caveat(m)}</small>}</td><td>{formatMetric(m)}</td><td><span className={`metric-status ${m.kind}`}>{labels[m.kind]}</span></td></tr>)}</tbody></table></details>)}
    <section className="evidence-section"><h2>The next useful measurements.</h2><p>Patient teach-back accuracy. Unresolved handoffs. Staff time per completed referral. Confirmed provider availability. Estimate error against actual responsibility. These outcomes should determine whether the experience is useful beyond a simulation.</p></section>
    <div className="evidence-actions"><Link className="site-button" href="/journey">See the connected flow<ArrowUpRight size={17} /></Link><Link className="text-link" href="/demo">Open the care workspace<ArrowUpRight size={16} /></Link><Link className="text-link" href="/research">How it works<ArrowUpRight size={16} /></Link></div>
  </main><SiteFooter /></div>
}
