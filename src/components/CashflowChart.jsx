import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label, real, rowsByAge }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  const row   = rowsByAge?.[label]
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs dark:bg-slate-800 dark:border-slate-700">
      <p className="font-semibold text-slate-700 mb-1 dark:text-slate-200">Age {label}{real ? ' (real $)' : ''}</p>
      {payload.map(p => p.value > 0 && (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtY(p.value)}
        </p>
      ))}
      {row?.oasClawback > 0 && (
        <p className="text-red-500">OAS Clawback: −{fmtY(row.oasClawback)}</p>
      )}
      <p className="text-slate-500 mt-1 font-medium border-t border-slate-100 pt-1">
        Total: {fmtY(total)}
      </p>
    </div>
  )
}

export default function CashflowChart({ rows, inflation = 2.5, retirementAge, rrifExhaustedAge = null, darkMode = false }) {
  const [real, setReal] = useState(false)

  if (!rows?.length) return null

  const inf = inflation / 100

  // Index rows by age for tooltip lookup
  const rowsByAge = Object.fromEntries(rows.map(r => [r.age, r]))

  const data = rows.map(r => {
    const deflate = real ? 1 / Math.pow(1 + inf, r.age - retirementAge) : 1
    const d = v => Math.round(v * deflate)

    const cpp       = d(r.cpp)
    const oas       = d(r.oas)          // net of clawback
    const dbPension = d(r.dbPension)
    const other     = d(r.otherPension)
    const tax       = d(r.totalTax)
    const netIncome = d(r.netIncome)

    const govNet       = cpp + oas + dbPension + other
    const portfolioNet = Math.max(0, netIncome - govNet)

    return {
      age: r.age,
      'Portfolio W/D': portfolioNet,
      'CPP':           cpp,
      'OAS':           oas,
      'DB Pension':    dbPension,
      'Other Pension': other,
      'Tax Paid':      tax,
    }
  })

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Annual Cashflow</h3>
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
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip real={real} rowsByAge={rowsByAge} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Portfolio W/D" fill="#16a34a" stackId="a" radius={[0,0,0,0]} />
          <Bar dataKey="CPP"           fill="#2563eb" stackId="a" />
          <Bar dataKey="OAS"           fill="#0891b2" stackId="a" />
          <Bar dataKey="DB Pension"    fill="#7c3aed" stackId="a" />
          <Bar dataKey="Other Pension" fill="#a78bfa" stackId="a" />
          <Bar dataKey="Tax Paid"      fill="#f59e0b" stackId="a" />
          {rrifExhaustedAge && (
            <ReferenceLine
              x={rrifExhaustedAge}
              stroke="#f97316"
              strokeDasharray="4 3"
              label={{ value: `RRIF $0 (${rrifExhaustedAge})`, position: 'insideTopRight', fontSize: 10, fill: '#f97316' }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
