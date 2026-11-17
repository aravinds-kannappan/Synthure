'use client'

import { useCallback, useRef, useState } from 'react'
import { PIPELINE, type ExtractionResult, type SafetyResult, type Stakeholder, type StakeholderReport, type Synthesis, type Verification } from './synthure'
import { deidentify, extractEntities, loadAllModels, type DeidResult, type LoadProgress } from './openmed'
import { logEncounter } from './history'
import type { GuardrailReport } from './guardrails'
import type { HarnessReport } from './harness'
import { appendAudit } from './audit'
import { stopPipeline, type AgentStatus } from './pipelineState'

export type { AgentStatus } from './pipelineState'
export type Phase = 'idle' | 'loading-models' | 'running' | 'complete' | 'failed' | 'review-required'
export interface StageInfo { detail: string; ms: number }
export interface SynthesisState {
  phase: Phase
  modelProgress: Record<string, number>
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
  guardrails: GuardrailReport | null
  harness: HarnessReport | null
  live: boolean | null
  error: string | null
}
const initialState = (): SynthesisState => ({
  phase: 'idle', modelProgress: {}, status: Object.fromEntries(PIPELINE.map((a) => [a.id, 'idle'])),
  activeId: null, deid: null, stageInfo: {}, extraction: null, reports: {}, revised: [],
  verification: null, synthesis: null, safety: null, guardrails: null, harness: null, live: null, error: null,
})

export function useSynthesis() {
  const [state, setState] = useState<SynthesisState>(initialState)
  const runId = useRef(0)
  const modelsLoaded = useRef(false)
  const request = useRef<AbortController | null>(null)
  const reset = useCallback(() => {
    runId.current += 1
    request.current?.abort()
    setState(initialState())
  }, [])

  const start = useCallback(async (note: string) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const myRun = ++runId.current
    const alive = () => runId.current === myRun && !controller.signal.aborted
    setState({ ...initialState(), phase: modelsLoaded.current ? 'running' : 'loading-models' })
    const mark = (id: string, status: AgentStatus, detail?: string, ms?: number) => {
      if (!alive()) return
      setState((s) => ({ ...s, activeId: status === 'active' ? id : s.activeId,
        status: { ...s.status, [id]: status },
        stageInfo: detail == null ? s.stageInfo : { ...s.stageInfo, [id]: { detail, ms: ms ?? 0 } },
      }))
    }
    try {
      if (!modelsLoaded.current) {
        await loadAllModels((p: LoadProgress) => {
          if (alive()) setState((s) => ({ ...s, modelProgress: { ...s.modelProgress, [p.stage]: p.pct } }))
        })
        modelsLoaded.current = true
      }
      if (!alive()) return
      setState((s) => ({ ...s, phase: 'running' }))
      mark('deid', 'active')
      let started = Date.now()
      const deid = await deidentify(note)
      if (!alive()) return
      setState((s) => ({ ...s, deid }))
      mark('deid', 'done', `${deid.redactions} identifiers detected and masked on device`, Date.now() - started)
      mark('ner', 'active')
      started = Date.now()
      const entities = await extractEntities(deid.text)
      if (!alive()) return
      mark('ner', 'done', `${entities.length} entities extracted`, Date.now() - started)
      mark('rag', 'active')
      const res = await fetch('/api/synthesize', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ note: deid.text, entities, deid: { redactions: deid.redactions, types: deid.types } }),
      })
      if (!res.ok) {
        let message = `Request failed (${res.status})`
        try { message = ((await res.json()) as { error?: string }).error ?? message } catch { /* preserve HTTP error */ }
        throw new Error(message)
      }
      if (!res.body) throw new Error('No response stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let released = false
      let terminal = false
      let extraction: ExtractionResult | null = null
      const received = new Set<Stakeholder>()
      while (true) {
        const chunk = await reader.read()
        if (!alive()) { await reader.cancel(); return }
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (!line.startsWith('data: ')) continue
          const evt = JSON.parse(line.slice(6))
          switch (evt.type) {
            case 'stage': {
              const id = evt.id === 'spans' ? 'ner' : evt.id
              // A generated draft is not a released report.
              const isWriter = ['patient', 'physician', 'hospital', 'employer'].includes(id)
              mark(id, isWriter ? 'active' : 'done', evt.detail, evt.ms)
              break
            }
            case 'extracted':
              extraction = evt.extraction
              setState((s) => ({ ...s, extraction: evt.extraction }))
              break
            case 'release': released = true; break
            case 'report': {
              if (!released) throw new Error('The server sent an unreleased report')
              const report = evt.report as StakeholderReport
              received.add(report.stakeholder)
              setState((s) => ({ ...s, reports: { ...s.reports, [report.stakeholder]: report } }))
              mark(report.stakeholder, 'done')
              break
            }
            case 'verification':
              setState((s) => ({ ...s, verification: evt.verification }))
              mark('verify', 'done')
              break
            case 'safety':
              setState((s) => ({ ...s, safety: evt.safety }))
              mark('critic', 'done')
              break
            case 'guardrails': setState((s) => ({ ...s, guardrails: evt.guardrails })); mark('gate', 'done'); break
            case 'harness': setState((s) => ({ ...s, harness: evt.harness })); break
            case 'audit': await appendAudit(evt.audit).catch(() => {}); break
            case 'withheld':
              terminal = true
              setState((s) => ({ ...s, phase: 'review-required', activeId: null, reports: {}, error: evt.message,
                status: Object.fromEntries(Object.entries(s.status).map(([id, value]) => [id, value === 'done' ? 'done' : 'skipped'])),
              }))
              break
            case 'done':
              if (!released || evt.released !== true || received.size !== 4) throw new Error('The report bundle was not completely released')
              terminal = true
              if (extraction) { try { logEncounter(extraction) } catch { /* optional local history */ } }
              setState((s) => ({ ...s, phase: 'complete', activeId: null, live: !!evt.live,
                status: { ...s.status, synth: 'skipped' },
              }))
              break
            case 'error': throw new Error(evt.message || 'Synthesis failed')
          }
        }
      }
      if (!terminal) throw new Error('The synthesis stream ended before a final result')
    } catch (err) {
      if (!alive()) return
      setState((s) => ({ ...s, phase: 'failed', activeId: null, reports: {},
        error: err instanceof Error ? err.message : 'Synthesis failed', status: stopPipeline(s.status),
      }))
    }
  }, [])
  return { state, start, reset }
}
