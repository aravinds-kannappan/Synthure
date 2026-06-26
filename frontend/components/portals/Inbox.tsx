'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Inbox as InboxIcon, Send, ArrowRight, Megaphone, Zap } from 'lucide-react'
import { useEncounter } from './EncounterContext'
import { PORTALS, inboxFor, portalLabel, type Portal } from '@/lib/encounter'
import { STAKEHOLDERS } from '@/lib/synthure'

const timeAgo = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return `${m}m ago`
}

export default function Inbox({ portal, accent, tone = 'dark' }: { portal: Portal; accent: string; tone?: 'dark' | 'light' }) {
  const { state, dispatch } = useEncounter()
  const events = inboxFor(state, portal).slice(0, 6)
  const others = PORTALS.filter((p) => p !== portal)
  const [to, setTo] = useState<Portal>(others[0])
  const [body, setBody] = useState('')
  const light = tone === 'light'

  function send() {
    if (!body.trim()) return
    dispatch({ type: 'sendMessage', from: portal, to: [to], body })
    setBody('')
  }

  const card = light ? 'border-slate-200 bg-white' : 'border-white/[0.07] bg-white/[0.015]'
  const subText = light ? 'text-slate-500' : 'text-slate-500'
  const bodyText = light ? 'text-slate-600' : 'text-slate-300'

  return (
    <div className={`rounded-xl border ${card}`}>
      <div className={`flex items-center gap-2 border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wider ${light ? 'border-slate-200 text-slate-600' : 'border-white/[0.06] text-slate-400'}`}>
        <InboxIcon className="h-4 w-4" style={{ color: accent }} /> Cross portal activity
        <span className="ml-auto font-normal normal-case text-[11px] text-slate-400">{inboxFor(state, portal).length} items</span>
      </div>

      <div className="max-h-72 space-y-1.5 overflow-y-auto p-3">
        {events.length === 0 && (
          <p className={`px-1 py-2 text-[13px] ${subText}`}>Nothing yet. Actions in the other portals will show up here.</p>
        )}
        {events.map((e) => {
          const fromCfg = e.from === 'system' ? null : STAKEHOLDERS[e.from]
          const isMsg = e.kind === 'message'
          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className={`rounded-lg border p-2.5 ${light ? 'border-slate-200 bg-slate-50' : 'border-white/[0.05] bg-white/[0.02]'}`}
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                {isMsg ? (
                  <Megaphone className="h-3 w-3" style={{ color: fromCfg?.accent ?? accent }} />
                ) : e.from === 'system' ? (
                  <Zap className="h-3 w-3 text-slate-400" />
                ) : (
                  <ArrowRight className="h-3 w-3" style={{ color: fromCfg?.accent ?? accent }} />
                )}
                <span className="font-medium" style={{ color: fromCfg?.accent ?? (light ? '#475569' : '#94a3b8') }}>
                  {portalLabel(e.from)}
                </span>
                <span className={subText}>→ {e.to.map(portalLabel).join(', ')}</span>
                <span className={`ml-auto ${subText}`}>{timeAgo(e.ts)}</span>
              </div>
              <div className={`mt-1 text-[13px] font-medium ${light ? 'text-slate-800' : 'text-slate-200'}`}>
                {isMsg ? e.body : e.title}
              </div>
              {!isMsg && e.body && <div className={`mt-0.5 text-[12px] leading-snug ${bodyText}`}>{e.body}</div>}
            </motion.div>
          )
        })}
      </div>

      {/* Compose */}
      <div className={`border-t p-3 ${light ? 'border-slate-200' : 'border-white/[0.06]'}`}>
        <div className="mb-2 flex items-center gap-1.5 text-[11px]">
          <span className={subText}>Message</span>
          {others.map((p) => {
            const on = to === p
            const c = STAKEHOLDERS[p]
            return (
              <button
                key={p}
                onClick={() => setTo(p)}
                className="rounded-full border px-2 py-0.5 transition-colors"
                style={{
                  borderColor: on ? c.accent : light ? '#e2e8f0' : 'rgba(255,255,255,0.1)',
                  color: on ? c.accent : light ? '#64748b' : '#94a3b8',
                  background: on ? `${c.accent}14` : 'transparent',
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={`Send a note to the ${portalLabel(to).toLowerCase()} portal…`}
            className={`flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none ${
              light
                ? 'border-slate-200 bg-slate-50 text-slate-700 placeholder-slate-400 focus:border-teal-400'
                : 'border-white/[0.08] bg-[#070c18] text-slate-200 placeholder-slate-600 focus:border-white/20'
            }`}
          />
          <button
            onClick={send}
            disabled={!body.trim()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
            style={{ background: accent, color: '#05070f' }}
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </div>
      </div>
    </div>
  )
}
