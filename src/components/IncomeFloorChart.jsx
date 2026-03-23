import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label, real }) {
  if (!active || !payload?.length) return null
  const cpp      = payload.find(p => p.dataKey === 'cpp')?.value ?? 0
  const oas      = payload.find(p => p.dataKey === 'oas')?.value ?? 0
  const dbPension = payload.find(p => p.dataKey === 'dbPension')?.value ?? 0
  const other    = payload.find(p => p.dataKey === 'otherPension')?.value ?? 0
  const total    = cpp + oas + dbPension + other
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs dark:bg-slate-800 dark:border-slate-700 space-y-0.5">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Age {label}{real ? ' (real $)' : ''}</p>
      {cpp       > 0 && <p className="text-emerald-600">CPP: {fmtY(cpp)}</p>}
      {oas       > 0 && <p className="text-teal-500">OAS: {fmtY(oas)}</p>}
      {dbPension > 0 && <p className="text-blue-500">DB Pension: {fmtY(dbPension)}</p>}
      {other     > 0 && <p className="text-indigo-500">Other Pension: {fmtY(other)}</p>}
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
        age:          r.age,
        cpp:          Math.round((r.cpp          ?? 0) * deflate),
        oas:          Math.round((r.oas          ?? 0) * deflate),
        dbPension:    Math.round((r.dbPension    ?? 0) * deflate),
        otherPension: Math.round((r.otherPension ?? 0) * deflate),
      }
    })

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Guaranteed Income Floor</h3>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:block">CPP + OAS + pensions</p>
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
          <Bar dataKey="cpp"          name="CPP"           stackId="a" fill="#10b981" radius={[0,0,0,0]} />
          <Bar dataKey="oas"          name="OAS"           stackId="a" fill="#14b8a6" radius={[0,0,0,0]} />
          <Bar dataKey="dbPension"    name="DB Pension"    stackId="a" fill="#3b82f6" radius={[0,0,0,0]} />
          <Bar dataKey="otherPension" name="Other Pension" stackId="a" fill="#6366f1" radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
