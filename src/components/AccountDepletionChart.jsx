import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Age {label}</p>
      {payload.map(p => p.value > 0 && (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtY(p.value)}
        </p>
      ))}
      <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium border-t border-slate-100 dark:border-slate-700 pt-1">
        Total drawn: {fmtY(total)}
      </p>
    </div>
  )
}

export default function WithdrawalSourceChart({ rows, retirementAge, darkMode = false }) {
  if (!rows?.length) return null

  const data = rows.map(r => ({
    age:           r.age,
    'RRSP / RRIF': r.rrifWithdrawn  ?? 0,
    'Non-Reg':     r.nonRegWithdrawn ?? 0,
    'TFSA':        r.tfsaWithdrawn   ?? 0,
  }))

  const axisColor = darkMode ? '#6b7280' : '#9ca3af'
  const gridColor = darkMode ? '#1f2937' : '#f3f4f6'

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Withdrawal Sources</h3>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          Where spending comes from each year — shows the withdrawal sequence in action
        </p>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 10, fill: axisColor }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={fmtY}
            tick={{ fontSize: 10, fill: axisColor }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={8} />

          {retirementAge && (
            <ReferenceLine
              x={retirementAge}
              stroke={axisColor}
              strokeDasharray="4 3"
              label={{ value: 'Retire', position: 'top', fontSize: 10, fill: axisColor }}
            />
          )}

          <Bar dataKey="RRSP / RRIF" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Non-Reg"     stackId="a" fill="#60a5fa" radius={[0, 0, 0, 0]} />
          <Bar dataKey="TFSA"        stackId="a" fill="#34d399" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed">
        RRIF/RRSP withdrawals (amber) are fully taxable income. Non-Reg (blue) triggers capital gains. TFSA (green) is tax-free. Changing the withdrawal sequence in the controls above reshapes this chart.
      </p>
    </div>
  )
}
