function fmt(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`
}

function MetricCard({ label, value, sub, color = 'text-slate-800' }) {
  return (
    <div className="metric-card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

export default function ResultsSummary({ summary }) {
  if (!summary) return null

  const exhausted = summary.portfolioExhaustedAge

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricCard
        label="Portfolio at Retirement"
        value={fmt(summary.portfolioAtRetirement)}
        sub={summary.accountsAtRetirement?.map(a => `${a.name}: ${fmt(a.balance)}`).join(' · ')}
        color="text-brand-700"
      />
      <MetricCard
        label="Final Balance"
        value={fmt(summary.finalBalance)}
        sub={exhausted ? `Exhausted at age ${exhausted}` : 'At life expectancy'}
        color={exhausted ? 'text-red-600' : 'text-emerald-700'}
      />
      <MetricCard
        label="Total Net Income"
        value={fmt(summary.totalNetIncome)}
        sub="After-tax, lifetime"
      />
      <MetricCard
        label="Total Tax Paid"
        value={fmt(summary.totalTaxPaid)}
        sub="Federal + Provincial"
        color="text-amber-700"
      />
      <MetricCard
        label="Avg Effective Tax Rate"
        value={pct(summary.avgEffectiveRate)}
        sub="Average over retirement"
      />
      <MetricCard
        label="Years in Retirement"
        value={`${summary.yearsInRetirement} yrs`}
      />
    </div>
  )
}
