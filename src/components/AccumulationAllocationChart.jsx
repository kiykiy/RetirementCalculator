import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'

const TYPE_META = {
  rrif:   { label: 'RRSP / RRIF', color: '#2563eb' },
  tfsa:   { label: 'TFSA',        color: '#16a34a' },
  nonreg: { label: 'Non-Reg',     color: '#d97706' },
}

// collect unique tax types present in accounts, preserving order rrif→tfsa→nonreg
function getTypes(accounts) {
  const order = ['rrif', 'tfsa', 'nonreg']
  const present = new Set(accounts.map(a => a.taxType))
  return order.filter(t => present.has(t))
}

function buildData(accounts, currentAge, retirementAge, workingMarginalRate, nonRegOrdinaryPct) {
  const balances     = accounts.map(a => a.balance)
  const ordinaryFrac = (nonRegOrdinaryPct ?? 0) / 100
  const margRate     = (workingMarginalRate ?? 40) / 100
  const rows         = []

  for (let age = currentAge; age <= retirementAge; age++) {
    const total   = balances.reduce((s, b) => s + b, 0)
    const byType  = {}
    accounts.forEach((acc, i) => {
      byType[acc.taxType] = (byType[acc.taxType] ?? 0) + balances[i]
    })
    const point = { age }
    if (total > 0) {
      Object.entries(byType).forEach(([k, v]) => {
        point[k] = Math.round((v / total) * 100)
      })
    }
    rows.push(point)

    if (age < retirementAge) {
      accounts.forEach((acc, i) => {
        const ret  = balances[i] * (acc.returnRate / 100)
        const aTax = acc.taxType === 'nonreg' ? ret * (1 - ordinaryFrac * margRate) : ret
        balances[i] = balances[i] + aTax + acc.annualContribution
      })
    }
  }
  return rows
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs dark:bg-gray-800 dark:border-gray-700">
      <p className="font-semibold text-gray-700 mb-1.5 dark:text-gray-200">Age {label}</p>
      {[...payload].reverse().map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}%</p>
      ))}
    </div>
  )
}

export default function AccumulationAllocationChart({
  accounts, currentAge, retirementAge,
  workingMarginalRate = 40, nonRegOrdinaryPct = 0, darkMode = false,
}) {
  if (!accounts?.length || currentAge >= retirementAge) return null

  const types      = getTypes(accounts)
  const data       = buildData(accounts, currentAge, retirementAge, workingMarginalRate, nonRegOrdinaryPct)
  const lastPoint  = data[data.length - 1] ?? {}
  const rrifPct    = lastPoint.rrif   ?? 0
  const tfsaPct    = lastPoint.tfsa   ?? 0
  const nonregPct  = lastPoint.nonreg ?? 0

  const warning = rrifPct > 60
    ? `RRSP/RRIF is ${rrifPct}% of portfolio at retirement — high future tax exposure.`
    : tfsaPct < 15 && types.includes('tfsa')
    ? `TFSA is only ${tfsaPct}% of portfolio — consider maximizing tax-free growth.`
    : null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Account Type Allocation</h3>
        <div className="flex items-center gap-2 text-[11px]">
          {types.map(t => (
            <span key={t} className="font-medium" style={{ color: TYPE_META[t].color }}>
              {TYPE_META[t].label}: {lastPoint[t] ?? 0}%
            </span>
          ))}
        </div>
      </div>
      {warning && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 rounded-lg">
          ⚠ {warning}
        </p>
      )}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">% of total portfolio by account type at retirement age</p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} stackOffset="expand">
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} width={44} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            x={retirementAge}
            stroke="#9ca3af"
            strokeDasharray="4 3"
            label={{ value: 'Retirement', position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
          />
          {types.map(t => (
            <Area
              key={t}
              type="monotone"
              dataKey={t}
              name={TYPE_META[t].label}
              stackId="1"
              stroke={TYPE_META[t].color}
              fill={TYPE_META[t].color}
              fillOpacity={0.7}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
