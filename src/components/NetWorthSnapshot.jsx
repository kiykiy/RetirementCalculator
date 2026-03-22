import { useMemo } from 'react'
import { calcEstateTax } from '../lib/simulate.js'

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

// ─── Single milestone column ──────────────────────────────────────────────────

function Milestone({ label, age, value, sub, accent = 'text-gray-900 dark:text-gray-100', muted = false }) {
  return (
    <div className={`flex flex-col gap-0.5 ${muted ? 'opacity-50' : ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
      <span className={`text-base font-bold tabular-nums leading-none ${accent}`}>{value}</span>
      <span className="text-[11px] text-gray-400 dark:text-gray-500">Age {age}{sub ? ` · ${sub}` : ''}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NetWorthSnapshot({ inputs, result }) {
  const today        = useMemo(() => inputs.accounts.reduce((s, a) => s + (a.balance ?? 0), 0), [inputs.accounts])
  const atRetirement = result.summary.portfolioAtRetirement ?? 0
  const atDeath      = result.summary.finalBalance ?? 0

  const netEstate = useMemo(() => {
    if (!result.summary.finalAccounts?.length) return atDeath
    try {
      return calcEstateTax({
        finalAccounts: result.summary.finalAccounts,
        province: inputs.province ?? 'ON',
        spousalRollover: false,
      }).netEstate
    } catch { return atDeath }
  }, [result.summary.finalAccounts, inputs.province, atDeath])

  // Progress: today's portfolio vs retirement target
  // Retirement target = first-year gross withdrawal / strategy rate (4% SWR default)
  const firstYearWithdrawal = result.rows?.[0]?.grossWithdrawal ?? 0
  const target = atRetirement > 0 ? atRetirement : 1
  const progress = Math.min(1, today / target)

  // On-track status: compare today vs what the accumulation should be at this point
  // Simple heuristic: if today ≥ 75% of retirement balance we call it on track
  const pct = Math.round(progress * 100)
  const status = progress >= 0.75 ? 'on-track'
               : progress >= 0.40 ? 'caution'
               : 'behind'

  const statusLabel = { 'on-track': 'On track ✓', caution: 'Caution', behind: 'Behind target' }[status]
  const statusColor = {
    'on-track': 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    caution:    'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    behind:     'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  }[status]

  const barColor = {
    'on-track': 'bg-emerald-500',
    caution:    'bg-amber-400',
    behind:     'bg-red-400',
  }[status]

  const exhausted = !!result.summary.portfolioExhaustedAge

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">

        {/* Three milestones */}
        <div className="flex items-start gap-8 flex-wrap">
          <Milestone
            label="Today"
            age={inputs.currentAge}
            value={fmt(today)}
          />

          <div className="w-px self-stretch bg-gray-100 dark:bg-gray-800 hidden sm:block" />

          <Milestone
            label="At Retirement"
            age={inputs.retirementAge}
            value={fmt(atRetirement)}
          />

          <div className="w-px self-stretch bg-gray-100 dark:bg-gray-800 hidden sm:block" />

          <Milestone
            label="Net Estate to Heirs"
            age={inputs.lifeExpectancy}
            value={exhausted ? '—' : fmt(netEstate)}
            sub={exhausted ? `portfolio ends age ${result.summary.portfolioExhaustedAge}` : null}
            accent={exhausted ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}
            muted={exhausted}
          />
        </div>

        {/* Progress + status */}
        <div className="flex flex-col gap-1.5 min-w-[140px] flex-1 max-w-xs justify-center">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400 dark:text-gray-500">Retirement funded</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
            <span>{fmt(today)} today</span>
            <span>{pct}%</span>
            <span>{fmt(atRetirement)} target</span>
          </div>
        </div>

      </div>
    </div>
  )
}
