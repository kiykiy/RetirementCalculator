import { useState, useMemo } from 'react'
import { runSimulation } from '../lib/simulate.js'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtM = v => {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v)}`
}

const fmtPct = v => v == null || isNaN(v) ? '—' : `${v.toFixed(1)}%`

const deltaFmt = (a, b, isPct = false) => {
  if (a == null || b == null || isNaN(a) || isNaN(b)) return '—'
  const d = b - a
  if (Math.abs(d) < 0.05 && isPct) return '—'
  if (Math.abs(d) < 1 && !isPct)   return '—'
  const sign = d > 0 ? '+' : ''
  return isPct ? `${sign}${d.toFixed(1)}pp` : `${sign}${fmtM(d)}`
}

const deltaColor = (a, b, higherIsBetter = true) => {
  if (a == null || b == null) return ''
  const d = b - a
  if (Math.abs(d) < 1) return 'text-gray-400'
  const good = higherIsBetter ? d > 0 : d < 0
  return good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
}

// ─── Tooltip for charts ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, darkMode }) {
  if (!active || !payload?.length) return null
  return (
    <div className={`rounded-xl px-3 py-2 text-xs shadow-lg border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
      <p className="font-semibold text-gray-500 mb-1">Age {label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold tabular-nums" style={{ color: p.color }}>
            {p.dataKey.includes('Rate') ? fmtPct(p.value) : fmtM(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ScenarioCompare({ snapshots, currentInputs, currentPersonConfigs, buildSimParams, darkMode }) {
  const options = [
    { id: 'current', name: '● Current' },
    ...snapshots.map(s => ({ id: s.id, name: s.name })),
  ]

  const [idA, setIdA] = useState('current')
  const [idB, setIdB] = useState(snapshots[0]?.id ?? 'current')

  // Resolve snapshot data
  function resolveData(id) {
    if (id === 'current') return { inputs: currentInputs, personConfigs: currentPersonConfigs }
    const snap = snapshots.find(s => s.id === id)
    if (!snap) return null
    return snap.data
  }

  // Run simulations for both
  const resultA = useMemo(() => {
    const data = resolveData(idA)
    if (!data?.inputs) return null
    try {
      const params = buildSimParams(data.inputs, data.personConfigs)
      return runSimulation(params)
    } catch { return null }
  }, [idA, snapshots, currentInputs, currentPersonConfigs])

  const resultB = useMemo(() => {
    const data = resolveData(idB)
    if (!data?.inputs) return null
    try {
      const params = buildSimParams(data.inputs, data.personConfigs)
      return runSimulation(params)
    } catch { return null }
  }, [idB, snapshots, currentInputs, currentPersonConfigs])

  const sA = resultA?.summary
  const sB = resultB?.summary
  const nameA = options.find(o => o.id === idA)?.name ?? 'A'
  const nameB = options.find(o => o.id === idB)?.name ?? 'B'

  // ── Build chart data (aligned by age) ───────────────────────────────────
  const chartData = useMemo(() => {
    if (!resultA?.rows?.length && !resultB?.rows?.length) return []
    const rowsA = resultA?.rows ?? []
    const rowsB = resultB?.rows ?? []
    const minAge = Math.min(rowsA[0]?.age ?? 999, rowsB[0]?.age ?? 999)
    const maxAge = Math.max(rowsA.at(-1)?.age ?? 0, rowsB.at(-1)?.age ?? 0)
    if (minAge > maxAge) return []

    const mapA = Object.fromEntries(rowsA.map(r => [r.age, r]))
    const mapB = Object.fromEntries(rowsB.map(r => [r.age, r]))

    const data = []
    for (let age = minAge; age <= maxAge; age++) {
      const a = mapA[age]
      const b = mapB[age]
      data.push({
        age,
        portfolioA: a?.portfolioTotal ?? null,
        portfolioB: b?.portfolioTotal ?? null,
        incomeA:    a?.netIncome ?? null,
        incomeB:    b?.netIncome ?? null,
        rateA:      a?.withdrawalRate ?? null,
        rateB:      b?.withdrawalRate ?? null,
      })
    }
    return data
  }, [resultA, resultB])

  // ── Metrics table ───────────────────────────────────────────────────────
  const metrics = sA && sB ? [
    { label: 'Portfolio at Retirement', a: sA.portfolioAtRetirement,  b: sB.portfolioAtRetirement,  fmt: fmtM, better: true },
    { label: 'Final Balance',           a: sA.finalBalance,           b: sB.finalBalance,           fmt: fmtM, better: true },
    { label: 'Total Net Income',        a: sA.totalNetIncome,         b: sB.totalNetIncome,         fmt: fmtM, better: true },
    { label: 'Total Tax Paid',          a: sA.totalTaxPaid,           b: sB.totalTaxPaid,           fmt: fmtM, better: false },
    { label: 'Avg Tax Rate',            a: sA.avgEffectiveRate,       b: sB.avgEffectiveRate,       fmt: fmtPct, better: false, isPct: true },
    { label: 'Years Funded',            a: sA.yearsInRetirement,      b: sB.yearsInRetirement,      fmt: v => `${v} yrs`, better: true },
    { label: 'RE Equity at Death',      a: sA.reEquityAtDeath ?? 0,   b: sB.reEquityAtDeath ?? 0,   fmt: fmtM, better: true },
  ] : []

  const axisColor = darkMode ? '#6b7280' : '#9ca3af'
  const gridColor = darkMode ? '#1f2937' : '#f3f4f6'

  const colorA = '#10b981' // emerald
  const colorB = '#3b82f6' // blue

  if (options.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Save at least one snapshot to compare scenarios.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Use the 🔖 button in the header to save your current plan.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Scenario selectors ── */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1 block">Scenario A</label>
            <select
              value={idA}
              onChange={e => setIdA(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <span className="text-sm font-bold text-gray-300 dark:text-gray-600 mt-4">vs</span>
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1 block">Scenario B</label>
            <select
              value={idB}
              onChange={e => setIdB(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary comparison table ── */}
      {metrics.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500 dark:text-gray-400">Metric</th>
                <th className="text-right px-4 py-2.5 font-semibold text-emerald-600 dark:text-emerald-400 w-28">{nameA}</th>
                <th className="text-right px-4 py-2.5 font-semibold text-blue-600 dark:text-blue-400 w-28">{nameB}</th>
                <th className="text-right px-4 py-2.5 font-semibold text-gray-400 dark:text-gray-500 w-24">Δ</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => (
                <tr key={m.label} className={i < metrics.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200 font-semibold">{m.fmt(m.a)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200 font-semibold">{m.fmt(m.b)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${deltaColor(m.a, m.b, m.better)}`}>
                    {deltaFmt(m.a, m.b, m.isPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Portfolio chart ── */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Portfolio Projection</h3>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cmpGradA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorA} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={colorA} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cmpGradB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorB} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={colorB} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="age" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={56} />
              <Tooltip content={<ChartTooltip darkMode={darkMode} />} />
              <Area type="monotone" dataKey="portfolioA" name={nameA} stroke={colorA} strokeWidth={2} fill="url(#cmpGradA)" dot={false} connectNulls />
              <Area type="monotone" dataKey="portfolioB" name={nameB} stroke={colorB} strokeWidth={2} fill="url(#cmpGradB)" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 justify-center mt-1">
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="w-3 h-0.5 rounded-full" style={{ background: colorA }} />{nameA}</span>
            <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="w-3 h-0.5 rounded-full" style={{ background: colorB }} />{nameB}</span>
          </div>
        </div>
      )}

      {/* ── Income chart ── */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Annual Net Income</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="age" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={56} />
              <Tooltip content={<ChartTooltip darkMode={darkMode} />} />
              <Line type="monotone" dataKey="incomeA" name={nameA} stroke={colorA} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="incomeB" name={nameB} stroke={colorB} strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Withdrawal rate chart ── */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Withdrawal Rate</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="age" tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={v => `${v?.toFixed(0) ?? 0}%`} width={40} />
              <Tooltip content={<ChartTooltip darkMode={darkMode} />} />
              <ReferenceLine y={4} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1} label={{ value: '4% rule', position: 'right', fontSize: 9, fill: '#f59e0b' }} />
              <Line type="monotone" dataKey="rateA" name={nameA} stroke={colorA} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="rateB" name={nameB} stroke={colorB} strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {(!resultA || !resultB) && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400 dark:text-gray-500">Select two scenarios above to compare.</p>
        </div>
      )}
    </div>
  )
}
