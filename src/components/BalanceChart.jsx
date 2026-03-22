import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const PALETTE = [
  '#16a34a',
  '#2563eb',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#c2410c',
  '#65a30d',
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
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs dark:bg-slate-800 dark:border-slate-700">
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

function McTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const byKey = Object.fromEntries(payload.map(p => [p.dataKey, p.value]))
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs dark:bg-slate-800 dark:border-slate-700 space-y-0.5">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Age {label}</p>
      {byKey.p90 != null && <p className="text-emerald-600">Optimistic (P90): {fmtY(byKey.p90)}</p>}
      {byKey.p50 != null && <p className="text-blue-600">Median (P50): {fmtY(byKey.p50)}</p>}
      {byKey.p10 != null && <p className="text-red-500">Pessimistic (P10): {fmtY(byKey.p10)}</p>}
    </div>
  )
}

function ForecastButton({ showMC, onToggle, probabilityOfSuccess }) {
  const [tip, setTip] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef(null)

  function handleEnter() {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 268) })
    setTip(true)
  }

  return (
    <>
      <button
        ref={ref}
        onClick={onToggle}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setTip(false)}
        className={`px-2.5 py-1 rounded-md text-xs transition-colors border ${
          showMC
            ? 'bg-violet-100 border-violet-300 text-violet-700 font-medium dark:bg-violet-900/30 dark:border-violet-700 dark:text-violet-300'
            : 'border-gray-200 text-gray-500 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        {showMC && probabilityOfSuccess != null
          ? `✦ ${Math.round(probabilityOfSuccess * 100)}% success`
          : '✦ Forecast'}
      </button>
      {tip && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 260 }}
          className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none leading-relaxed dark:bg-gray-800"
        >
          <p className="font-semibold text-violet-300 mb-1">📊 Monte Carlo Forecast</p>
          <p className="text-gray-300 mb-2">
            Runs 1,000 simulations using randomised annual returns based on your portfolio's historical mean and volatility.
          </p>
          <div className="space-y-1 border-t border-gray-700 pt-2">
            <p><span className="text-green-400 font-medium">P90 — Optimistic:</span> top 10% of outcomes</p>
            <p><span className="text-violet-300 font-medium">P50 — Median:</span> most likely outcome</p>
            <p><span className="text-red-400 font-medium">P10 — Pessimistic:</span> bottom 10% of outcomes</p>
          </div>
          <p className="text-gray-500 mt-2 text-[10px]">Adjust portfolio mix in Accounts to change the spread.</p>
        </div>,
        document.body
      )}
    </>
  )
}

export default function BalanceChart({ rows, accountMeta, inflation = 2.5, retirementAge, rrifExhaustedAge = null, darkMode = false, mcBands = null, probabilityOfSuccess = null, stressedRows = null, seqRiskLabel = null }) {
  const [real,   setReal]   = useState(false)
  const [showMC, setShowMC] = useState(false)

  if (!rows?.length || !accountMeta?.length) return null

  const inf     = inflation / 100
  const gridClr = darkMode ? '#374151' : '#f3f4f6'

  const data = rows.map(r => {
    const deflate = real ? 1 / Math.pow(1 + inf, r.age - retirementAge) : 1
    const point = { age: r.age, baseLine: Math.round((r.portfolioTotal ?? 0) * deflate) }
    accountMeta.forEach(acc => {
      point[acc.id] = Math.round((r.accountBalances?.[acc.id] ?? 0) * deflate)
    })
    return point
  })

  const stressedData = stressedRows?.map(r => {
    const deflate = real ? 1 / Math.pow(1 + inf, r.age - retirementAge) : 1
    return { age: r.age, stressed: Math.round((r.portfolioTotal ?? 0) * deflate) }
  }) ?? []

  // Merge stressed data into main data by age
  const mergedData = stressedRows
    ? data.map(d => ({ ...d, stressed: stressedData.find(s => s.age === d.age)?.stressed ?? null }))
    : data

  // When overlay is active, dim the fill so both lines are clearly visible
  const fillOpacity = stressedRows ? 0.15 : 1

  const mcData = mcBands?.map(b => {
    const deflate = real ? 1 / Math.pow(1 + inf, b.age - retirementAge) : 1
    const p10 = Math.round(b.p10 * deflate)
    const p50 = Math.round(b.p50 * deflate)
    const p90 = Math.round(b.p90 * deflate)
    return { age: b.age, p10, p50, p90, spread: Math.max(0, p90 - p10) }
  }) ?? []

  const activeView = showMC && mcBands ? 'mc' : 'normal'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Retirement Portfolio</h3>
        <div className="flex items-center gap-1.5">
          {/* Monte Carlo toggle — only when bands are available */}
          {mcBands && <ForecastButton showMC={showMC} onToggle={() => setShowMC(v => !v)} probabilityOfSuccess={probabilityOfSuccess} />}
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

      {activeView === 'mc' ? (
        /* ── Monte Carlo fan chart ── */
        <div className="space-y-1">
          {probabilityOfSuccess != null && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">1,000 simulation runs</span>
              <span className={`text-[11px] font-semibold ${
                probabilityOfSuccess >= 0.90 ? 'text-emerald-600 dark:text-emerald-400' :
                probabilityOfSuccess >= 0.75 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'
              }`}>
                {Math.round(probabilityOfSuccess * 100)}% probability of success
              </span>
            </div>
          )}
          <ResponsiveContainer width="100%" height={268}>
            <AreaChart data={mcData} margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridClr} />
              <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
              <Tooltip content={<McTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value, entry) => entry.dataKey === 'spread' ? null : value} />
              {/* Invisible base for stacking — p10 floor */}
              <Area type="monotone" dataKey="p10" name="Pessimistic (P10)" stackId="band"
                stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3"
                fill="transparent" dot={false} />
              {/* Band fill: p90 - p10 stacked on top of p10 */}
              <Area type="monotone" dataKey="spread" name="spread" stackId="band"
                stroke="none" fill="url(#bandGrad)" dot={false} legendType="none" />
              {/* P90 line — separate, no stackId */}
              <Area type="monotone" dataKey="p90" name="Optimistic (P90)"
                stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3"
                fill="none" dot={false} />
              {/* P50 median — solid, prominent */}
              <Area type="monotone" dataKey="p50" name="Median (P50)"
                stroke="#3b82f6" strokeWidth={2.5}
                fill="none" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        /* ── Normal stacked chart ── */
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={mergedData} margin={{ top: 4, right: 8, left: 12, bottom: 0 }}>
            <defs>
              {accountMeta.map((acc, i) => (
                <linearGradient key={acc.id} id={`grad_${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.8 * fillOpacity} />
                  <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.1 * fillOpacity} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridClr} />
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
                strokeOpacity={stressedRows ? 0.4 : 1}
                fill={`url(#grad_${acc.id})`}
                stackId="1"
              />
            ))}
            {rrifExhaustedAge && (
              <ReferenceLine
                x={rrifExhaustedAge}
                stroke="#f97316"
                strokeDasharray="4 3"
                label={{ value: `RRIF $0 (${rrifExhaustedAge})`, position: 'insideTopRight', fontSize: 10, fill: '#f97316' }}
              />
            )}
            {/* Overlay mode: base case total + stressed total as two bold lines */}
            {stressedRows && (
              <Line
                type="monotone"
                dataKey="baseLine"
                name="Base case"
                stroke="#64748b"
                strokeWidth={2}
                dot={false}
                legendType="line"
              />
            )}
            {stressedRows && (
              <Line
                type="monotone"
                dataKey="stressed"
                name={seqRiskLabel ?? 'Stressed'}
                stroke="#f43f5e"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
