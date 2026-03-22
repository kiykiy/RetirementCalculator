import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label, real }) {
  if (!active || !payload?.length) return null
  const floor = payload.find(p => p.dataKey === 'floor')?.value ?? 0
  const portfolio = payload.find(p => p.dataKey === 'portfolio')?.value ?? 0
  const total = floor + portfolio
  const floorPct = total > 0 ? Math.round(floor / total * 100) : 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs dark:bg-slate-800 dark:border-slate-700 space-y-0.5">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Age {label}{real ? ' (real $)' : ''}</p>
      <p className="text-emerald-600">Guaranteed income: {fmtY(floor)} ({floorPct}%)</p>
      <p className="text-blue-500">Portfolio withdrawal: {fmtY(portfolio)} ({100 - floorPct}%)</p>
      <p className="text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-1 mt-1">Total: {fmtY(total)}</p>
    </div>
  )
}

export default function IncomeFloorChart({ rows, retirementAge, inflation = 2.5, darkMode = false }) {
  const [real, setReal] = useState(false)

  if (!rows?.length) return null

  const gridClr = darkMode ? '#374151' : '#f3f4f6'
  const inf = inflation / 100

  const data = rows
    .filter(r => r.age >= retirementAge)
    .map(r => {
      const deflate = real ? 1 / Math.pow(1 + inf, r.age - retirementAge) : 1
      return {
        age: r.age,
        floor:     Math.round(((r.cpp ?? 0) + (r.oas ?? 0) + (r.dbPension ?? 0) + (r.otherPension ?? 0)) * deflate),
        portfolio: Math.round((r.grossWithdrawal ?? 0) * deflate),
      }
    })

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Income Floor vs Portfolio</h3>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:block">CPP + OAS + pensions vs portfolio withdrawals</p>
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
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 12, bottom: 0 }} barSize={6} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke={gridClr} />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip real={real} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="floor"     name="Guaranteed (CPP+OAS+Pension)" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
          <Bar dataKey="portfolio" name="Portfolio Withdrawal"          stackId="a" fill="#3b82f6" radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
