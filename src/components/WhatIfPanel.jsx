import { useState, useMemo, useRef } from 'react'
import { runSimulation, runMonteCarlo } from '../lib/simulate.js'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function delta(a, b, invert = false) {
  if (a == null || b == null) return null
  const diff = b - a
  if (Math.abs(diff) < 500) return null
  const abs  = Math.abs(diff)
  const sign = diff > 0 ? '+' : '−'
  const str  = abs >= 1_000_000 ? `${sign}$${(abs / 1_000_000).toFixed(2)}M`
             : abs >= 1_000     ? `${sign}$${(abs / 1_000).toFixed(0)}K`
             : `${sign}$${Math.round(abs).toLocaleString()}`
  return { str, good: invert ? diff < 0 : diff > 0 }
}

function pctDelta(a, b) {
  if (a == null || b == null) return null
  const diff = b - a
  if (Math.abs(diff) < 0.5) return null
  return { str: `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(0)} pp`, good: diff > 0 }
}

// ─── Comparison row ───────────────────────────────────────────────────────────

function CmpRow({ label, base, wi, d, note }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <span className="text-[11px] text-gray-400 dark:text-gray-500 w-28 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 justify-end flex-wrap">
        <span className="text-[11px] text-gray-400 tabular-nums">{base}</span>
        {d ? (
          <>
            <span className="text-[10px] text-gray-300 dark:text-gray-600">→</span>
            <span className="text-[11px] font-semibold tabular-nums text-gray-800 dark:text-gray-200">{wi}</span>
            <span className={`text-[10px] font-semibold ${d.good ? 'text-emerald-600' : 'text-red-500'}`}>{d.str}</span>
          </>
        ) : (
          <span className="text-[10px] text-gray-300 dark:text-gray-600 italic">no change</span>
        )}
        {note && <span className="text-[10px] text-amber-500">{note}</span>}
      </div>
    </div>
  )
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, onChange, display, changed }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <span className={`font-medium tabular-nums ${changed ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
          {display}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-gray-900 dark:accent-white"
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WhatIfPanel({
  inputs, strategy, rrspDrawdown,
  cashOutflows, cashOutflowTaxRates, retCashInflows,
  scenarioActive, effectiveScenario,
  baseResult, mcActive,
}) {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef(null)

  const [retireAdj,   setRetireAdj]   = useState(0)
  const [spendAdj,    setSpendAdj]    = useState(0)
  const [returnAdj,   setReturnAdj]   = useState(0)
  const [lifespanAdj, setLifespanAdj] = useState(0)

  const hasChanges = retireAdj !== 0 || spendAdj !== 0 || returnAdj !== 0 || lifespanAdj !== 0

  function reset() { setRetireAdj(0); setSpendAdj(0); setReturnAdj(0); setLifespanAdj(0) }

  // Compact description for the collapsed card
  const description = !hasChanges
    ? 'Plan adjustments'
    : [
        retireAdj   !== 0 ? `Retire ${retireAdj > 0 ? '+' : ''}${retireAdj} yr`   : null,
        spendAdj    !== 0 ? `${spendAdj > 0 ? '+' : '−'}${fmt(Math.abs(spendAdj))}/yr` : null,
        returnAdj   !== 0 ? `Returns ${returnAdj > 0 ? '+' : ''}${returnAdj}%` : null,
        lifespanAdj !== 0 ? `Life ${lifespanAdj > 0 ? '+' : ''}${lifespanAdj} yr`   : null,
      ].filter(Boolean).join(' · ')

  // ── What-if computation ──────────────────────────────────────────────────────
  const baseSpend = baseResult?.rows?.[0]?.grossWithdrawal ?? strategy.strategyParams.baseAmount ?? 60000

  const wiInputs = useMemo(() => ({
    ...inputs,
    retirementAge:  inputs.retirementAge  + retireAdj,
    lifeExpectancy: inputs.lifeExpectancy + lifespanAdj,
    accounts: inputs.accounts.map(a => ({
      ...a,
      returnRate: Math.max(0, (a.returnRate ?? 6) + returnAdj),
    })),
  }), [inputs, retireAdj, returnAdj, lifespanAdj])

  const wiStrategy = useMemo(() => {
    if (spendAdj === 0) return strategy
    const p = strategy.strategyParams
    return {
      ...strategy,
      strategyParams: {
        ...p,
        baseAmount:    Math.max(1000, (p.baseAmount    ?? baseSpend) + spendAdj),
        annualExpense: Math.max(1000, (p.annualExpense ?? baseSpend) + spendAdj),
        rate: strategy.strategyType === 'fixedPct' && baseSpend > 0
          ? Math.max(0.005, p.rate * ((baseSpend + spendAdj) / baseSpend))
          : (p.rate ?? 0.04),
      },
    }
  }, [strategy, spendAdj, baseSpend])

  const wiInvalid = wiInputs.retirementAge >= wiInputs.lifeExpectancy

  const wiResult = useMemo(() => {
    if (!hovered || !hasChanges || wiInvalid) return null
    try {
      return runSimulation({
        ...wiInputs,
        cashOutflows,
        cashOutflowTaxRates,
        cashInflows:    retCashInflows,
        strategyType:   wiStrategy.strategyType,
        strategyParams: { ...wiStrategy.strategyParams, inflation: wiInputs.inflation / 100 },
        rrspDrawdown,
        scenarioShock: scenarioActive ? effectiveScenario : null,
      })
    } catch { return null }
  }, [hovered, hasChanges, wiInvalid, wiInputs, wiStrategy, rrspDrawdown, cashOutflows, cashOutflowTaxRates, retCashInflows, scenarioActive, effectiveScenario])

  const wiMc = useMemo(() => {
    if (!mcActive || !wiResult?.rows?.length) return null
    try { return runMonteCarlo(wiInputs, wiResult.rows) } catch { return null }
  }, [mcActive, wiInputs, wiResult])

  const bs = baseResult?.summary
  const ws = wiResult?.summary

  // ── Slider display labels ─────────────────────────────────────────────────────
  const retireDisplay = retireAdj === 0
    ? `Age ${inputs.retirementAge}`
    : `Age ${inputs.retirementAge + retireAdj} (${retireAdj > 0 ? '+' : ''}${retireAdj} yr)`

  const spendDisplay = spendAdj === 0
    ? 'No change'
    : `${spendAdj > 0 ? '+' : '−'}${fmt(Math.abs(spendAdj))}/yr`

  const returnDisplay = returnAdj === 0
    ? 'No change'
    : `${returnAdj > 0 ? '+' : ''}${returnAdj.toFixed(1)}% all accounts`

  const lifeDisplay = lifespanAdj === 0
    ? `Age ${inputs.lifeExpectancy}`
    : `Age ${inputs.lifeExpectancy + lifespanAdj} (${lifespanAdj > 0 ? '+' : ''}${lifespanAdj} yr)`

  return (
    <div
      className="relative w-52"
      style={{ zIndex: hovered ? 50 : 1 }}
      onMouseEnter={() => { clearTimeout(leaveTimer.current); setHovered(true) }}
      onMouseLeave={() => { leaveTimer.current = setTimeout(() => setHovered(false), 150) }}
    >
      {/* Collapsed card */}
      <div className={`card cursor-default transition-shadow duration-200 ${hovered ? 'shadow-md' : ''} ${hasChanges ? '!border-gray-400 dark:!border-gray-500' : ''}`}>
        <div className="flex items-start py-0.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">What-If Analysis</h2>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${hovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{description}</p>
          </div>
        </div>
      </div>

      {/* Hover overlay */}
      {hovered && (
        <div className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl space-y-3" style={{ zIndex: 50, minWidth: 360 }}>

          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">What-If Analysis</h3>
            </div>
            {hasChanges && (
              <button
                onClick={reset}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {/* Sliders */}
          <div className="space-y-2">
            <SliderRow label="Retire at"  value={retireAdj}   min={-5}     max={5}     step={1}    onChange={setRetireAdj}   display={retireDisplay}  changed={retireAdj !== 0} />
            <SliderRow label="Spending"   value={spendAdj}    min={-30000} max={30000} step={1000} onChange={setSpendAdj}    display={spendDisplay}   changed={spendAdj !== 0} />
            <SliderRow label="Returns"    value={returnAdj}   min={-3}     max={3}     step={0.5}  onChange={setReturnAdj}   display={returnDisplay}  changed={returnAdj !== 0} />
            <SliderRow label="Lifespan"   value={lifespanAdj} min={-10}    max={10}    step={1}    onChange={setLifespanAdj} display={lifeDisplay}    changed={lifespanAdj !== 0} />
          </div>

          {/* Comparison */}
          {wiInvalid && (
            <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-2.5 py-1.5">
              Retirement age must be before life expectancy.
            </p>
          )}

          {hasChanges && wiResult && bs && ws && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Impact vs Base Plan</p>
              <div className="border border-gray-100 dark:border-gray-800 rounded-lg px-2.5 py-1">
                <CmpRow
                  label="Final Balance"
                  base={fmt(bs.portfolioExhaustedAge ? 0 : bs.finalBalance)}
                  wi={fmt(ws.portfolioExhaustedAge ? 0 : ws.finalBalance)}
                  d={delta(bs.portfolioExhaustedAge ? 0 : bs.finalBalance, ws.portfolioExhaustedAge ? 0 : ws.finalBalance)}
                  note={ws.portfolioExhaustedAge ? `⚠ age ${ws.portfolioExhaustedAge}` : null}
                />
                <CmpRow
                  label="Net Income"
                  base={fmt(bs.totalNetIncome)}
                  wi={fmt(ws.totalNetIncome)}
                  d={delta(bs.totalNetIncome, ws.totalNetIncome)}
                />
                <CmpRow
                  label="Total Tax"
                  base={fmt(bs.totalTaxPaid)}
                  wi={fmt(ws.totalTaxPaid)}
                  d={delta(bs.totalTaxPaid, ws.totalTaxPaid, true)}
                />
                <CmpRow
                  label="Years Funded"
                  base={`${bs.yearsInRetirement} yrs`}
                  wi={`${ws.yearsInRetirement} yrs`}
                  d={ws.yearsInRetirement !== bs.yearsInRetirement
                    ? { str: `${ws.yearsInRetirement - bs.yearsInRetirement > 0 ? '+' : ''}${ws.yearsInRetirement - bs.yearsInRetirement} yrs`, good: ws.yearsInRetirement > bs.yearsInRetirement }
                    : null}
                />
                {mcActive && wiMc && baseResult?.mcProb != null && (
                  <CmpRow
                    label="Success %"
                    base={`${Math.round(baseResult.mcProb * 100)}%`}
                    wi={`${Math.round(wiMc.probabilityOfSuccess * 100)}%`}
                    d={pctDelta(Math.round(baseResult.mcProb * 100), Math.round(wiMc.probabilityOfSuccess * 100))}
                  />
                )}
              </div>
            </div>
          )}

          {!hasChanges && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-1">
              Adjust a slider to see the impact on your plan.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
