'use client'

import { useCallback, useRef, useState } from 'react'
import {
  PIPELINE,
  type Entity,
  type ExtractionResult,
  type SafetyResult,
  type Stakeholder,
  type StakeholderReport,
  type Synthesis,
  type Verification,
} from './synthure'
import { deidentify, extractEntities, loadAllModels, type DeidResult, type LoadProgress } from './openmed'
import { logEncounter } from './history'

export type AgentStatus = 'idle' | 'active' | 'done'
export type Phase = 'idle' | 'loading-models' | 'running' | 'complete'

// Minimum on-screen time per stage so the reveal is readable; every stage still
// waits for its REAL completion event, so nothing is shown before it happened.
const MIN_MS: Record<string, number> = {
  deid: 500,
  ner: 500,
  rag: 550,
  risk: 500,
  patient: 700,
  physician: 650,
  hospital: 650,
  employer: 650,
  verify: 800,
  synth: 800,
  critic: 750,
  gate: 600,
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

export interface StageInfo {
  detail: string
  ms: number
}

export interface SynthesisState {
  phase: Phase
  modelProgress: Record<string, number> // model stage -> download pct
  status: Record<string, AgentStatus>
  activeId: string | null
  deid: DeidResult | null
  stageInfo: Record<string, StageInfo>
  extraction: ExtractionResult | null
  reports: Partial<Record<Stakeholder, StakeholderReport>>
  revised: Stakeholder[]
  verification: Verification | null
  synthesis: Synthesis | null
  safety: SafetyResult | null
  live: boolean | null
  error: string | null
}

const initialStatus = (): Record<string, AgentStatus> =>
  Object.fromEntries(PIPELINE.map((a) => [a.id, 'idle']))

const initialState = (): SynthesisState => ({
  phase: 'idle',
  modelProgress: {},
  status: initialStatus(),
  activeId: null,
  deid: null,
  stageInfo: {},
  extraction: null,
  reports: {},
  revised: [],
  verification: null,
  synthesis: null,
  safety: null,
  live: null,
  error: null,
})

export function useSynthesis() {
  const [state, setState] = useState<SynthesisState>(initialState())
  const runId = useRef(0)
  const modelsLoaded = useRef(false)

  const reset = useCallback(() => {
    runId.current += 1
    setState(initialState())
  }, [])

  const start = useCallback(async (note: string) => {
    const myRun = ++runId.current
    const alive = () => runId.current === myRun
    setState({ ...initialState(), phase: modelsLoaded.current ? 'running' : 'loading-models' })

    const fail = (msg: string) => {
      if (alive()) setState((s) => ({ ...s, error: msg }))
    }

    // ── 0) OpenMed models (browser download on first run, cached after) ──────
    if (!modelsLoaded.current) {
      try {
        await loadAllModels((p: LoadProgress) => {
          if (alive()) setState((s) => ({ ...s, modelProgress: { ...s.modelProgress, [p.stage]: p.pct } }))
        })
        modelsLoaded.current = true
      } catch (err) {
        fail(
          `The on device OpenMed models could not be loaded (${err instanceof Error ? err.message : 'unknown error'}). The pipeline cannot run without them.`,
        )
        return
      }
      if (!alive()) return
      setState((s) => ({ ...s, phase: 'running' }))
    }

    const mark = (id: string, st: AgentStatus) =>
      setState((s) => ({ ...s, activeId: st === 'active' ? id : s.activeId, status: { ...s.status, [id]: st } }))
    const info = (id: string, detail: string, ms: number) =>
      setState((s) => ({ ...s, stageInfo: { ...s.stageInfo, [id]: { detail, ms } } }))

    // ── 1) De-identification, on device. The raw note never leaves here. ─────
    mark('deid', 'active')
    let deid: DeidResult
    let t0 = Date.now()
    try {
      deid = await deidentify(note)
    } catch (err) {
      fail(`On device de identification failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }
    if (!alive()) return
    info('deid', `${deid.redactions} identifier${deid.redactions === 1 ? '' : 's'} scrubbed on device${deid.types.length ? ` (${deid.types.slice(0, 5).join(', ').toLowerCase()})` : ''}`, Date.now() - t0)
    setState((s) => ({ ...s, deid }))
    await sleep(MIN_MS.deid)
    mark('deid', 'done')

    // ── 2) Clinical NER, on device, real confidences. ─────────────────────────
    mark('ner', 'active')
    t0 = Date.now()
    let entities: Entity[]
    try {
      entities = await extractEntities(deid.text)
    } catch (err) {
      fail(`On device NER failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }
    if (!alive()) return
    info('ner', `${entities.length} entities extracted on device`, Date.now() - t0)
    await sleep(MIN_MS.ner)
    mark('ner', 'done')

    // ── 3) Server pipeline over the de-identified note. ───────────────────────
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
    const releaseAll = () => {
      extractionReady.resolve()
      ;(['patient', 'physician', 'hospital', 'employer'] as Stakeholder[]).forEach((s) => reportReady[s].resolve())
      verifyReady.resolve()
      synthReady.resolve()
      safetyReady.resolve()
      allReady.resolve()
    }

    ;(async () => {
      try {
        const res = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note: deid.text, entities, deid: { redactions: deid.redactions, types: deid.types } }),
        })
        if (!res.ok) {
          let msg = `Request failed (${res.status})`
          try {
            msg = ((await res.json()) as { error?: string }).error ?? msg
          } catch {
            /* keep status message */
          }
          throw new Error(msg)
        }
        if (!res.body) throw new Error('No response stream')
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
              case 'stage':
                info(evt.id === 'spans' ? 'ner' : evt.id, evt.detail, evt.ms)
                break
              case 'extracted':
                setState((s) => ({ ...s, extraction: evt.extraction }))
                try {
                  logEncounter(evt.extraction)
                } catch {
                  /* history is a nice-to-have */
                }
                extractionReady.resolve()
                break
              case 'report': {
                const r = evt.report as StakeholderReport
                setState((s) => ({
                  ...s,
                  reports: { ...s.reports, [r.stakeholder]: r },
                  revised: evt.revised && !s.revised.includes(r.stakeholder) ? [...s.revised, r.stakeholder] : s.revised,
                }))
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
        releaseAll()
      } catch (err) {
        if (!alive()) return
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Synthesis failed' }))
        releaseAll()
      }
    })()

    // ── Sequential stage reveal, gated on real completion events. ────────────
    const gateFor = (id: string): Promise<void> => {
      if (id === 'verify') return verifyReady.promise
      if (id === 'synth') return synthReady.promise
      if (id === 'critic' || id === 'gate') return safetyReady.promise
      if (['patient', 'physician', 'hospital', 'employer'].includes(id))
        return reportReady[id as Stakeholder].promise
      return extractionReady.promise
    }

    for (const agent of PIPELINE) {
      if (agent.id === 'deid' || agent.id === 'ner') continue // already driven above
      if (!alive()) return
      mark(agent.id, 'active')
      await Promise.all([sleep(MIN_MS[agent.id] ?? 600), gateFor(agent.id)])
      if (!alive()) return
      mark(agent.id, 'done')
    }

    await allReady.promise
    if (!alive()) return
    setState((s) => ({ ...s, phase: 'complete', activeId: null }))
  }, [])

  return { state, start, reset }
}
