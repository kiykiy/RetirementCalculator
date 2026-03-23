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

export default function NetWorthSnapshot({ inputs, result, estateGoal = 0 }) {
  const today        = useMemo(() => inputs.accounts.reduce((s, a) => s + (a.balance ?? 0), 0), [inputs.accounts])
  const atRetirement = result.summary.portfolioAtRetirement ?? 0
  const atDeath      = result.summary.finalBalance ?? 0

  const netEstate = useMemo(() => {
    if (!result.summary.finalAccounts?.length) return atDeath
    try {
      return calcEstateTax({
        finalAccounts: result.summary.finalAccounts,
        province: inputs.province ?? 'ON',
        spousalRollover: inputs.spousalRollover ?? false,
      }).netEstate
    } catch { return atDeath }
  }, [result.summary.finalAccounts, inputs.province, inputs.spousalRollover, atDeath])

  // Progress: are you on track TODAY, given years remaining + contributions + growth?
  //
  // We compute the "on-track balance" — what you should have saved right now
  // to hit atRetirement on time, assuming your planned contributions and return rate.
  //
  //   atRetirement = onTrack * (1+r)^n  +  C * ((1+r)^n - 1) / r
  //   => onTrack = (atRetirement - C * ((1+r)^n - 1) / r) / (1+r)^n
  //
  const yearsLeft = Math.max(0, inputs.retirementAge - inputs.currentAge)
  const annualContrib = inputs.accounts.reduce((s, a) => s + (a.annualContribution ?? 0), 0)
  const weightedReturn = useMemo(() => {
    const total = inputs.accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
    if (total <= 0) return 0.06
    const weighted = inputs.accounts.reduce((s, a) => s + ((a.balance ?? 0) * ((a.returnRate ?? 6) / 100)), 0)
    return weighted / total
  }, [inputs.accounts])

  const onTrackBalance = useMemo(() => {
    if (yearsLeft === 0 || atRetirement <= 0) return atRetirement
    const r = weightedReturn
    const n = yearsLeft
    const fvFactor = Math.pow(1 + r, n)
    const fvContribs = r > 0 ? annualContrib * (fvFactor - 1) / r : annualContrib * n
    return (atRetirement - fvContribs) / fvFactor
  }, [atRetirement, yearsLeft, annualContrib, weightedReturn])

  const target = Math.max(onTrackBalance, 1)
  const progress = Math.min(1, today / target)
  const pct = Math.round(progress * 100)

  const status = progress >= 0.90 ? 'on-track'
               : progress >= 0.60 ? 'caution'
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
            <span>{fmt(Math.max(onTrackBalance, 0))} on-track</span>
          </div>

          {/* Estate goal progress bar */}
          {estateGoal > 0 && (() => {
            const estatePct   = Math.min(100, Math.round(netEstate / estateGoal * 100))
            const estateStatus = estatePct >= 100 ? 'on-track' : estatePct >= 70 ? 'caution' : 'behind'
            const estateLabel  = { 'on-track': 'On track ✓', caution: 'Caution', behind: 'Behind target' }[estateStatus]
            const estateColor  = { 'on-track': 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20', caution: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20', behind: 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20' }[estateStatus]
            const estateBar    = { 'on-track': 'bg-emerald-500', caution: 'bg-amber-400', behind: 'bg-red-400' }[estateStatus]
            return (
              <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-gray-500">Estate goal</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${estateColor}`}>{estateLabel}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${estateBar}`} style={{ width: `${estatePct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                  <span>{fmt(netEstate)} projected</span>
                  <span>{estatePct}%</span>
                  <span>{fmt(estateGoal)} goal</span>
                </div>
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  )
}
