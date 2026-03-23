import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'

function fmtY(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)    return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function buildData(accounts, currentAge, retirementAge, annualSalary) {
  const rows               = []
  const totalAnnualContrib = accounts.reduce((s, a) => s + a.annualContribution, 0)

  for (let age = currentAge; age < retirementAge; age++) {
    const point = { age, contributions: totalAnnualContrib }
    if (annualSalary > 0) {
      point.savingsRate = Math.round((totalAnnualContrib / annualSalary) * 1000) / 10
    }
    rows.push(point)
  }
  return rows
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const contrib = payload.find(p => p.dataKey === 'contributions')?.value ?? 0
  const rate    = payload.find(p => p.dataKey === 'savingsRate')?.value
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs dark:bg-gray-800 dark:border-gray-700">
      <p className="font-semibold text-gray-700 mb-1.5 dark:text-gray-200">Age {label}</p>
      <p style={{ color: '#2563eb' }}>Annual Contributions: {fmtY(contrib)}</p>
      {rate != null && (
        <p style={{ color: '#7c3aed' }} className="font-semibold">Savings Rate: {rate}%</p>
      )}
    </div>
  )
}

export default function ContributionRateChart({
  accounts, currentAge, retirementAge,
  annualSalary = 0, budgetAnnualIncome = 0,
  onGoToIncome, darkMode = false,
}) {
  const [linked, setLinked] = useState(false)

  if (!accounts?.length || currentAge >= retirementAge) return null

  const effectiveSalary    = linked ? budgetAnnualIncome : annualSalary
  const hasSalary          = effectiveSalary > 0
  const data               = buildData(accounts, currentAge, retirementAge, effectiveSalary)
  const totalAnnualContrib = accounts.reduce((s, a) => s + a.annualContribution, 0)
  const savingsRate        = hasSalary ? Math.round((totalAnnualContrib / effectiveSalary) * 1000) / 10 : null

  const rateColor = savingsRate == null ? null
    : savingsRate >= 20 ? '#16a34a'
    : savingsRate >= 15 ? '#d97706'
    : '#dc2626'

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Contribution Rate</h3>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            Annual savings across all accounts
          </p>
          {!hasSalary && (
            <p className="text-[11px] text-amber-500 mt-0.5">
              {linked
                ? 'No income found in budget — '
                : 'Add annual salary or '}
              {linked ? (
                <button onClick={onGoToIncome} className="underline hover:text-amber-600 transition-colors">
                  add income in Budget →
                </button>
              ) : (
                <button onClick={() => setLinked(true)} className="underline hover:text-amber-600 transition-colors">
                  link to budget income
                </button>
              )}
            </p>
          )}
          {hasSalary && linked && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Income: {fmtY(effectiveSalary)}/yr from budget ·{' '}
              <button onClick={onGoToIncome} className="underline text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity">
                Edit in Budget →
              </button>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Link toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none group relative">
            <div
              onClick={() => setLinked(v => !v)}
              className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${linked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform mt-0.5 ${linked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-[11px] text-gray-600 dark:text-gray-400">Link to income</span>
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="bg-gray-900 dark:bg-gray-700 text-white text-[11px] rounded-lg shadow-xl p-2.5 space-y-1 leading-relaxed">
                <p className="font-semibold">Link to Budget Income</p>
                <p className="text-gray-300">Uses the total gross annual income from your Budget → Income tab to calculate your savings rate automatically.</p>
              </div>
            </div>
          </label>

          {/* Savings rate badge */}
          {savingsRate != null && (
            <div className="text-right">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ color: rateColor, backgroundColor: rateColor + '18' }}>
                {savingsRate}% savings rate
              </span>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {savingsRate >= 20 ? '✓ Excellent' : savingsRate >= 15 ? '~ Good (target: 20%)' : '↑ Below target (15%+)'}
              </p>
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: hasSalary ? 44 : 8, left: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11 }} />
          <YAxis yAxisId="left" tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
          {hasSalary && (
            <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={36} />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {hasSalary && (
            <>
              <ReferenceLine yAxisId="right" y={15} stroke="#d97706" strokeDasharray="4 3"
                label={{ value: '15% min', position: 'insideTopRight', fontSize: 10, fill: '#d97706' }} />
              <ReferenceLine yAxisId="right" y={20} stroke="#16a34a" strokeDasharray="4 3"
                label={{ value: '20% target', position: 'insideTopRight', fontSize: 10, fill: '#16a34a' }} />
            </>
          )}
          <Bar yAxisId="left" dataKey="contributions" name="Annual Contributions" fill="#2563eb" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
          {hasSalary && (
            <Line yAxisId="right" type="monotone" dataKey="savingsRate" name="Savings Rate %" stroke="#7c3aed" strokeWidth={2} dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
