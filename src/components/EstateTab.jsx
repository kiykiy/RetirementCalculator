import { useState, useMemo } from 'react'
import { calcEstateTax } from '../lib/simulate.js'
import NetWorthSnapshot from './NetWorthSnapshot.jsx'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || n === 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}
function pct(n) { return `${(n * 100).toFixed(1)}%` }

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, balance, children, badge, badgeColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' }) {
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmt(balance)}</span>
        </div>
      </div>
      {children}
    </div>
  )
}

function Line({ label, value, accent = 'text-gray-600 dark:text-gray-400', indent = false }) {
  return (
    <div className={`flex items-center justify-between text-[11px] ${indent ? 'pl-3 border-l-2 border-gray-100 dark:border-gray-800' : ''}`}>
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <span className={`font-medium tabular-nums ${accent}`}>{value}</span>
    </div>
  )
}

function NetBar({ estate }) {
  const total = estate.grossEstate || 1
  const tfsaPct    = (estate.tfsaBalance    / total) * 100
  const nonNetPct  = (Math.max(0, estate.nonRegBalance - estate.nonRegTax) / total) * 100
  const rrifNetPct = (Math.max(0, estate.rrifBalance   - estate.rrifTax)   / total) * 100
  const taxPct     = ((estate.totalTax + estate.probateFee) / total) * 100

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Estate Breakdown</p>
      <div className="flex h-5 rounded-lg overflow-hidden w-full">
        {tfsaPct    > 0 && <div style={{ width: `${tfsaPct}%`    }} className="bg-emerald-500"    title={`TFSA: ${fmt(estate.tfsaBalance)}`} />}
        {nonNetPct  > 0 && <div style={{ width: `${nonNetPct}%`  }} className="bg-blue-400"       title={`Non-Reg (net): ${fmt(Math.max(0, estate.nonRegBalance - estate.nonRegTax))}`} />}
        {rrifNetPct > 0 && <div style={{ width: `${rrifNetPct}%` }} className="bg-amber-400"      title={`RRIF (net): ${fmt(Math.max(0, estate.rrifBalance - estate.rrifTax))}`} />}
        {taxPct     > 0 && <div style={{ width: `${taxPct}%`     }} className="bg-red-400"        title={`Tax + Probate: ${fmt(estate.totalTax + estate.probateFee)}`} />}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {estate.tfsaBalance    > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />TFSA</span>}
        {estate.nonRegBalance  > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400  inline-block" />Non-Reg</span>}
        {estate.rrifBalance    > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />RRIF/RRSP</span>}
        {(estate.totalTax + estate.probateFee) > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />Taxes &amp; Probate</span>}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EstateTab({ summary, result, inputs }) {
  const [spousalRollover, setSpousalRollover] = useState(false)

  const estate = useMemo(() => {
    const accounts = summary?.finalAccounts
    if (!accounts?.length) return null
    return calcEstateTax({ finalAccounts: accounts, province: inputs.province ?? 'ON', spousalRollover })
  }, [summary, inputs.province, spousalRollover])

  // Deferred RRIF tax — always computed without rollover so we can show the true liability
  const deferredRrifTax = useMemo(() => {
    const accounts = summary?.finalAccounts
    if (!accounts?.length) return 0
    return calcEstateTax({ finalAccounts: accounts, province: inputs.province ?? 'ON', spousalRollover: false }).rrifTax
  }, [summary, inputs.province])

  if (!estate) return null

  const deathAge  = inputs.lifeExpectancy
  const province  = inputs.province ?? 'ON'
  const exhausted = !!summary.portfolioExhaustedAge

  return (
    <div className="space-y-4">

      {/* Net worth journey */}
      {result && <NetWorthSnapshot inputs={inputs} result={result} />}

    <div className="card space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Estate at Death</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Age {deathAge} · {province}
            {exhausted && <span className="text-red-500 ml-1.5">· portfolio exhausted at age {summary.portfolioExhaustedAge}</span>}
          </p>
        </div>

        {/* Spousal rollover toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none flex-shrink-0">
          <div
            onClick={() => setSpousalRollover(v => !v)}
            className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${spousalRollover ? 'bg-gray-900 dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            <span className={`inline-block h-3 w-3 rounded-full bg-white dark:bg-gray-900 shadow transform transition-transform mt-0.5 ${spousalRollover ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-[11px] text-gray-600 dark:text-gray-400">Spousal Rollover</span>
        </label>
      </div>

      {spousalRollover && estate.rrifBalance > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-2 space-y-1">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">⚠ Tax deferred, not eliminated</p>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">
            The {fmt(estate.rrifBalance)} RRIF balance rolls to the surviving spouse tax-free at first death. However, the full amount remains taxable — it will be included as income when the spouse withdraws or at their death, potentially at a higher rate if stacked on top of their own income.
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-relaxed">
            This tool does not model the second death. The deferred tax liability of approximately {fmt(deferredRrifTax)} is not shown here.
          </p>
        </div>
      )}

      {/* Visual bar */}
      {estate.grossEstate > 0 && <NetBar estate={estate} />}

      {/* Account sections */}
      <div className="space-y-2">

        {/* RRSP / RRIF */}
        {estate.rrifBalance > 0 && (
          <Section
            label="RRSP / RRIF"
            balance={estate.rrifBalance}
            badge={spousalRollover ? 'Rolled to spouse' : `${pct(estate.rrifEffRate)} tax`}
            badgeColor={spousalRollover ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' : 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'}
          >
            {spousalRollover ? (
              <Line label="Tax deferred to second death" value="$0 now" accent="text-blue-500" indent />
            ) : (
              <>
                <Line label="Fully included as income at death" value={fmt(estate.rrifBalance)} indent />
                <Line label={`Tax (${pct(estate.rrifEffRate)} effective)`} value={`−${fmt(estate.rrifTax)}`} accent="text-red-500" indent />
                <Line label="Net to estate" value={fmt(estate.rrifBalance - estate.rrifTax)} accent="text-gray-700 dark:text-gray-300" indent />
              </>
            )}
          </Section>
        )}

        {/* Non-Registered */}
        {estate.nonRegBalance > 0 && (
          <Section label="Non-Registered" balance={estate.nonRegBalance} badge="Capital gains" badgeColor="text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400">
            <Line label="Cost basis" value={fmt(estate.nonRegBasis)} indent />
            <Line label="Accrued gain" value={fmt(estate.nonRegGain)} indent />
            <Line label="Taxable (50% inclusion)" value={fmt(Math.round(estate.nonRegGain * 0.5))} indent />
            <Line label="Capital gains tax" value={`−${fmt(estate.nonRegTax)}`} accent="text-red-500" indent />
            <Line label="Net to estate" value={fmt(estate.nonRegBalance - estate.nonRegTax)} accent="text-gray-700 dark:text-gray-300" indent />
          </Section>
        )}

        {/* TFSA */}
        {estate.tfsaBalance > 0 && (
          <Section label="TFSA" balance={estate.tfsaBalance} badge="Tax-free" badgeColor="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400">
            <Line label="Passes to beneficiary with no tax" value="✓" accent="text-emerald-600" indent />
          </Section>
        )}

      </div>

      {/* Summary totals */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1.5">
        <Line label="Gross estate" value={fmt(estate.grossEstate)} />
        {estate.totalTax > 0 && (
          <Line label="Total tax at death" value={`−${fmt(estate.totalTax)}`} accent="text-red-500" />
        )}
        {estate.probateFee > 0 && (
          <Line
            label={`Probate fees (${province})`}
            value={`−${fmt(estate.probateFee)}`}
            accent="text-amber-600"
          />
        )}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Net Estate to Heirs</span>
          <span className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmt(estate.netEstate)}</span>
        </div>
        {estate.grossEstate > 0 && (
          <p className="text-[10px] text-gray-400 text-right">
            {pct(estate.netEstate / estate.grossEstate)} of gross estate preserved
          </p>
        )}
      </div>

      {/* Probate footnote */}
      <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed">
        Assumes RRSP/RRIF and TFSA pass directly to named beneficiaries (bypassing probate). Probate applies to non-registered assets only. Calculations are estimates — consult an estate lawyer for precise planning.
      </p>
    </div>
    </div>
  )
}
