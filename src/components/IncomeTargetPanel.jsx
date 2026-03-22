import { useState, useMemo, useRef, useEffect } from 'react'
import { calcCPP, calcOAS, calcDB } from '../lib/simulate.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function annualItem(item) {
  if (item.subItems?.length > 0)
    return item.subItems.reduce((s, si) => s + (si.months ?? []).reduce((a, b) => a + b, 0), 0)
  return (item.months ?? []).reduce((a, b) => a + b, 0)
}

function getDefaultMultiplier(sectionName, itemName) {
  const sn = (sectionName ?? '').toLowerCase()
  const n  = (itemName   ?? '').toLowerCase()
  if (sn.includes('savings'))                              return 0
  if (n.includes('mortgage') || n.includes('rent'))        return 50
  if (n.includes('car payment'))                           return 0
  if (n.includes('travel'))                                return 120
  if (n.includes('transit'))                               return 60
  if (n.includes('groceries') || n.includes('grocery'))    return 90
  if (n.includes('dining') || n.includes('restaurant'))    return 100
  if (n.includes('entertainment'))                         return 100
  return 80
}

function fmt(n) {
  if (n == null || n === 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IncomeTargetPanel({
  budget,
  inputs,
  onOpenBudget,
  incomeTargetEnabled,
  onEnabledChange,
  onAmountChange,
  strategyAmount,
}) {
  const [hovered,        setHovered]        = useState(false)
  const [warnVisible,    setWarnVisible]    = useState(false)
  const leaveTimer = useRef(null)

  // Flat list of all expense items with section metadata
  const allItems = useMemo(() => {
    const items = []
    for (const sec of budget?.expenseSections ?? []) {
      for (const item of sec.items ?? []) {
        items.push({ ...item, sectionId: sec.id, sectionName: sec.name })
      }
    }
    return items
  }, [budget])

  // Retirement multipliers — keyed by item id, 0–150 (%)
  const [multipliers, setMultipliers] = useState(() => {
    const m = {}
    for (const sec of budget?.expenseSections ?? []) {
      for (const item of sec.items ?? []) {
        m[item.id] = getDefaultMultiplier(sec.name, item.name)
      }
    }
    return m
  })

  // Auto-initialise any new budget items with smart defaults
  useEffect(() => {
    setMultipliers(prev => {
      let changed = false
      const next = { ...prev }
      for (const sec of budget?.expenseSections ?? []) {
        for (const item of sec.items ?? []) {
          if (next[item.id] == null) {
            next[item.id] = getDefaultMultiplier(sec.name, item.name)
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }, [budget])

  // Computed annual spending target after applying multipliers
  const annualTarget = useMemo(() => {
    let total = 0
    for (const item of allItems) {
      const annual = annualItem(item)
      const pct = multipliers[item.id] ?? getDefaultMultiplier(item.sectionName, item.name)
      total += annual * (pct / 100)
    }
    return Math.round(total)
  }, [allItems, multipliers])

  // Push current amount to parent every time it changes
  useEffect(() => {
    onAmountChange(annualTarget)
  }, [annualTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guaranteed income sources at retirement age
  const guaranteed = useMemo(() => {
    const cpp = calcCPP({
      avgEarnings:      inputs.cppAvgEarnings,
      yearsContributed: inputs.cppYearsContributed,
      startAge:         inputs.cppStartAge,
    })
    const oas = calcOAS({
      yearsResident: inputs.oasYearsResident,
      startAge:      inputs.oasStartAge,
    })
    const db = inputs.dbEnabled
      ? calcDB({
          bestAvgSalary: inputs.dbBestAvgSalary,
          yearsService:  inputs.dbYearsService,
          accrualRate:   inputs.dbAccrualRate,
          startAge:      inputs.dbStartAge,
          indexingRate:  inputs.dbIndexingRate,
        }, inputs.dbStartAge)
      : 0
    const other = inputs.otherPension ?? 0
    return { cpp, oas, db, other, total: cpp + oas + db + other }
  }, [inputs])

  const portfolioNeed     = Math.max(0, annualTarget - guaranteed.total)
  const requiredPortfolio = portfolioNeed > 0 ? Math.round(portfolioNeed / 0.04) : 0
  const hasBudgetData     = allItems.length > 0 && allItems.some(i => annualItem(i) > 0)

  return (
    <div
      className="relative w-52"
      style={{ zIndex: hovered ? 50 : 1 }}
      onMouseEnter={() => { clearTimeout(leaveTimer.current); setHovered(true) }}
      onMouseLeave={() => { leaveTimer.current = setTimeout(() => setHovered(false), 150) }}
    >
      {/* ── Collapsed card ── */}
      <div className={`card cursor-default transition-shadow duration-200 ${hovered ? 'shadow-md' : ''} ${incomeTargetEnabled ? '!border-blue-300 dark:!border-blue-700' : ''}`}>
        <div className="flex items-start py-0.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Income Target</h2>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${hovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              {incomeTargetEnabled && annualTarget > 0 ? `${fmt(annualTarget)}/yr` : 'Module off'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Hover overlay ── */}
      {hovered && (
        <div
          className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl space-y-3"
          style={{ zIndex: 50, minWidth: 380, maxHeight: '80vh', overflowY: 'auto' }}
        >

          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Income Target</h3>

              {/* ⓘ warning */}
              <div
                className="relative"
                onMouseEnter={() => setWarnVisible(true)}
                onMouseLeave={() => setWarnVisible(false)}
              >
                <span className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-[9px] font-bold flex items-center justify-center cursor-help select-none">i</span>
                {warnVisible && (
                  <div
                    className="absolute left-0 top-5 bg-gray-900 text-white text-[10px] leading-relaxed rounded-lg px-2.5 py-2 shadow-xl z-50"
                    style={{ width: 230, pointerEvents: 'none' }}
                  >
                    ⚠ For accurate results, complete the Budget Planner with your current spending first. Each category can then be scaled for retirement.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Open Budget Planner link */}
              <button
                onClick={() => { onOpenBudget?.(); setHovered(false) }}
                className="text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
              >
                → Open Budget Planner
              </button>

              {/* Active / Inactive toggle */}
              <button
                onClick={() => onEnabledChange(!incomeTargetEnabled)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                  incomeTargetEnabled
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {incomeTargetEnabled ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>

          {/* Override status banner */}
          {incomeTargetEnabled ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-2">
              <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                ⚡ Simulation is using this target
              </p>
              {strategyAmount > 0 && (
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
                  Replaces strategy spend of {fmt(strategyAmount)}/yr
                  {annualTarget !== strategyAmount && (
                    <span className={`ml-1 font-medium ${annualTarget < strategyAmount ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      ({annualTarget < strategyAmount ? '−' : '+'}{fmt(Math.abs(annualTarget - strategyAmount))})
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Toggle <span className="font-medium text-gray-700 dark:text-gray-300">Active</span> to use this target as the simulation's spending amount instead of the strategy setting.
              </p>
            </div>
          )}

          {/* No budget data nudge */}
          {!hasBudgetData && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-2">
              <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                Enter spending in the Budget Planner to populate this module with your actual expenses.
              </p>
            </div>
          )}

          {/* Category multiplier sliders */}
          {allItems.length > 0 && (
            <div className="space-y-3">
              {(budget?.expenseSections ?? []).map(sec => (
                <div key={sec.id} className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{sec.name}</p>
                  {sec.items.map(item => {
                    const annual   = annualItem(item)
                    const pct      = multipliers[item.id] ?? getDefaultMultiplier(sec.name, item.name)
                    const adjusted = Math.round(annual * pct / 100)
                    return (
                      <div key={item.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <span className="text-gray-600 dark:text-gray-400 truncate">{item.name}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-gray-400 dark:text-gray-500 tabular-nums text-[10px] w-8 text-right">{pct}%</span>
                            <span className={`font-medium tabular-nums w-14 text-right ${pct === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                              {fmt(adjusted)}
                            </span>
                          </div>
                        </div>
                        <input
                          type="range" min={0} max={150} step={5}
                          value={pct}
                          onChange={e => setMultipliers(m => ({ ...m, [item.id]: parseInt(e.target.value) }))}
                          className="w-full accent-gray-900 dark:accent-white"
                        />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Gap analysis */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Gap Analysis</p>

            <div className="border border-gray-100 dark:border-gray-800 rounded-lg px-2.5 py-2 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500 dark:text-gray-400">Annual target</span>
                <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">{fmt(annualTarget)}</span>
              </div>

              {guaranteed.cpp > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-gray-500 pl-3">CPP</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">−{fmt(guaranteed.cpp)}</span>
                </div>
              )}
              {guaranteed.oas > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-gray-500 pl-3">OAS</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">−{fmt(guaranteed.oas)}</span>
                </div>
              )}
              {guaranteed.db > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-gray-500 pl-3">DB Pension</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">−{fmt(guaranteed.db)}</span>
                </div>
              )}
              {guaranteed.other > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-gray-500 pl-3">Other Pension</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">−{fmt(guaranteed.other)}</span>
                </div>
              )}

              <div className="flex justify-between text-[11px] pt-1 border-t border-gray-100 dark:border-gray-800">
                <span className="font-medium text-gray-700 dark:text-gray-300">Portfolio must supply</span>
                <span className={`font-semibold tabular-nums ${portfolioNeed > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {portfolioNeed > 0 ? `${fmt(portfolioNeed)}/yr` : 'Fully covered ✓'}
                </span>
              </div>

              {portfolioNeed > 0 && (
                <div className="flex justify-between text-[11px] pt-0.5">
                  <span className="text-gray-400 dark:text-gray-500">Required portfolio @ 4% SWR</span>
                  <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">{fmt(requiredPortfolio)}</span>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
