'use client'

import { useCallback, useRef, useState } from 'react'
import {
  PIPELINE,
  type ExtractionResult,
  type SafetyResult,
  type Stakeholder,
  type StakeholderReport,
  type Synthesis,
  type Verification,
} from './synthure'

export type AgentStatus = 'idle' | 'active' | 'done'
export type Phase = 'idle' | 'running' | 'complete'

// Minimum on-screen time per agent so the orchestration reads as deliberate,
// not a flicker — real data is revealed the moment it arrives after this.
const MIN_MS: Record<string, number> = {
  intake: 550,
  ner: 750,
  rag: 700,
  risk: 650,
  patient: 850,
  physician: 800,
  hospital: 800,
  employer: 800,
  verify: 950,
  synth: 950,
  critic: 900,
  gate: 750,
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

export interface SynthesisState {
  phase: Phase
  status: Record<string, AgentStatus>
  activeId: string | null
  extraction: ExtractionResult | null
  reports: Partial<Record<Stakeholder, StakeholderReport>>
  verification: Verification | null
  synthesis: Synthesis | null
  safety: SafetyResult | null
  live: boolean | null
  error: string | null
}

const initialStatus = (): Record<string, AgentStatus> =>
  Object.fromEntries(PIPELINE.map((a) => [a.id, 'idle']))

export function useSynthesis() {
  const [state, setState] = useState<SynthesisState>({
    phase: 'idle',
    status: initialStatus(),
    activeId: null,
    extraction: null,
    reports: {},
    verification: null,
    synthesis: null,
    safety: null,
    live: null,
    error: null,
  })

  const runId = useRef(0)

  const reset = useCallback(() => {
    runId.current += 1
    setState({
      phase: 'idle',
      status: initialStatus(),
      activeId: null,
      extraction: null,
      reports: {},
      verification: null,
      synthesis: null,
      safety: null,
      live: null,
      error: null,
    })
  }, [])

  const start = useCallback(async (note: string) => {
    const myRun = ++runId.current
    setState({
      phase: 'running',
      status: initialStatus(),
      activeId: null,
      extraction: null,
      reports: {},
      verification: null,
      synthesis: null,
      safety: null,
      live: null,
      error: null,
    })

    // Readiness gates the sequential reveal waits on.
    const extractionReady = deferred<void>()
    const reportReady: Record<Stakeholder, Deferred<void>> = {
      patient: deferred<void>(),
      physician: deferred<void>(),
      hospital: deferred<void>(),
      employer: deferred<void>(),
    }
    const verifyReady = deferred<void>()
    const synthReady = deferred<void>()
    const safetyReady = deferred<void>()
    const allReady = deferred<void>()

    const alive = () => runId.current === myRun

    // ── Network: stream events into state + resolve readiness gates ──────────
    ;(async () => {
      try {
        const res = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note }),
        })
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`)
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let idx: number
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const line = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            if (!line.startsWith('data: ')) continue
            const evt = JSON.parse(line.slice(6))
            if (!alive()) return
            switch (evt.type) {
              case 'extracted':
                setState((s) => ({ ...s, extraction: evt.extraction }))
                extractionReady.resolve()
                break
              case 'report': {
                const r = evt.report as StakeholderReport
                setState((s) => ({ ...s, reports: { ...s.reports, [r.stakeholder]: r } }))
                reportReady[r.stakeholder].resolve()
                break
              }
              case 'verification':
                setState((s) => ({ ...s, verification: evt.verification }))
                verifyReady.resolve()
                break
              case 'synthesis':
                setState((s) => ({ ...s, synthesis: evt.synthesis }))
                synthReady.resolve()
                break
              case 'safety':
                setState((s) => ({ ...s, safety: evt.safety }))
                safetyReady.resolve()
                break
              case 'done':
                setState((s) => ({ ...s, live: !!evt.live }))
                allReady.resolve()
                break
              case 'error':
                throw new Error(evt.message || 'Synthesis failed')
            }
          }
        }
        // ensure gates release even if a stage was missing
        extractionReady.resolve()
        ;(['patient', 'physician', 'hospital', 'employer'] as Stakeholder[]).forEach((s) =>
          reportReady[s].resolve(),
        )
        verifyReady.resolve()
        synthReady.resolve()
        safetyReady.resolve()
        allReady.resolve()
      } catch (err) {
        if (!alive()) return
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Synthesis failed' }))
        extractionReady.resolve()
        ;(['patient', 'physician', 'hospital', 'employer'] as Stakeholder[]).forEach((s) =>
          reportReady[s].resolve(),
        )
        verifyReady.resolve()
        synthReady.resolve()
        safetyReady.resolve()
        allReady.resolve()
      }
    })()

    // ── Sequential agent driver ──────────────────────────────────────────────
    const gateFor = (id: string): Promise<void> => {
      if (id === 'verify') return verifyReady.promise
      if (id === 'synth') return synthReady.promise
      if (id === 'critic' || id === 'gate') return safetyReady.promise
      if (['patient', 'physician', 'hospital', 'employer'].includes(id))
        return reportReady[id as Stakeholder].promise
      return extractionReady.promise
    }

    for (const agent of PIPELINE) {
      if (!alive()) return
      setState((s) => ({ ...s, activeId: agent.id, status: { ...s.status, [agent.id]: 'active' } }))
      await Promise.all([sleep(MIN_MS[agent.id] ?? 700), gateFor(agent.id)])
      if (!alive()) return
      setState((s) => ({ ...s, status: { ...s.status, [agent.id]: 'done' } }))
    }

    await allReady.promise
    if (!alive()) return
    setState((s) => ({ ...s, phase: 'complete', activeId: null }))
  }, [])

  return { state, start, reset }
}
