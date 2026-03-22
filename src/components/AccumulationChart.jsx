import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

const PALETTE = [
  '#16a34a', '#2563eb', '#d97706', '#7c3aed',
  '#dc2626', '#0891b2', '#c2410c', '#65a30d',
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs dark:bg-gray-800 dark:border-gray-700">
      <p className="font-semibold text-gray-700 mb-1 dark:text-gray-200">
        Age {label}{label === retirementAge ? ' — Retirement' : ''}{real ? ' (real $)' : ''}
      </p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtY(p.value)}</p>
      ))}
      <p className="text-gray-500 mt-1 font-medium border-t border-gray-100 pt-1 dark:text-gray-400 dark:border-gray-700">
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

export default function AccumulationChart({ accounts, currentAge, retirementAge, inflation = 2.5, workingMarginalRate = 40, nonRegOrdinaryPct = 0, darkMode = false }) {
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
        <h3
          className="text-xs font-semibold text-gray-900 dark:text-gray-100 cursor-default"
          title={`Age ${currentAge} to ${retirementAge}`}
        >
          Accumulation Portfolio
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-700 font-semibold bg-brand-50 px-2.5 py-1 rounded-lg dark:text-brand-300 dark:bg-brand-900/20">
            At retirement: {fmtY(Math.round(displayTotal))}{real ? ' real' : ''}
          </span>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-xs dark:bg-gray-800">
            <button
              onClick={() => setReal(false)}
              className={`px-2.5 py-1 rounded-md transition-colors ${!real ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >Nominal</button>
            <button
              onClick={() => setReal(true)}
              className={`px-2.5 py-1 rounded-md transition-colors ${real ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
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
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
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
            stroke="#9ca3af"
            strokeDasharray="4 3"
            label={{ value: 'Retirement', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
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
