'use client'

// The real backend, laid out as a stack. Each card is a layer that actually
// runs: on device extraction, the edge pipeline, the optional trained model
// service, the per run guardrails and audit, and the CI eval gate. Model ids are
// written without hyphens to match the rest of the product copy.

import { motion } from 'framer-motion'
import { Lock, Server, Cpu, ShieldCheck, GitBranch, ArrowRight } from 'lucide-react'

const STACK = [
  {
    id: 'browser', where: 'In your browser', tone: '#2dd4bf', Icon: Lock,
    title: 'On device extraction',
    items: [
      'openmed pii clinicale5 33m  ·  de identification',
      'openmed disease + pharma tinymed 65m  ·  NER',
    ],
    note: 'The raw note never leaves the device. Only de identified text is sent on.',
  },
  {
    id: 'edge', where: 'Edge function', tone: '#818cf8', Icon: Server,
    title: '/api/synthesize',
    items: [
      'constrained ICD linking  ·  reranker over the official index',
      'four portal writers  ·  claude haiku 4.5',
      'verifier, constitution critic, orchestrator  ·  claude sonnet 4.6',
    ],
    note: 'Streamed back to the browser as server sent events, stage by stage.',
  },
  {
    id: 'service', where: 'Model service', tone: '#22d3ee', Icon: Cpu,
    title: 'Trained coder',
    items: [
      'bi encoder retriever + cross encoder reranker',
      'cross encoder faithfulness scorer',
    ],
    note: 'A Hugging Face Space. When it is not wired in, the lexical linker runs instead.',
  },
  {
    id: 'guard', where: 'Every run', tone: '#f43f5e', Icon: ShieldCheck,
    title: 'Guardrails + audit',
    items: [
      '12 deterministic checks across 6 layers',
      'SHA 256 audit chain, replay verifiable',
      'selective prediction  ·  abstains below 0.60 confidence',
    ],
    note: 'The output is gated and sealed before it reaches a portal.',
  },
  {
    id: 'ci', where: 'On every PR', tone: '#34d399', Icon: GitBranch,
    title: 'Eval gate',
    items: [
      'provenance gate  ·  no number without a backing record',
      'regression gate  ·  no metric below its committed floor',
      'guardrail and harness red team graders',
    ],
    note: 'CI blocks a merge that would regress the evals.',
  },
]

export default function UnderTheHood() {
  return (
    <div className="mt-14 flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {STACK.map((s, i) => {
        const { Icon } = s
        return (
          <div key={s.id} className="flex flex-1 items-stretch gap-3">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-1 flex-col rounded-2xl border bg-white/[0.02] p-5"
              style={{ borderColor: `${s.tone}33`, borderTop: `2px solid ${s.tone}` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${s.tone}1a` }}>
                  <Icon className="h-4 w-4" style={{ color: s.tone }} />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: s.tone }}>{s.where}</span>
              </div>
              <div className="font-mono text-sm font-semibold text-white">{s.title}</div>
              <ul className="mt-3 space-y-1.5">
                {s.items.map((it) => (
                  <li key={it} className="font-mono text-[11px] leading-relaxed text-slate-400">{it}</li>
                ))}
              </ul>
              <p className="mt-auto pt-3 text-[11px] leading-relaxed text-slate-500">{s.note}</p>
            </motion.div>
            {i < STACK.length - 1 && (
              <div className="hidden items-center lg:flex">
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-600" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
