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

function InfoTip({ text }) {
  const [vis, setVis] = useState(false)
  return (
    <div className="relative inline-flex" onMouseEnter={() => setVis(true)} onMouseLeave={() => setVis(false)}>
      <span className="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[9px] font-bold flex items-center justify-center cursor-help select-none leading-none">i</span>
      {vis && (
        <div className="absolute left-0 top-5 bg-gray-900 text-white text-[10px] leading-relaxed rounded-lg px-2.5 py-2 shadow-xl z-50 w-52 pointer-events-none">
          {text}
        </div>
      )}
    </div>
  )
}

const PHASE_DEFAULTS = [
  { name: 'Active',   years: 10, expenseScale: 100, medicalExpenses: 0 },
  { name: 'Moderate', years: 10, expenseScale:  85, medicalExpenses: 2000 },
  { name: 'Late',     years: 10, expenseScale:  70, medicalExpenses: 5000 },
]

const PHASE_STYLES = [
  { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-100 dark:border-blue-800',   label: 'text-blue-600 dark:text-blue-400',   accent: 'accent-blue-500',   dot: 'bg-blue-400' },
  { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-100 dark:border-violet-800', label: 'text-violet-600 dark:text-violet-400', accent: 'accent-violet-500', dot: 'bg-violet-400' },
  { bg: 'bg-rose-50 dark:bg-rose-900/20',   border: 'border-rose-100 dark:border-rose-800',   label: 'text-rose-600 dark:text-rose-400',   accent: 'accent-rose-500',   dot: 'bg-rose-400' },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function IncomeTargetPanel({
  budget,
  inputs,
  onOpenBudget,
  incomeTargetEnabled,
  onEnabledChange,
  onAmountChange,
  onPhasesChange,
  strategyAmount,
  connectedTop = false,
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

  // Per-item multipliers — keyed by item id, 0–150 (%)
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

  // Retirement phases
  const [phases, setPhases] = useState(PHASE_DEFAULTS)

  function updatePhase(i, patch) {
    setPhases(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  // Base annual target (budget × per-item multipliers)
  const baseAnnualTarget = useMemo(() => {
    let total = 0
    for (const item of allItems) {
      const annual = annualItem(item)
      const pct = multipliers[item.id] ?? getDefaultMultiplier(item.sectionName, item.name)
      total += annual * (pct / 100)
    }
    return Math.round(total)
  }, [allItems, multipliers])

  // Per-phase totals (base × scale + medical)
  const phaseTotals = useMemo(() =>
    phases.map(p => Math.round(baseAnnualTarget * (p.expenseScale / 100) + (p.medicalExpenses || 0))),
    [baseAnnualTarget, phases]
  )

  // Phase 1 drives the simulation
  const annualTarget = phaseTotals[0]

  // Age ranges per phase (derived from retirementAge)
  const retAge = inputs.retirementAge ?? 65
  const phaseRanges = useMemo(() => {
    let age = retAge
    return phases.map(p => {
      const start = age
      const end   = age + p.years
      age = end
      return { start, end }
    })
  }, [phases, retAge])

  // Push Phase 1 amount + full phase schedule to parent on change
  useEffect(() => {
    onAmountChange(annualTarget)
  }, [annualTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onPhasesChange?.(phases.map((p, i) => ({ years: p.years, amount: phaseTotals[i] })))
  }, [phases, phaseTotals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guaranteed income sources at retirement
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
  const hasSliders        = allItems.length > 0

  return (
    <div
      className="relative w-52"
      style={{ zIndex: hovered ? 50 : 1 }}
      onMouseEnter={() => { clearTimeout(leaveTimer.current); setHovered(true) }}
      onMouseLeave={() => { leaveTimer.current = setTimeout(() => setHovered(false), 150) }}
    >
      {/* ── Collapsed card ── */}
      <div className={`card cursor-default transition-shadow duration-200 ${connectedTop ? 'rounded-t-none' : ''} ${hovered ? 'shadow-md' : ''} ${incomeTargetEnabled ? '!border-blue-300 dark:!border-blue-700' : ''}`}>
        <div className="flex items-start py-0.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Spending Target</h2>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${hovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            {incomeTargetEnabled && annualTarget > 0 ? (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                {fmt(phaseTotals[0])} · {fmt(phaseTotals[1])} · {fmt(phaseTotals[2])}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Module off</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Hover overlay ── */}
      {hovered && (
        <div
          className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl space-y-2"
          style={{ zIndex: 50, minWidth: hasSliders ? 720 : 420, maxHeight: '85vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Spending Target</h3>
              <div
                className="relative"
                onMouseEnter={() => setWarnVisible(true)}
                onMouseLeave={() => setWarnVisible(false)}
              >
                <span className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 text-[9px] font-bold flex items-center justify-center cursor-help select-none">i</span>
                {warnVisible && (
                  <div className="absolute left-0 top-5 bg-gray-900 text-white text-[10px] leading-relaxed rounded-lg px-2.5 py-2 shadow-xl z-50" style={{ width: 230, pointerEvents: 'none' }}>
                    ⚠ For accurate results, complete the Budget Planner with your current spending first. Each category can then be scaled for retirement.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { onOpenBudget?.(); setHovered(false) }}
                className="text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
              >
                → Open Budget Module
              </button>
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

          {/* Explainer */}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed border-l-2 border-blue-200 dark:border-blue-700 pl-2.5 py-0.5">
            Fill out your <strong className="text-gray-700 dark:text-gray-300">Budget</strong> and <strong className="text-gray-700 dark:text-gray-300">Big Purchases</strong> based on your current needs — then use the sliders below to scale each category up or down for different phases of retirement.
          </p>

          {/* Status banner */}
          {incomeTargetEnabled ? (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5">
              <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                ⚡ Simulation is using all 3 phases
                {strategyAmount > 0 && annualTarget !== strategyAmount && (
                  <span className={`ml-1 font-medium ${annualTarget < strategyAmount ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    ({annualTarget < strategyAmount ? '−' : '+'}{fmt(Math.abs(annualTarget - strategyAmount))} vs strategy)
                  </span>
                )}
              </p>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-1.5">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Toggle <span className="font-medium text-gray-700 dark:text-gray-300">Active</span> to use phase-based spending in the simulation.
              </p>
            </div>
          )}

          {/* No budget data nudge */}
          {!hasBudgetData && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Enter spending in the Budget Planner to populate actual expenses.
              </p>
            </div>
          )}

          {/* ── Main body: Sliders (left) | Divider | Phases (right) ── */}
          <div className="flex gap-0 border-t border-gray-100 dark:border-gray-800 pt-2">

            {/* ── Left: Base Budget Scaling ── */}
            {hasSliders && (
              <div className="w-64 flex-shrink-0 space-y-2 pr-3">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Base Budget Scaling</p>
                  <InfoTip text="These are your current spending amounts pulled from the Budget module. Use the sliders to adjust what percentage of each expense you expect to carry into retirement — e.g. drop mortgage to 0% if it's paid off, or raise travel to 120% if you plan to spend more." />
                </div>
                {(budget?.expenseSections ?? []).map(sec => (
                  <div key={sec.id} className="space-y-1">
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

            {/* ── Vertical divider ── */}
            {hasSliders && (
              <div className="w-px bg-gray-100 dark:bg-gray-800 mx-1 self-stretch flex-shrink-0" />
            )}

            {/* ── Right: Retirement Phases ── */}
            <div className="flex-1 min-w-0 space-y-1.5 pl-3">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Retirement Phases</p>
                <InfoTip text="Retirement is split into 3 phases — Active (early, higher spending), Moderate (middle, some slowdown), and Late (reduced activity, higher medical). Each phase applies the scaled budget amounts from the left column as your annual spending target." />
              </div>

              {phases.map((phase, i) => {
                const c = PHASE_STYLES[i]
                const range = phaseRanges[i]
                return (
                  <div key={i} className={`rounded-lg border px-2 py-1.5 space-y-1.5 ${c.bg} ${c.border}`}>
                    {/* Phase header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[11px] font-semibold ${c.label}`}>{phase.name}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">Age {range.start}–{range.end}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input
                          type="number" min={1} max={40}
                          value={phase.years}
                          onChange={e => updatePhase(i, { years: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-11 text-center text-[11px] font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-current"
                        />
                        <span className="text-[10px] text-gray-400">yrs</span>
                      </div>
                    </div>

                    {/* Expense scale */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-500 dark:text-gray-400">Expenses</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 tabular-nums text-[10px] w-8 text-right">{phase.expenseScale}%</span>
                          <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300 w-14 text-right">
                            {fmt(Math.round(baseAnnualTarget * phase.expenseScale / 100))}/yr
                          </span>
                        </div>
                      </div>
                      <input
                        type="range" min={10} max={150} step={5}
                        value={phase.expenseScale}
                        onChange={e => updatePhase(i, { expenseScale: parseInt(e.target.value) })}
                        className={`w-full ${c.accent}`}
                      />
                    </div>

                    {/* Medical expenses */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">Medical /yr</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[11px] text-gray-400">$</span>
                        <input
                          type="number" min={0} step={500}
                          value={phase.medicalExpenses}
                          onChange={e => updatePhase(i, { medicalExpenses: Math.max(0, parseInt(e.target.value) || 0) })}
                          placeholder="0"
                          className="w-24 text-right text-[11px] font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-current"
                        />
                      </div>
                    </div>

                    {/* Phase total */}
                    <div className={`flex items-center justify-between pt-0.5 border-t border-current/10`}>
                      <span className={`text-[10px] font-semibold ${c.label}`}>Phase total</span>
                      <span className={`text-[11px] font-semibold tabular-nums ${c.label}`}>{fmt(phaseTotals[i])}/yr</span>
                    </div>
                  </div>
                )
              })}

              {/* Gap analysis (Phase 1) */}
              <div className="pt-1 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Gap Analysis <span className="normal-case font-normal">(Phase 1)</span></p>
                <div className="border border-gray-100 dark:border-gray-800 rounded-lg px-2 py-1.5 space-y-0.5">
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
                      <span className="text-gray-400 dark:text-gray-500">Required @ 4% SWR</span>
                      <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">{fmt(requiredPortfolio)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  )
}
