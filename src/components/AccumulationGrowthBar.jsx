import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function buildData(accounts, currentAge, retirementAge, workingMarginalRate, nonRegOrdinaryPct) {
  const balances      = accounts.map(a => a.balance)
  const ordinaryFrac  = (nonRegOrdinaryPct ?? 0) / 100
  const margRate      = (workingMarginalRate ?? 40) / 100
  let cumContrib      = accounts.reduce((s, a) => s + a.balance, 0)
  const rows          = []

  for (let age = currentAge; age <= retirementAge; age++) {
    const totalBal    = balances.reduce((s, b) => s + b, 0)
    const growth      = Math.max(0, totalBal - cumContrib)
    rows.push({ age, contributions: Math.round(cumContrib), growth: Math.round(growth) })

    if (age < retirementAge) {
      cumContrib += accounts.reduce((s, a) => s + a.annualContribution, 0)
      accounts.forEach((acc, i) => {
        const ret     = balances[i] * (acc.returnRate / 100)
        const aTax    = acc.taxType === 'nonreg' ? ret * (1 - ordinaryFrac * margRate) : ret
        balances[i]   = balances[i] + aTax + acc.annualContribution
      })
    }
  }
  return rows
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const contrib = payload.find(p => p.dataKey === 'contributions')?.value ?? 0
  const growth  = payload.find(p => p.dataKey === 'growth')?.value ?? 0
  const total   = contrib + growth
  const growthPct = total > 0 ? Math.round((growth / total) * 100) : 0
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs dark:bg-gray-800 dark:border-gray-700">
      <p className="font-semibold text-gray-700 mb-1.5 dark:text-gray-200">Age {label}</p>
      <p style={{ color: '#2563eb' }}>Contributions: {fmtY(contrib)}</p>
      <p style={{ color: '#16a34a' }}>Investment Growth: {fmtY(growth)}</p>
      <div className="border-t border-gray-100 dark:border-gray-700 mt-1.5 pt-1.5 space-y-0.5">
        <p className="text-gray-500 font-medium dark:text-gray-400">Total: {fmtY(total)}</p>
        <p className="text-emerald-600 dark:text-emerald-400 font-medium">{growthPct}% from growth</p>
      </div>
    </div>
  )
}

export default function AccumulationGrowthBar({
  accounts, currentAge, retirementAge,
  workingMarginalRate = 40, nonRegOrdinaryPct = 0, darkMode = false,
}) {
  if (!accounts?.length || currentAge >= retirementAge) return null

  const data       = buildData(accounts, currentAge, retirementAge, workingMarginalRate, nonRegOrdinaryPct)
  const last       = data[data.length - 1]
  const totalFinal = (last?.contributions ?? 0) + (last?.growth ?? 0)
  const growthFrac = totalFinal > 0 ? Math.round((last.growth / totalFinal) * 100) : 0

  // find crossover age where growth first exceeds contributions
  const crossover = data.find(d => d.growth > d.contributions)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Contributions vs. Investment Growth</h3>
          {crossover && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Growth outpaces contributions at age <span className="font-semibold text-emerald-600 dark:text-emerald-400">{crossover.age}</span>
            </p>
          )}
        </div>
        <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg dark:bg-emerald-900/20 dark:text-emerald-300">
          {growthFrac}% from growth at retirement
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 12, bottom: 0 }} barSize={8}>
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            x={retirementAge}
            stroke="#9ca3af"
            strokeDasharray="4 3"
            label={{ value: 'Retirement', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
          />
          {crossover && (
            <ReferenceLine
              x={crossover.age}
              stroke="#16a34a"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{ value: 'Crossover', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }}
            />
          )}
          <Bar dataKey="contributions" name="Contributions" stackId="a" fill="#2563eb" fillOpacity={0.85} radius={[0, 0, 2, 2]} />
          <Bar dataKey="growth"        name="Investment Growth" stackId="a" fill="#16a34a" fillOpacity={0.85} radius={[2, 2, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
