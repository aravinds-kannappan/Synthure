'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const DEMO_DATA = [
  { bucket: '0-30',  total: 18450, count: 12 },
  { bucket: '31-60', total: 9200,  count: 7 },
  { bucket: '61-90', total: 4100,  count: 3 },
  { bucket: '90+',   total: 6800,  count: 2 },
]

const COLORS: Record<string, string> = {
  '0-30':  '#34d399',
  '31-60': '#fbbf24',
  '61-90': '#f97316',
  '90+':   '#f87171',
}

export default function ARAgingPage() {
  const [data] = useState(DEMO_DATA)
  const total = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-light text-slate-100 mb-2">AR Aging</h1>
      <p className="text-slate-400 text-sm mb-8">
        Total outstanding: <span className="text-slate-200 font-medium">${total.toLocaleString()}</span>
      </p>

      <div className="bg-[#0d1525] border border-slate-800 rounded-2xl p-6 mb-6">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis dataKey="bucket" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#0d1525', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0' }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Outstanding']}
            />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {data.map((d) => <Cell key={d.bucket} fill={COLORS[d.bucket]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {data.map((d) => (
          <div key={d.bucket} className="bg-[#0d1525] border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{d.bucket} days</p>
            <p className="text-xl font-light" style={{ color: COLORS[d.bucket] }}>${d.total.toLocaleString()}</p>
            <p className="text-xs text-slate-600 mt-1">{d.count} claims</p>
          </div>
        ))}
      </div>
    </div>
  )
}
