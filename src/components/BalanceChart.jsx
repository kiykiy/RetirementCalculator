import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const PALETTE = [
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
]

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label, real }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">Age {label}{real ? ' (real $)' : ''}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtY(p.value)}</p>
      ))}
      <p className="text-slate-500 mt-1 font-medium border-t border-slate-100 pt-1">
        Total: {fmtY(total)}
      </p>
    </div>
  )
}

export default function BalanceChart({ rows, accountMeta, inflation = 2.5, retirementAge }) {
  const [real, setReal] = useState(false)

  if (!rows?.length || !accountMeta?.length) return null

  const inf = inflation / 100

  const data = rows.map(r => {
    const deflate = real ? 1 / Math.pow(1 + inf, r.age - retirementAge) : 1
    const point = { age: r.age }
    accountMeta.forEach(acc => {
      point[acc.id] = Math.round((r.accountBalances?.[acc.id] ?? 0) * deflate)
    })
    return point
  })

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">Portfolio Balance by Account</h3>
        <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5 text-xs">
          <button
            onClick={() => setReal(false)}
            className={`px-2.5 py-1 rounded transition-colors ${!real ? 'bg-white shadow text-slate-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
          >Nominal</button>
          <button
            onClick={() => setReal(true)}
            className={`px-2.5 py-1 rounded transition-colors ${real ? 'bg-white shadow text-slate-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
          >Real</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
          <defs>
            {accountMeta.map((acc, i) => (
              <linearGradient key={acc.id} id={`grad_${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.8} />
                <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip real={real} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {accountMeta.map((acc, i) => (
            <Area
              key={acc.id}
              type="monotone"
              dataKey={acc.id}
              name={acc.name}
              stroke={PALETTE[i % PALETTE.length]}
              fill={`url(#grad_${acc.id})`}
              stackId="1"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
