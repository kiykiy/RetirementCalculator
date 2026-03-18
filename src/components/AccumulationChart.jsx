import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

const PALETTE = [
  '#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
]

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label, retirementAge, real }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">
        Age {label}{label === retirementAge ? ' — Retirement' : ''}{real ? ' (real $)' : ''}
      </p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtY(p.value)}</p>
      ))}
      <p className="text-slate-500 mt-1 font-medium border-t border-slate-100 pt-1">
        Total: {fmtY(total)}
      </p>
    </div>
  )
}

function buildAccData(accounts, currentAge, retirementAge, inflation, real, workingMarginalRate, nonRegOrdinaryPct) {
  const balances     = accounts.map(a => a.balance)
  const inf          = inflation / 100
  const ordinaryFrac = (nonRegOrdinaryPct ?? 0) / 100
  const margRate     = (workingMarginalRate ?? 40) / 100
  const rows         = []

  for (let age = currentAge; age <= retirementAge; age++) {
    const deflate = real ? 1 / Math.pow(1 + inf, age - currentAge) : 1
    const point = { age }
    accounts.forEach((acc, i) => { point[acc.id] = Math.round(balances[i] * deflate) })
    rows.push(point)

    if (age < retirementAge) {
      accounts.forEach((acc, i) => {
        const returnAmt      = balances[i] * (acc.returnRate / 100)
        const afterTaxReturn = acc.taxType === 'nonreg'
          ? returnAmt * (1 - ordinaryFrac * margRate)
          : returnAmt
        balances[i] = balances[i] + afterTaxReturn + acc.annualContribution
      })
    }
  }
  return rows
}

export default function AccumulationChart({ accounts, currentAge, retirementAge, inflation = 2.5, workingMarginalRate = 40, nonRegOrdinaryPct = 0 }) {
  const [real, setReal] = useState(false)

  if (!accounts?.length || currentAge >= retirementAge) return null

  const data = buildAccData(accounts, currentAge, retirementAge, inflation, real, workingMarginalRate, nonRegOrdinaryPct)

  const ordinaryFrac = nonRegOrdinaryPct / 100
  const margRate     = workingMarginalRate / 100
  const nominalTotal = accounts.reduce((s, acc) => {
    const r          = acc.returnRate / 100
    const effectiveR = acc.taxType === 'nonreg' ? r * (1 - ordinaryFrac * margRate) : r
    const n          = retirementAge - currentAge
    const growth     = Math.pow(1 + effectiveR, n)
    const contribFV  = n > 0 && effectiveR > 0 ? acc.annualContribution * (growth - 1) / effectiveR : acc.annualContribution * n
    return s + acc.balance * growth + contribFV
  }, 0)

  const displayTotal = real
    ? nominalTotal / Math.pow(1 + inflation / 100, retirementAge - currentAge)
    : nominalTotal

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">
          Accumulation Phase — Age {currentAge} to {retirementAge}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-700 font-semibold bg-brand-50 border border-brand-100 px-2 py-1 rounded-md">
            At retirement: {fmtY(Math.round(displayTotal))}{real ? ' real' : ''}
          </span>
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
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
          <defs>
            {accounts.map((acc, i) => (
              <linearGradient key={acc.id} id={`accgrad_${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.8} />
                <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 11 }}
            label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }}
          />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip retirementAge={retirementAge} real={real} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            x={retirementAge}
            stroke="#64748b"
            strokeDasharray="4 3"
            label={{ value: 'Retirement', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }}
          />
          {accounts.map((acc, i) => (
            <Area
              key={acc.id}
              type="monotone"
              dataKey={acc.id}
              name={acc.name}
              stroke={PALETTE[i % PALETTE.length]}
              fill={`url(#accgrad_${acc.id})`}
              stackId="1"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
