import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { calcTax, rrif_minimum } from '../lib/tax.js'
import { calcCPP, calcOAS } from '../lib/simulate.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function fmtShort(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

// Project a balance forward with annual contributions and a return rate (no withdrawals)
function projectBalance(balance, annualContrib, returnPct, years) {
  const r = returnPct / 100
  if (r === 0) return balance + annualContrib * years
  return balance * Math.pow(1 + r, years) +
    annualContrib * (Math.pow(1 + r, years) - 1) / r
}

// ─── Core simulation ──────────────────────────────────────────────────────────
// Runs a retirement-phase year-by-year projection comparing base vs. meltdown.
// Meltdown draws happen from retirementAge up to age 72 (before mandatory factors peak).

function runScenario({
  rrifAtRetirement,
  tfsaAtRetirement,
  rrifReturn,
  tfsaReturn,
  retirementAge,
  lifeExpectancy,
  annualCPP,
  annualOAS,
  annualPension,
  province,
  extraDrawPerYear,   // 0 = base case
}) {
  let rrif = rrifAtRetirement
  let tfsa = tfsaAtRetirement
  const MELTDOWN_END = 72          // stop extra draws once mandatory minimums dominate

  let totalRrifTax  = 0
  let totalExtraCost = 0  // marginal tax on extra draws (= tax cost of converting)
  let totalExtraDrawn = 0

  for (let age = retirementAge; age < lifeExpectancy; age++) {
    const govIncome = { cpp: annualCPP, oas: annualOAS, pension: annualPension }

    // RRIF mandatory minimum (CRA prescribed factor)
    const minDraw = rrif_minimum(age, rrif)

    // Extra meltdown draw — only before mandatory factors dominate
    const extra = (extraDrawPerYear > 0 && age < MELTDOWN_END)
      ? Math.min(extraDrawPerYear, Math.max(0, rrif - minDraw))
      : 0

    const totalDraw = minDraw + extra

    // Tax on total RRIF income + government income
    const taxFull = calcTax({ rrif: totalDraw, ...govIncome, province }).total

    // Marginal tax specifically from the extra draw (to track conversion cost)
    const taxBase = calcTax({ rrif: minDraw, ...govIncome, province }).total
    const marginalOnExtra = Math.max(0, taxFull - taxBase)

    totalRrifTax   += taxFull
    totalExtraCost += marginalOnExtra
    totalExtraDrawn += extra

    // After-tax extra invested in TFSA
    const afterTaxExtra = Math.max(0, extra - marginalOnExtra)
    tfsa = (tfsa + afterTaxExtra) * (1 + tfsaReturn / 100)

    // Update RRIF
    rrif = Math.max(0, rrif - totalDraw) * (1 + rrifReturn / 100)
  }

  return {
    totalRrifTax:    Math.round(totalRrifTax),
    totalExtraCost:  Math.round(totalExtraCost),
    totalExtraDrawn: Math.round(totalExtraDrawn),
    finalRrif:       Math.round(rrif),
    finalTfsa:       Math.round(tfsa),
    finalTotal:      Math.round(rrif + tfsa),
  }
}

// ─── Chart tooltip ─────────────────────────────────────────────────────────────

function MeltdownTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 text-xs space-y-0.5">
      <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">
        {label === '0' ? 'No meltdown' : `+${fmtShort(parseInt(label))}/yr`}
      </p>
      <p className={d.netSaving >= 0 ? 'text-emerald-600' : 'text-red-500'}>
        Net saving: {d.netSaving >= 0 ? '' : '−'}{fmt(Math.abs(d.netSaving))}
      </p>
      <p className="text-gray-400">Tax cost of draws: {fmt(d.extraCost)}</p>
      <p className="text-gray-400">Tax saved later: {fmt(d.taxSaved)}</p>
      <p className="text-gray-400 border-t dark:border-gray-700 pt-1 mt-1">Final balance: {fmt(d.finalTotal)}</p>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RrifMeltdownOptimizer({ inputs, rrspDrawdown, onApply }) {
  const [selectedDraw, setSelectedDraw] = useState(null) // null = use recommendation

  const province    = inputs.province ?? 'ON'
  const currentAge  = inputs.currentAge ?? 45
  const retAge      = inputs.retirementAge ?? 65
  const lifeExp     = inputs.lifeExpectancy ?? 90
  const rrifReturn  = (inputs.accounts?.find(a => a.taxType === 'rrif')?.returnRate) ?? 6
  const tfsaReturn  = (inputs.accounts?.find(a => a.taxType === 'tfsa')?.returnRate) ?? 6
  const rrifBal     = (inputs.accounts?.find(a => a.taxType === 'rrif')?.balance) ?? 0
  const rrifContrib = (inputs.accounts?.find(a => a.taxType === 'rrif')?.annualContribution) ?? 0
  const tfsaBal     = (inputs.accounts?.find(a => a.taxType === 'tfsa')?.balance) ?? 0
  const tfsaContrib = (inputs.accounts?.find(a => a.taxType === 'tfsa')?.annualContribution) ?? 0

  const accYears = Math.max(0, retAge - currentAge)

  // Project to retirement
  const rrifAtRet = useMemo(() =>
    Math.round(projectBalance(rrifBal, rrifContrib, rrifReturn, accYears)),
    [rrifBal, rrifContrib, rrifReturn, accYears])

  const tfsaAtRet = useMemo(() =>
    Math.round(projectBalance(tfsaBal, tfsaContrib, tfsaReturn, accYears)),
    [tfsaBal, tfsaContrib, tfsaReturn, accYears])

  // Government income at retirement
  const annualCPP = useMemo(() => calcCPP({
    avgEarnings:      inputs.cppAvgEarnings      ?? 0,
    yearsContributed: inputs.cppYearsContributed ?? 0,
    startAge:         inputs.cppStartAge         ?? 65,
  }), [inputs.cppAvgEarnings, inputs.cppYearsContributed, inputs.cppStartAge])

  const annualOAS = useMemo(() => calcOAS({
    yearsResident: inputs.oasYearsResident ?? 40,
    startAge:      inputs.oasStartAge     ?? 65,
  }), [inputs.oasYearsResident, inputs.oasStartAge])

  const annualDB = useMemo(() => {
    if (!inputs.dbEnabled) return 0
    const years = inputs.dbYearsService ?? 0
    const rate  = inputs.dbAccrualRate  ?? 1.5
    const sal   = inputs.dbBestAvgSalary ?? 0
    return Math.round(sal * years * rate / 100)
  }, [inputs.dbEnabled, inputs.dbYearsService, inputs.dbAccrualRate, inputs.dbBestAvgSalary])

  const annualPension = annualDB + (inputs.otherPension ?? 0)

  // Scenarios to compare
  const DRAW_OPTIONS = [0, 10_000, 20_000, 30_000, 40_000, 50_000, 75_000]

  const simArgs = {
    rrifAtRetirement: rrifAtRet,
    tfsaAtRetirement: tfsaAtRet,
    rrifReturn, tfsaReturn,
    retirementAge: retAge,
    lifeExpectancy: lifeExp,
    annualCPP, annualOAS,
    annualPension, province,
  }

  const scenarios = useMemo(() =>
    DRAW_OPTIONS.map(draw => ({
      draw,
      ...runScenario({ ...simArgs, extraDrawPerYear: draw }),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rrifAtRet, tfsaAtRet, rrifReturn, tfsaReturn, retAge, lifeExp, annualCPP, annualOAS, annualPension, province])

  const baseScenario = scenarios[0]

  // Compute net saving vs. baseline for each scenario
  const chartData = scenarios.map(s => ({
    label: String(s.draw),
    draw:  s.draw,
    taxSaved:  Math.max(0, baseScenario.totalRrifTax - s.totalRrifTax),
    extraCost: s.totalExtraCost,
    netSaving: (baseScenario.totalRrifTax - s.totalRrifTax) - s.totalExtraCost,
    finalTotal: s.finalTotal,
  }))

  const bestScenario = chartData.reduce((best, s) => s.netSaving > best.netSaving ? s : best, chartData[0])
  const activeDraw   = selectedDraw ?? bestScenario.draw
  const activeData   = chartData.find(s => s.draw === activeDraw) ?? chartData[0]

  // Peak mandatory minimum at age 82 (typical high point)
  const peakMinAge = 82
  const yearsToRet = retAge - currentAge
  const rrifAt82   = rrifAtRet > 0
    ? Math.round(rrifAtRet * Math.pow(1 + rrifReturn / 100, Math.max(0, peakMinAge - retAge)))
    : 0
  const peakMinDraw = rrifAt82 > 0 ? Math.round(rrif_minimum(peakMinAge, rrifAt82)) : 0
  const peakTaxRate = peakMinDraw > 0
    ? Math.round(calcTax({ rrif: peakMinDraw, cpp: annualCPP, oas: annualOAS, pension: annualPension, province }).effectiveRate * 100)
    : 0

  // Current drawdown setting
  const currentMeltdown = rrspDrawdown?.type === 'fixedAmount'
    ? (rrspDrawdown.fixedAmount ?? 0)
    : 0

  function handleApply() {
    if (!onApply || activeDraw === 0) return
    onApply({
      type:            'fixedAmount',
      fixedAmount:     activeDraw,
      reinvestSurplus: true,
    })
  }

  const noRrif = rrifBal === 0 && rrifAtRet === 0

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">RRIF Meltdown Optimizer</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            Should you convert RRSP → TFSA early to reduce future tax?
          </p>
        </div>
      </div>

      {noRrif ? (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 py-4 text-center">
          No RRSP/RRIF account found. Add one in Accounts to use this tool.
        </p>
      ) : (
        <>
          {/* Projection summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-2 text-center">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">RRIF at retirement</p>
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{fmt(rrifAtRet)}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">age {retAge}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-2 text-center">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Peak mandatory</p>
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{fmt(peakMinDraw)}/yr</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">around age {peakMinAge}</p>
            </div>
            <div className={`rounded-lg px-2.5 py-2 text-center ${peakTaxRate >= 35 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-800/60'}`}>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Est. tax rate</p>
              <p className={`text-xs font-semibold mt-0.5 ${peakTaxRate >= 35 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                ~{peakTaxRate}%
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">at peak draw</p>
            </div>
          </div>

          {/* Explanation */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Drawing extra from your RRIF between retirement and age 72 (before mandatory
            minimums peak) and investing the after-tax proceeds in your TFSA can lower
            your total lifetime tax bill. The chart below shows how much you save at each
            annual drawdown level.
          </p>

          {/* Bar chart — net lifetime tax saving */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              Net lifetime tax saving vs. no meltdown
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barSize={26}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => v === '0' ? 'None' : `+${fmtShort(parseInt(v))}`}
                />
                <YAxis
                  tick={{ fontSize: 10 }} width={44}
                  tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
                />
                <Tooltip content={<MeltdownTooltip />} />
                <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                <Bar dataKey="netSaving" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => {
                    const isActive  = entry.draw === activeDraw
                    const isBest    = entry.draw === bestScenario.draw && entry.draw > 0
                    const isNeg     = entry.netSaving < 0
                    return (
                      <Cell
                        key={i}
                        fill={isActive && isNeg ? '#fca5a5'
                            : isActive           ? '#3b82f6'
                            : isBest             ? '#10b981'
                            : isNeg              ? '#fecaca'
                            :                      '#d1fae5'}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedDraw(entry.draw)}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Best</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />Selected</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block" />Net loss</span>
              <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600 italic">Click bar to select</span>
            </div>
          </div>

          {/* Comparison row */}
          <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden text-[11px]">
            <div className="grid grid-cols-4 gap-0 bg-gray-50 dark:bg-gray-800/60 px-2 py-1 text-[10px] text-gray-400 dark:text-gray-500 font-medium">
              <span>Strategy</span>
              <span className="text-right">Tax cost now</span>
              <span className="text-right">Tax saved later</span>
              <span className="text-right">Net saving</span>
            </div>
            {chartData.map(d => {
              const isActive = d.draw === activeDraw
              const isBest   = d.draw === bestScenario.draw && d.draw > 0
              return (
                <button
                  key={d.draw}
                  onClick={() => setSelectedDraw(d.draw)}
                  className={`w-full grid grid-cols-4 gap-0 px-2 py-1.5 text-left transition-colors border-t border-gray-100 dark:border-gray-800 ${
                    isActive ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                  }`}
                >
                  <span className={`font-medium ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {d.draw === 0 ? 'No meltdown' : `+${fmtShort(d.draw)}/yr`}
                    {isBest && <span className="ml-1 text-emerald-500">★</span>}
                    {isActive && !isBest && <span className="ml-1 text-blue-400">✓</span>}
                  </span>
                  <span className="text-right text-gray-500 dark:text-gray-400 tabular-nums">
                    {d.draw === 0 ? '—' : fmt(d.extraCost)}
                  </span>
                  <span className={`text-right tabular-nums font-medium ${d.taxSaved > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                    {d.taxSaved > 0 ? fmt(d.taxSaved) : '—'}
                  </span>
                  <span className={`text-right tabular-nums font-semibold ${
                    d.draw === 0 ? 'text-gray-400' :
                    d.netSaving > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                  }`}>
                    {d.draw === 0 ? 'baseline'
                      : d.netSaving >= 0 ? `+${fmt(d.netSaving)}`
                      : `−${fmt(Math.abs(d.netSaving))}`}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Recommendation + apply */}
          {bestScenario.draw > 0 && bestScenario.netSaving > 0 ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                ★ Recommended: draw an extra {fmt(bestScenario.draw)}/yr until age 72
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-500 leading-relaxed">
                Estimated lifetime tax saving: <span className="font-semibold">{fmt(bestScenario.netSaving)}</span> —
                pay <span className="font-medium">{fmt(bestScenario.taxSaved)}</span> less
                in future mandatory withdrawals at the cost of <span className="font-medium">{fmt(bestScenario.extraCost)}</span> in extra tax now.
              </p>
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={() => {
                    setSelectedDraw(bestScenario.draw)
                    if (onApply) onApply({ type: 'fixedAmount', fixedAmount: bestScenario.draw, reinvestSurplus: true })
                  }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  Apply Recommended
                </button>
                {activeDraw !== bestScenario.draw && activeDraw > 0 && (
                  <button
                    onClick={handleApply}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Apply {fmt(activeDraw)}/yr instead
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                {rrifAtRet < 50_000
                  ? 'Your projected RRIF balance at retirement is relatively low — mandatory minimums are unlikely to push you into a significantly higher bracket.'
                  : 'Based on your current inputs, mandatory withdrawals are not expected to significantly exceed your early-retirement income level. Monitor as your inputs change.'}
              </p>
            </div>
          )}

          {/* Current plan note */}
          {currentMeltdown > 0 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-2">
              Your plan currently has RRSP drawdown set to <span className="font-medium text-gray-600 dark:text-gray-300">{fmt(currentMeltdown)}/yr</span>.
              {' '}Click Apply above to update it.
            </p>
          )}

          {/* Footnote */}
          <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-2">
            Meltdown draws modelled from retirement to age 72 only. Tax on extra draws uses marginal rates from{' '}
            calcTax. Does not account for TFSA room limits, OAS clawback interactions, or investment returns
            on reinvested proceeds. Apply updates the RRSP Drawdown setting in your plan.
          </p>
        </>
      )}
    </div>
  )
}
