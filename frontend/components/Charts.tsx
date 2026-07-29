'use client'

// Small dependency-free chart primitives (SVG + framer-motion) shared by the
// evals, research, and landing pages. Everything animates in on mount.

import { motion } from 'framer-motion'

const TONES: Record<string, string> = {
  teal: '#2dd4bf',
  lime: '#b6f400',
  emerald: '#34d399',
  sky: '#38bdf8',
  blue: '#4d7cff',
  violet: '#a78bfa',
  amber: '#fbbf24',
  rose: '#fb7185',
  slate: '#94a3b8',
}

export interface BarItem {
  label: string
  value: number // 0..1 unless `max` given
  max?: number
  tone?: keyof typeof TONES
  note?: string
}

export function Bars({ items, format }: { items: BarItem[]; format?: (v: number) => string }) {
  const fmt = format ?? ((v: number) => `${Math.round(v * 100)}%`)
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => {
        const max = it.max ?? 1
        const frac = Math.max(0, Math.min(1, it.value / max))
        const color = TONES[it.tone ?? 'teal']
        return (
          <div key={it.label}>
            <div className="mb-1 flex items-baseline justify-between text-[12px]">
              <span className="text-slate-300">{it.label}</span>
              <span className="tabular-nums font-medium" style={{ color }}>{fmt(it.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                whileInView={{ width: `${frac * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: 'easeOut' }}
              />
            </div>
            {it.note && <div className="mt-0.5 text-[10px] text-slate-500">{it.note}</div>}
          </div>
        )
      })}
    </div>
  )
}

export function Gauge({ value, label, sub, tone = 'teal', size = 132 }: {
  value: number // 0..1
  label: string
  sub?: string
  tone?: keyof typeof TONES
  size?: number
}) {
  const color = TONES[tone]
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, value))
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - frac) }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="-mt-[calc(50%+2px)] flex flex-col items-center" style={{ height: 0 }}>
        <span className="text-2xl font-bold" style={{ color }}>{Math.round(frac * 100)}%</span>
      </div>
      <div className="mt-[calc(50%-14px)] text-center">
        <div className="text-[12px] font-medium text-slate-200">{label}</div>
        {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
      </div>
    </div>
  )
}

export function Sparkline({ points, tone = 'teal', height = 40, width = 160 }: {
  points: number[] // any scale
  tone?: keyof typeof TONES
  height?: number
  width?: number
}) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - ((p - min) / span) * height).toFixed(1)}`).join(' ')
  const color = TONES[tone]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      />
    </svg>
  )
}
