import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function fmtY(v) { return `${v.toFixed(1)}%` }

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rate = payload[0]?.value
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs dark:bg-slate-800 dark:border-slate-700">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Age {label}</p>
      <p className={rate > 5 ? 'text-red-500' : rate > 4 ? 'text-amber-600' : 'text-emerald-600'}>
        Withdrawal rate: {rate != null ? rate.toFixed(1) : '—'}%
      </p>
    </div>
  )
}

export default function WithdrawalRateChart({ rows, retirementAge, inflation = 2.5, darkMode = false }) {
  const [real, setReal] = useState(false)

  if (!rows?.length) return null

  const gridClr = darkMode ? '#374151' : '#f3f4f6'

  const data = rows
    .filter(r => r.age >= retirementAge && r.portfolioTotal > 0)
    .map(r => ({
      age: r.age,
      // withdrawal rate % is identical in real and nominal terms (both sides deflate equally)
      rate: Math.round((r.grossWithdrawal / r.portfolioTotal) * 1000) / 10,
    }))

  if (!data.length) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Withdrawal Rate</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" />≤4% safe</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block rounded" />4–5% moderate</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block rounded" />&gt;5% elevated</span>
          </div>
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
      {real && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2 -mt-2">
          Withdrawal rate % is inflation-independent — the same in real and nominal terms.
        </p>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridClr} />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={48} domain={[0, 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={4} stroke="#10b981" strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: '4% guideline', position: 'insideTopRight', fontSize: 10, fill: '#10b981' }} />
          <ReferenceLine y={5} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1}
            label={{ value: '5%', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
          <Line
            type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={false}
            name="Withdrawal rate"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
