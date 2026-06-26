'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { ReportSection } from '@/lib/synthure'

// ── Semicircle gauge (0–100) ──────────────────────────────────────────────────
export function Gauge({
  value,
  color,
  label,
  track = 'rgba(255,255,255,0.08)',
  size = 132,
}: {
  value: number
  color: string
  label?: string
  track?: string
  size?: number
}) {
  const r = 56
  const cx = 64
  const cy = 64
  const len = Math.PI * r
  const frac = Math.max(0, Math.min(100, value)) / 100
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 128 78" width={size} height={size * 0.61} aria-hidden>
        <path d={arc} fill="none" stroke={track} strokeWidth={11} strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={len}
          initial={{ strokeDashoffset: len }}
          animate={{ strokeDashoffset: len * (1 - frac) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>
          {Math.round(value)}%
        </text>
      </svg>
      {label && <div className="text-[11px] uppercase tracking-wider text-slate-500 -mt-1">{label}</div>}
    </div>
  )
}

// ── Sparkline with soft area fill ─────────────────────────────────────────────
export function Sparkline({ data, color, height = 56 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null
  const w = 240
  const h = height
  const pad = 6
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (d - min) / span) * (h - pad * 2)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L ${pts[0][0].toFixed(1)} ${h - pad} Z`
  const gid = `spark-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeInOut' }}
      />
    </svg>
  )
}

// ── Donut ring (single percent) ───────────────────────────────────────────────
export function Donut({ percent, color, label, sub }: { percent: number; color: string; label: string; sub?: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(100, percent)) / 100
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 84 84" width={84} height={84} aria-hidden>
        <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9} />
        <motion.circle
          cx={42}
          cy={42}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={c}
          transform="rotate(-90 42 42)"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        <text x={42} y={47} textAnchor="middle" fontSize="18" fontWeight="700" fill="#e2e8f0">
          {Math.round(percent)}%
        </text>
      </svg>
      <div>
        <div className="text-sm font-semibold text-white">{label}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ── Horizontal risk bar ───────────────────────────────────────────────────────
export function RiskBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-sm font-semibold" style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ── Collapsible "full written report" drawer ──────────────────────────────────
export function ReportDrawer({
  sections,
  accent,
  tone = 'dark',
}: {
  sections: ReportSection[]
  accent: string
  tone?: 'dark' | 'light'
}) {
  const [open, setOpen] = useState(false)
  if (!sections.length) return null
  const isLight = tone === 'light'
  return (
    <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-white/[0.07] bg-white/[0.015]'}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between px-4 py-3 text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}
      >
        <span>The agent’s full written report</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: accent }} />
      </button>
      {open && (
        <div className={`space-y-3 px-4 pb-4 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          {sections.map((sec, i) => (
            <div key={i} className={`rounded-lg border p-3.5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/[0.05] bg-white/[0.01]'}`}>
              <div className={`text-sm font-semibold mb-1 ${isLight ? 'text-slate-800' : 'text-white'}`}>{sec.heading}</div>
              <p className="text-[13px] leading-relaxed">{sec.body}</p>
              {sec.bullets && sec.bullets.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {sec.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2 text-[13px]">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full" style={{ background: accent }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
