'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, ChevronRight, FileText, HeartHandshake, Info, MapPin, MessageCircle, Network, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Stethoscope, Wallet } from 'lucide-react'
import Nav from '@/components/SiteNav'
import { SiteFooter } from '@/components/Landing'
import { DEFAULT_INSURANCE_INPUT, INSURANCE_SCENARIOS, runInsuranceDemo, type InsuranceInput } from '@/lib/insurance-demo'
import './insurance.css'

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
const initialInput = (scenarioId?: string): InsuranceInput => {
  const scenario = INSURANCE_SCENARIOS.find((s) => s.id === scenarioId) ?? INSURANCE_SCENARIOS[0]
  return { ...DEFAULT_INSURANCE_INPUT, scenarioId: scenario.id, expectedVisits: scenario.defaultVisits }
}
const numeric = (raw: string, lo: number, hi: number, fallback: number) => {
  const number = Number(raw)
  return Number.isFinite(number) ? Math.max(lo, Math.min(hi, Math.round(number))) : fallback
}
const initials = (name: string) => name.split(' ').slice(0, 2).map((part) => part[0]).join('')

export default function InsuranceDemo({ initialScenario }: { initialScenario?: string }) {
  const [input, setInput] = useState<InsuranceInput>(() => initialInput(initialScenario))
  const [updateText, setUpdateText] = useState('Ready to explore. Change an input to see the comparison update.')
  const result = useMemo(() => runInsuranceDemo(input), [input])
  const { scenario, selectedPlan, recommendedPlan, plans, providers } = result
  const networkMatches = providers.filter((provider) => provider.networkStatus === 'sample_match').length
  // Only fictional scenario identifiers and comparison inputs cross routes.
  // Source notes, diagnoses, messages, and other clinical text are never encoded.
  const workspaceParams = new URLSearchParams({
    scenario: scenario.id,
    plan: selectedPlan.id,
    priority: result.input.priority,
    visits: String(result.input.expectedVisits),
    budget: String(result.input.monthlyBudget),
    distance: String(result.input.maxTravelMiles),
    language: result.input.preferredLanguage,
  })

  function change(patch: Partial<InsuranceInput>, message = 'Plan ranking, costs, and provider mapping updated.') {
    setInput((previous) => ({ ...previous, ...patch, selectedPlanId: null }))
    setUpdateText(message)
  }

  function selectPlan(planId: string) {
    setInput((previous) => ({ ...previous, selectedPlanId: planId }))
    const plan = plans.find((p) => p.id === planId)
    setUpdateText(`Showing the cost calculation and provider network for ${plan?.name ?? 'the selected sample plan'}.`)
  }

  return <div className="synthure-site insurance-page"><Nav />
    <main className="insurance-main">
      <div className="ins-hero"><div><div className="ins-label"><span className="ins-dot" />CARE & COVERAGE EXPLORER</div><h1>Connect what you need<br />with <em>what fits your life.</em></h1><p>A note points to the next service. Your priorities shape the plan comparison. The selected plan changes which providers match. Try it with a fictional journey.</p></div><Link className="ins-hero-link" href={`/journey?scenario=${encodeURIComponent(scenario.id)}`}>Walk through the whole journey<ArrowUpRight size={14} /></Link></div>

      <div className="ins-scenarios" aria-label="Fictional care scenarios"><span className="ins-scenario-caption">Start with a sample</span>{INSURANCE_SCENARIOS.map((s, index) => <button key={s.id} className="ins-scenario" aria-pressed={s.id === scenario.id} onClick={() => change({ scenarioId: s.id, expectedVisits: s.defaultVisits }, 'New fictional note selected. The service, costs, and provider specialty have updated.')}><FileText />{['Knee care', 'Blood pressure', 'Diabetes care'][index] ?? s.condition}</button>)}<span className="ins-badge"><Sparkles size={10} />Synthetic demo</span></div>

      <div className="ins-workspace">
        <aside className="ins-input-column" aria-label="Scenario and personal preferences">
          <section className="ins-note-card"><div className="ins-label"><FileText size={12} />THE STARTING POINT</div><h2>{scenario.condition}</h2><p>{scenario.description}</p><div className="ins-note-service"><span>Documented next service</span><strong>{scenario.serviceLabel}</strong></div><details key={scenario.id}><summary>Read the fictional source note</summary><pre>{scenario.note}</pre></details></section>

          <section className="ins-panel"><div className="ins-panel-head"><h2><SlidersHorizontal />What matters to you</h2><span className="ins-badge ins-badge-muted">Live inputs</span></div><div className="ins-panel-body">
            <label className="ins-field">My priority<select value={input.priority} onChange={(e) => change({ priority: e.target.value as InsuranceInput['priority'] })}><option value="balanced">Balance cost and protection</option><option value="lowest_premium">Lower monthly premiums</option><option value="predictable_cost">Protection from large costs</option></select></label>
            <label className="ins-field"><span>Monthly premium budget<strong>{money(input.monthlyBudget)}</strong></span><input aria-label="Monthly premium budget" type="range" min={0} max={600} step={25} value={input.monthlyBudget} onChange={(e) => change({ monthlyBudget: numeric(e.target.value, 0, 600, 250) })} /><small>Only the premium budget. Other care costs are shown separately.</small></label>
            <div className="ins-input-pair"><label className="ins-field">Example visits / year<input type="number" min={0} max={36} step={1} value={input.expectedVisits} onChange={(e) => change({ expectedVisits: numeric(e.target.value, 0, 36, scenario.defaultVisits) })} /></label><label className="ins-field">Travel limit (miles)<input type="number" min={1} max={25} step={1} value={input.maxTravelMiles} onChange={(e) => change({ maxTravelMiles: numeric(e.target.value, 1, 25, 10) })} /></label></div>
            <label className="ins-field">Preferred language<select value={input.preferredLanguage} onChange={(e) => change({ preferredLanguage: e.target.value })}><option>English</option><option>Spanish</option></select></label>
          </div><button className="ins-reset" onClick={() => { setInput(initialInput(scenario.id)); setUpdateText('Preferences reset for this fictional scenario.') }}><RotateCcw />Reset preferences</button></section>
        </aside>

        <div className="ins-results">
          <section className="ins-mapping" aria-label="How this note maps to a service, plan, and providers">
            <div className="ins-map-node"><span><FileText />01 / Note</span><strong>{scenario.condition}</strong></div>
            <div className="ins-map-node"><span><Stethoscope />02 / Service</span><strong>{scenario.specialty}</strong></div>
            <div className="ins-map-node"><span><ShieldCheck />03 / Plan</span><strong>{selectedPlan.name.replace('Example ', '')}</strong></div>
            <div className="ins-map-node"><span><Network />04 / Providers</span><strong>{networkMatches} exact sample-network {networkMatches === 1 ? 'match' : 'matches'}</strong></div>
          </section>

          <section aria-labelledby="ins-plans-title"><div className="ins-section-heading"><div><h2 id="ins-plans-title">See the trade-offs.</h2><p>Change a priority or choose a plan to explore what follows.</p></div><span>3 fictional benefit schedules</span></div>
            <div className="ins-plans">{plans.map((plan) => <article key={plan.id} className={`ins-plan ${selectedPlan.id === plan.id ? 'is-selected' : ''}`}><div className="ins-plan-top"><span className={`ins-badge ${plan.budgetFit ? '' : 'ins-badge-amber'}`}>{plan.budgetFit ? 'Within premium budget' : 'Above premium budget'}</span><span className="ins-plan-rank">0{plan.rank}</span></div><h3>{plan.name.replace('Example ', '')}</h3><p className="ins-plan-type">{plan.type}</p><div className="ins-plan-price">{money(plan.monthlyPremium)}<small> / month</small></div><div className="ins-plan-total">{money(plan.totalAnnualCost)} illustrative annual total</div><dl><div><dt>Care spending</dt><dd>{money(plan.estimatedCareCost)} / year</dd></div><div><dt>Deductible</dt><dd>{money(plan.deductible)}</dd></div><div><dt>In-network OOP limit</dt><dd>{money(plan.oopMax)}</dd></div><div><dt>Sample network</dt><dd>{plan.networkProviderCount} providers</dd></div></dl><ul className="ins-plan-reasons">{plan.reasons.slice(1, 3).map((reason) => <li key={reason}><Check />{reason}</li>)}</ul><button className="ins-select-plan" aria-pressed={selectedPlan.id === plan.id} onClick={() => selectPlan(plan.id)}>{selectedPlan.id === plan.id ? <><Check />Exploring this plan</> : <>Explore this plan<ArrowRight /></>}</button></article>)}</div>
            <div className="ins-explanation"><Info /><div><strong>{result.hasBudgetMatch ? `${recommendedPlan.name.replace('Example ', '')} ranks first in this scenario. ` : 'No sample plan fits this premium budget. '}</strong>{result.hasBudgetMatch ? 'Plans within budget come first; learned synthetic preference weights order the remaining trade-offs. Choose any card to inspect its exact fictional network and cost math.' : 'All options remain visible so you can compare the gap or adjust the budget. No budget-feasible fit is claimed.'}</div></div>
            <div className="ins-inline-status" role="status" aria-live="polite"><Check />{updateText}</div>
          </section>

          <section className="ins-panel" aria-labelledby="ins-cost-title"><div className="ins-panel-head"><h2 id="ins-cost-title"><Wallet />The cost, unpacked</h2><span className="ins-badge ins-badge-muted">{selectedPlan.name.replace('Example ', '')}</span></div><div className="ins-panel-body ins-costs"><div className="ins-cost-breakdown"><div><span>{money(selectedPlan.monthlyPremium)} premium × 12 months</span><strong>{money(selectedPlan.annualPremium)}</strong></div><div><span>{input.expectedVisits} example {scenario.specialty.toLowerCase()} visits</span><strong>{money(selectedPlan.estimatedCareCost)}</strong></div><div><span>Illustrative annual total</span><strong>{money(selectedPlan.totalAnnualCost)}</strong></div></div><div className="ins-cost-formula"><strong>Visible arithmetic</strong><p>{selectedPlan.calculation}</p></div></div></section>

          <section aria-labelledby="ins-providers-title"><div className="ins-section-heading"><div><h2 id="ins-providers-title">Connect the plan to care.</h2><p>{scenario.specialty} options for {selectedPlan.name.replace('Example ', '')}. Fictional listings, exact sample-plan IDs.</p></div><span>Network mapping updates live</span></div><div className="ins-provider-list">{providers.map((provider) => <article key={provider.id} className={`ins-provider ${provider.networkStatus === 'sample_match' ? '' : 'ins-provider-unmatched'}`}><div className="ins-provider-header"><div className="ins-provider-avatar">{initials(provider.name)}</div><div><h3>{provider.name}</h3><p>{provider.specialty}</p></div></div><span className={`ins-badge ${provider.networkStatus === 'sample_match' ? '' : 'ins-badge-amber'}`}><Network size={10} />{provider.networkStatus === 'sample_match' ? 'Listed in this sample network' : 'Outside this sample network'}</span><div className="ins-provider-facts"><span><MapPin />{provider.distanceMiles} miles</span><span><MessageCircle />{provider.languages.join(' / ')}</span></div><p className="ins-provider-detail">{provider.reasons.slice(1).join(' · ')}<br />{provider.nextAvailable.replace('Illustrative: ', 'Sample availability: ')}</p></article>)}{!providers.length && <div className="ins-provider-empty">No fictional provider is available for this specialty. A real provider directory would be needed to continue.</div>}</div></section>
        </div>
      </div>

      <details className="ins-model-details"><summary>How the matching works · model, inputs, and assumptions</summary><div className="ins-model-grid"><div><h3>A trained model for a fictional preference policy.</h3><p>{result.model.label}. It orders sample plans using cost, protection, exact fictional networks, and access preferences. The note supplies the service scenario; it does not establish insurance eligibility.</p><div className="ins-model-metrics"><span><strong>{result.model.trainingCases.toLocaleString()}</strong>Synthetic training cases</span><span><strong>{result.model.holdoutCases.toLocaleString()}</strong>Held-out synthetic cases</span><span><strong>{(result.model.heldoutSyntheticFidelity * 100).toFixed(1)}%</strong>Held-out authored-policy agreement</span></div><p>{result.model.disclaimer}</p><details><summary style={{ cursor: 'pointer', color: '#627f4f' }}>Inspect model features</summary><ul style={{ marginTop: 10 }}>{result.model.features.map((feature) => <li key={feature}>{feature}</li>)}</ul></details></div><div><h3>What the arithmetic and mapping assume.</h3><ul>{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul><p style={{ marginTop: 14 }}>The annual total excludes other services, prescriptions, subsidies, employer contributions, and out-of-network costs. Premiums plus the sample in-network maximum would be {money(selectedPlan.worstCaseAnnualCost)}; that is not a cap on every possible expense.</p></div></div></details>

      <section className="ins-bottom-link"><div><h2>A comparison is one part of the journey.</h2><p>See the patient, clinician, hospital, and employer perspectives connect around the same example.</p></div><Link href={`/journey?scenario=${encodeURIComponent(scenario.id)}`}>Follow the journey<ArrowUpRight size={15} /></Link></section>
      <div style={{ textAlign: 'center', marginTop: 20 }}><Link className="ins-hero-link" style={{ display: 'inline-flex', margin: 0 }} href={`/demo?${workspaceParams.toString()}`}>Open the full local workspace<ChevronRight size={13} /></Link></div>
    </main>
    <SiteFooter />
  </div>
}
