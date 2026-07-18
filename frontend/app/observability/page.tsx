'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ShieldCheck, ShieldX, AlertTriangle, Layers, RotateCcw, ArrowRight, TrendingUp, Lock, Cpu } from 'lucide-react'
import Nav from '@/components/Nav'
import { Bars, Gauge, Sparkline } from '@/components/Charts'
import { getRuns, clearRuns, type RunRecord } from '@/lib/runlog'
import { GUARDRAIL_CHECKS, checkLayer, type GuardLayer, type GuardSeverity } from '@/lib/guardrails'
import { getAudit, verifyAuditChain, clearAudit, type AuditEntry } from '@/lib/audit'

const HARNESS_ACTIONS = ['auto', 'human_review', 'abstain', 'block'] as const
const ACT_COLOR: Record<string, string> = { auto: '#34d399', human_review: '#a78bfa', abstain: '#fbbf24', block: '#f87171' }
const ACT_LABEL: Record<string, string> = { auto: 'Automated', human_review: 'Human review', abstain: 'Abstained', block: 'Blocked' }

const DECISIONS = ['ship', 'revise', 'escalate', 'block'] as const
const DEC_COLOR: Record<string, string> = { ship: '#34d399', revise: '#fbbf24', escalate: '#a78bfa', block: '#f87171' }
const SEV_COLOR: Record<GuardSeverity, string> = { blocking: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#94a3b8' }
const LAYERS: GuardLayer[] = ['input', 'grounding', 'policy', 'consistency', 'style', 'quality']
const checkWhat = (id: string) => GUARDRAIL_CHECKS.find((c) => c.id === id)?.what ?? id
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export default function ObservabilityPage() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [chain, setChain] = useState<{ ok: boolean; length: number; brokenAt: number | null } | null>(null)
  useEffect(() => { setRuns(getRuns()); setAudit(getAudit()) }, [])
  const verify = async () => setChain(await verifyAuditChain())

  const g = useMemo(() => {
    const guarded = runs.filter((r) => typeof r.guardrailScore === 'number')
    const n = guarded.length
    const scores = guarded.map((r) => r.guardrailScore as number)
    const decisions = Object.fromEntries(DECISIONS.map((d) => [d, guarded.filter((r) => r.guardrailDecision === d).length])) as Record<string, number>

    // Per check flag frequency across runs.
    const flagFreq = new Map<string, number>()
    for (const r of guarded) for (const id of r.guardrailFlags ?? []) flagFreq.set(id, (flagFreq.get(id) ?? 0) + 1)

    // Per layer: fraction of runs where that layer had zero flags.
    const layerClean = Object.fromEntries(LAYERS.map((l) => [l, 0])) as Record<GuardLayer, number>
    for (const r of guarded) {
      const flaggedLayers = new Set((r.guardrailFlags ?? []).map(checkLayer).filter(Boolean) as GuardLayer[])
      for (const l of LAYERS) if (!flaggedLayers.has(l)) layerClean[l] += 1
    }

    return {
      n,
      avgScore: mean(scores),
      shipRate: n ? decisions.ship / n : 0,
      blocked: decisions.block,
      decisions,
      scores,
      harnessActions: Object.fromEntries(HARNESS_ACTIONS.map((x) => [x, guarded.filter((r) => r.harnessAction === x).length])) as Record<string, number>,
      autoRate: (() => { const withH = guarded.filter((r) => r.harnessAction); return withH.length ? withH.filter((r) => r.harnessAction === 'auto').length / withH.length : 0 })(),
      hasHarness: guarded.some((r) => r.harnessAction),
      flagFreq: [...flagFreq.entries()].sort((a, b) => b[1] - a[1]),
      layerRate: Object.fromEntries(LAYERS.map((l) => [l, n ? layerClean[l] / n : 1])) as Record<GuardLayer, number>,
      avgCodes: mean(guarded.map((r) => r.codes)),
      avgEntities: mean(guarded.map((r) => r.entities)),
      trainedShare: (() => { const c = guarded.reduce((a, r) => a + r.codes, 0); const t = guarded.reduce((a, r) => a + r.trainedCodes, 0); return c ? t / c : 0 })(),
      avgReadiness: mean(guarded.filter((r) => r.readiness != null).map((r) => r.readiness as number)),
    }
  }, [runs])

  const reset = () => { clearRuns(); clearAudit(); setRuns([]); setAudit([]); setChain(null) }

  return (
    <div className="min-h-screen grid-bg text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle, #34d399, transparent 70%)' }} />
        <div className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, #818cf8, transparent 70%)' }} />
      </div>
      <Nav />

      <main className="relative mx-auto max-w-6xl px-6 pt-28 pb-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold">Agent quality and guardrails</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Every run in this browser is scored by the deterministic guardrail engine. This is the observability layer: how often the agent output is grounded, safe, and complete, and which checks catch what. No backend, no account, this browser only.
            </p>
          </div>
          {g.n > 0 && (
            <button onClick={reset} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400 transition-colors hover:text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Reset feed
            </button>
          )}
        </div>

        {g.n === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.015] p-12 text-center">
            <Activity className="mx-auto mb-3 h-6 w-6 text-slate-500" />
            <p className="text-slate-400">No runs yet in this browser.</p>
            <p className="mt-1 text-sm text-slate-500">The figures here aggregate real guardrail results across the notes you run.</p>
            <Link href="/demo" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-400 px-5 py-2.5 text-sm font-bold text-[#05070f] transition-colors hover:bg-teal-300">
              Run the demo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* Headline tiles */}
            <div className="grid gap-4 sm:grid-cols-4">
              <Tile label="Runs scored" value={String(g.n)} tone="#e2e8f0" />
              <Tile label="Avg safety score" value={`${Math.round(g.avgScore * 100)}%`} tone={g.avgScore > 0.9 ? '#34d399' : g.avgScore > 0.75 ? '#fbbf24' : '#f87171'} />
              <Tile label="Shipped clean" value={`${Math.round(g.shipRate * 100)}%`} tone="#34d399" sub="passed every layer" />
              <Tile label="Blocked" value={String(g.blocked)} tone={g.blocked ? '#f87171' : '#94a3b8'} sub="blocking violation caught" />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* Score trend + gauge */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <TrendingUp className="h-4 w-4 text-teal-300" /> Safety score over the last {g.n} run{g.n === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-6">
                  <Gauge value={g.avgScore} label="average" sub="weighted pass rate" tone="teal" />
                  <div className="flex-1">
                    <Sparkline points={g.scores.length > 1 ? g.scores : [g.scores[0] ?? 0, g.scores[0] ?? 0]} tone="teal" width={260} height={64} />
                    <div className="mt-1 text-[11px] text-slate-500">Each point is one run. Higher is safer.</div>
                  </div>
                </div>
              </div>

              {/* Decision distribution */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Guardrail decisions</div>
                <div className="space-y-2.5">
                  {DECISIONS.map((d) => {
                    const c = g.decisions[d]
                    const frac = g.n ? c / g.n : 0
                    return (
                      <div key={d}>
                        <div className="mb-1 flex items-baseline justify-between text-[12px]">
                          <span className="capitalize text-slate-300">{d}</span>
                          <span className="tabular-nums font-medium" style={{ color: DEC_COLOR[d] }}>{c} ({Math.round(frac * 100)}%)</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full transition-all" style={{ width: `${frac * 100}%`, background: DEC_COLOR[d] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* Per layer health */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Layers className="h-4 w-4 text-teal-300" /> Layer pass rate
                </div>
                <Bars items={LAYERS.map((l) => ({ label: l, value: g.layerRate[l], tone: g.layerRate[l] > 0.95 ? 'emerald' : g.layerRate[l] > 0.8 ? 'amber' : 'rose' }))} />
                <div className="mt-2 text-[11px] text-slate-500">Share of runs where the layer flagged nothing.</div>
              </div>

              {/* Most frequent findings */}
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <AlertTriangle className="h-4 w-4 text-amber-300" /> Most frequent findings
                </div>
                {g.flagFreq.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-3 text-[13px] text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> No findings across {g.n} run{g.n === 1 ? '' : 's'}. Every report passed every layer.
                  </div>
                ) : (
                  <Bars format={(v) => `${v} of ${g.n}`} items={g.flagFreq.slice(0, 8).map(([id, count]) => ({ label: id, value: count, max: g.n, tone: 'rose', note: checkWhat(id) }))} />
                )}
              </div>
            </div>

            {/* Harness decisions */}
            {g.hasHarness && (
              <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Cpu className="h-4 w-4 text-teal-300" /> Harness decisions
                  <span className="ml-auto font-normal normal-case text-slate-500">{Math.round(g.autoRate * 100)}% handled automatically</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  {HARNESS_ACTIONS.map((act) => {
                    const c = g.harnessActions[act]
                    return (
                      <div key={act} className="rounded-lg border px-3 py-2.5 text-center" style={{ borderColor: `${ACT_COLOR[act]}33`, background: `${ACT_COLOR[act]}0d` }}>
                        <div className="text-2xl font-bold tabular-nums" style={{ color: ACT_COLOR[act] }}>{c}</div>
                        <div className="text-[11px] text-slate-400">{ACT_LABEL[act]}</div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Auto = cleared every layer. Human review = high risk. Abstain = low confidence or coder disagreement. Block = policy violation.</p>
              </div>
            )}

            {/* Extraction / output richness */}
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <Tile label="Avg codes / note" value={g.avgCodes.toFixed(1)} tone="#22d3ee" />
              <Tile label="Avg entities / note" value={g.avgEntities.toFixed(1)} tone="#22d3ee" />
              <Tile label="Trained coder share" value={`${Math.round(g.trainedShare * 100)}%`} tone="#34d399" sub="codes linked by the model" />
              <Tile label="Avg model readiness" value={g.avgReadiness ? `${Math.round(g.avgReadiness * 100)}%` : 'n/a'} tone="#818cf8" />
            </div>
          </>
        )}

        {/* Immutable audit log */}
        <div className="mt-12 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Lock className="h-5 w-5 text-teal-300" />
            <h2 className="text-lg font-semibold text-white">Immutable audit log</h2>
            <span className="ml-auto flex items-center gap-2">
              {chain && (
                <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: chain.ok ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.12)', color: chain.ok ? '#34d399' : '#f87171' }}>
                  {chain.ok ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
                  {chain.ok ? `chain intact (${chain.length})` : `broken at #${chain.brokenAt}`}
                </span>
              )}
              <button onClick={verify} disabled={audit.length === 0} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-40">Verify integrity</button>
            </span>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Every run seals a record (evidence, model versions, prompts, and the harness decision) into a hash chain: each entry hashes the previous entry, so tampering with any earlier record is detectable by replaying the chain. In this demo it persists in your browser; in production the same records go to append only storage server side.
          </p>
          {audit.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-slate-500">No audit entries yet. Run the demo to seal one.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-white/[0.06]">
                    <th className="py-2 pr-3">#</th><th className="pr-3">note</th><th className="pr-3">decision</th><th className="pr-3">risk</th><th className="pr-3">guardrail</th><th className="pr-3">hash</th><th>links to</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-slate-400">
                  {audit.slice(-10).reverse().map((e) => (
                    <tr key={e.hash} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-3 text-slate-500">{e.seq}</td>
                      <td className="pr-3 font-sans text-slate-300">{e.noteType}</td>
                      <td className="pr-3" style={{ color: ACT_COLOR[e.harness.action] ?? '#94a3b8' }}>{e.harness.action}</td>
                      <td className="pr-3 font-sans">{e.harness.riskTier}</td>
                      <td className="pr-3 font-sans">{e.guardrail.decision} ({Math.round(e.guardrail.score * 100)}%)</td>
                      <td className="pr-3 text-teal-300/80">{e.hash.slice(0, 10)}…</td>
                      <td className="text-slate-600">{e.prevHash === '0'.repeat(64) ? 'genesis' : `${e.prevHash.slice(0, 8)}…`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* The guardrail suite (static, always present) */}
        <div className="mt-12 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-300" />
            <h2 className="text-lg font-semibold text-white">The guardrail suite</h2>
            <span className="ml-auto rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">12 of 12 red team cases pass</span>
          </div>
          <p className="mb-5 text-sm text-slate-400">
            Every run is checked by these deterministic layers before it is trusted. The suite itself is graded by a red team harness (run <span className="font-mono text-slate-300">npm run grade-guardrails</span>), so the checks are validated to fire on injected violations.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LAYERS.map((l) => {
              const checks = GUARDRAIL_CHECKS.filter((c) => c.layer === l)
              return (
                <div key={l} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">{l}</div>
                  <ul className="space-y-2">
                    {checks.map((c) => (
                      <li key={c.id} className="text-[12px] leading-relaxed text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-slate-500">{c.id}</span>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ background: `${SEV_COLOR[c.severity]}22`, color: SEV_COLOR[c.severity] }}>{c.severity}</span>
                        </div>
                        <div className="mt-0.5">{c.what}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}

function Tile({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums" style={{ color: tone }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}
