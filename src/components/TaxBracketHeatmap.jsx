import { useState, useRef } from 'react'
import { runSimulation } from '../lib/simulate.js'

// ─── Federal brackets (2025) ──────────────────────────────────────────────────
const FEDERAL_BPA = 15705

const BRACKETS = [
  { rate: 0.15,  max: 57375,   label: '15%',   hex: '#6ee7b7' },
  { rate: 0.205, max: 114750,  label: '20.5%', hex: '#fde68a' },
  { rate: 0.26,  max: 158519,  label: '26%',   hex: '#fdba74' },
  { rate: 0.29,  max: 220000,  label: '29%',   hex: '#f87171' },
  { rate: 0.33,  max: Infinity,label: '33%',   hex: '#b91c1c' },
]

// Gross income threshold to stay within a bracket (taxable + BPA)
const BRACKET_GROSS_CEILING = BRACKETS.map(b => ({
  ...b,
  grossCeiling: b.max === Infinity ? Infinity : b.max + FEDERAL_BPA,
}))

function getBracketIndex(grossIncome) {
  const taxable = Math.max(0, grossIncome - FEDERAL_BPA)
  const idx = BRACKETS.findIndex(b => taxable <= b.max)
  return idx === -1 ? BRACKETS.length - 1 : idx
}

function fmtK(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function CellTooltip({ row, bracketIdx, isJump, x, y }) {
  if (!row) return null
  const bracket = BRACKETS[bracketIdx]
  const left = Math.min(x + 12, window.innerWidth - 210)
  const top  = Math.max(8, y - 160)
  return (
    <div
      className="pointer-events-none fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2.5 text-xs w-48"
      style={{ left, top }}
    >
      {/* Age */}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
        Age {row.age}{isJump && <span className="ml-1.5 text-orange-500 font-semibold">↑ bracket jump</span>}
      </p>

      {/* Key metrics — prominent */}
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Marginal</p>
          <p className="text-base font-bold leading-none mt-0.5" style={{ color: bracket.hex }}>
            {bracket.label}
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5">federal</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Effective</p>
          <p className="text-base font-bold leading-none mt-0.5 text-gray-700 dark:text-gray-200">
            {(row.effectiveRate * 100).toFixed(1)}%
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5">of gross</p>
        </div>
      </div>

      {/* Secondary details */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-1.5 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-gray-400">Gross income</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">{fmtK(row.grossIncome)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total tax</span>
          <span className="font-medium text-red-500">{fmtK(row.totalTax)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Optimizer candidates ─────────────────────────────────────────────────────

const SEQUENCES = [
  ['nonreg', 'tfsa',   'rrif'],
  ['rrif',   'nonreg', 'tfsa'],
  ['nonreg', 'rrif',   'tfsa'],
  ['tfsa',   'nonreg', 'rrif'],
]

const DRAWDOWN_CANDIDATES = [
  { type: 'none' },
  ...BRACKET_GROSS_CEILING.filter(b => b.grossCeiling !== Infinity).map(b => ({
    type: 'targetBracket', targetAnnualIncome: Math.round(b.grossCeiling),
  })),
]

const SEQ_NAMES = {
  'rrif-nonreg-tfsa':   'RRIF First',
  'nonreg-tfsa-rrif':   'Capital Gains First',
  'nonreg-rrif-tfsa':   'TFSA Last',
  'tfsa-nonreg-rrif':   'TFSA First',
}

function seqName(seq) {
  return SEQ_NAMES[(seq ?? []).join('-')] ?? (seq ?? []).join(' → ') ?? 'Default'
}

function drawdownName(d) {
  if (!d || d.type === 'none')          return 'None'
  if (d.type === 'targetBracket')       return `Target Bracket ${fmtK(d.targetAnnualIncome)}/yr`
  if (d.type === 'fixedAmount')         return `Fixed ${fmtK(d.fixedAmount)}/yr`
  if (d.type === 'targetAge')           return `Deplete by age ${d.targetAge}`
  return d.type
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaxBracketHeatmap({ rows, retirementAge, rrspDrawdown, onFixDrawdown, onFixSequence, simParams }) {
  const [hovered,   setHovered]   = useState(null)
  const [applied,   setApplied]   = useState(false)
  const [optimized, setOptimized] = useState(false)
  const [changes,   setChanges]   = useState(null)  // { drawdown, sequence } before → after
  const [prevState, setPrevState] = useState(null)  // for undo
  const scrollRef  = useRef(null)
  const dragState  = useRef({ dragging: false, startX: 0, scrollLeft: 0 })

  if (!rows?.length) return null

  const retRows = rows.filter(r => r.age >= retirementAge)
  if (!retRows.length) return null

  const cellW = Math.max(18, Math.min(36, 700 / retRows.length))

  // ── Bracket indices per year ──
  const bracketIndices = retRows.map(r => getBracketIndex(r.grossIncome))

  // ── Detect jumps: year where bracket index is higher than any previous year ──
  const jumpSet = new Set()
  let runningMax = bracketIndices[0] ?? 0
  for (let i = 1; i < bracketIndices.length; i++) {
    if (bracketIndices[i] > runningMax) {
      jumpSet.add(i)
      runningMax = bracketIndices[i]
    }
  }

  const hasJumps = jumpSet.size > 0

  // ── Auto-fix logic ──
  // Find the modal (most common) bracket in the first half of retirement
  // and set targetBracket to the ceiling of that bracket
  function computeFix() {
    const half = Math.ceil(retRows.length / 2)
    const counts = {}
    for (let i = 0; i < half; i++) {
      const idx = bracketIndices[i]
      counts[idx] = (counts[idx] ?? 0) + 1
    }
    const baseIdx = parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
    const ceiling = BRACKET_GROSS_CEILING[baseIdx].grossCeiling
    // cap at a sensible maximum (don't target Infinity bracket)
    const targetIncome = Math.min(ceiling, BRACKET_GROSS_CEILING[baseIdx === BRACKETS.length - 1 ? baseIdx - 1 : baseIdx].grossCeiling)
    return { type: 'targetBracket', targetAnnualIncome: Math.round(targetIncome) }
  }

  function captureAndApply(newDrawdown, newSeq) {
    const oldDrawdown = rrspDrawdown
    const oldSeq      = simParams?.withdrawalSequence ?? ['nonreg', 'tfsa', 'rrif']

    // Save for undo
    setPrevState({ drawdown: oldDrawdown, sequence: oldSeq })

    // Build change summary
    const diffs = []
    if (drawdownName(oldDrawdown) !== drawdownName(newDrawdown)) {
      diffs.push({ label: 'RRSP Drawdown', from: drawdownName(oldDrawdown), to: drawdownName(newDrawdown) })
    }
    if (seqName(oldSeq) !== seqName(newSeq)) {
      diffs.push({ label: 'Withdrawal Sequence', from: seqName(oldSeq), to: seqName(newSeq) })
    }
    setChanges(diffs)

    onFixDrawdown?.(newDrawdown)
    onFixSequence?.(newSeq)
  }

  function handleFix() {
    const fix    = computeFix()
    const newSeq = ['rrif', 'nonreg', 'tfsa']
    captureAndApply(fix, newSeq)
    setApplied(true)
    setTimeout(() => setApplied(false), 2500)
  }

  function handleOptimize() {
    if (!simParams) return
    let best = null
    for (const seq of SEQUENCES) {
      for (const drawdown of DRAWDOWN_CANDIDATES) {
        try {
          const r = runSimulation({ ...simParams, rrspDrawdown: drawdown, withdrawalSequence: seq })
          if (!r.summary.portfolioExhaustedAge && (best === null || r.summary.totalTaxPaid < best.tax)) {
            best = { tax: r.summary.totalTaxPaid, drawdown, seq }
          }
        } catch { /* skip */ }
      }
    }
    if (!best) return
    captureAndApply(best.drawdown, best.seq)
    setOptimized(true)
    setTimeout(() => setOptimized(false), 3000)
  }

  function handleUndo() {
    if (!prevState) return
    onFixDrawdown?.(prevState.drawdown)
    onFixSequence?.(prevState.sequence)
    setPrevState(null)
    setChanges(null)
    setApplied(false)
    setOptimized(false)
  }

  // ── Drag-to-scroll ──
  function onMouseDown(e) {
    dragState.current = { dragging: true, startX: e.pageX, scrollLeft: scrollRef.current.scrollLeft }
    scrollRef.current.style.cursor = 'grabbing'
    setHovered(null)
  }
  function onMouseMove(e) {
    if (!dragState.current.dragging) return
    e.preventDefault()
    scrollRef.current.scrollLeft = dragState.current.scrollLeft - (e.pageX - dragState.current.startX)
  }
  function onMouseUp() {
    dragState.current.dragging = false
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
  }

  return (
    <div className="card space-y-3">

      {/* Header + legend */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Tax Bracket Heatmap</h3>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            Federal marginal bracket hit each year · drag to scroll · hover for details
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
          {BRACKETS.map(b => (
            <span key={b.rate} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: b.hex }} />
              {b.label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap ml-1">
            <span className="text-orange-500 font-bold text-[11px]">↑</span> bracket jump
          </span>
        </div>
      </div>

      {/* Heatmap strip */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Federal Marginal Bracket — each column = 1 year
        </p>

        <div
          ref={scrollRef}
          className="overflow-x-auto select-none no-scrollbar"
          style={{ cursor: 'grab', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { onMouseUp(); setHovered(null) }}
        >
          <div className="flex gap-px pb-1">
            {retRows.map((row, i) => {
              const bIdx      = bracketIndices[i]
              const bracket   = BRACKETS[bIdx]
              const isJump    = jumpSet.has(i)
              const showLabel = row.age === retirementAge || row.age % 5 === 0
              const isHovered = hovered?.i === i

              return (
                <div
                  key={row.age}
                  className="relative flex flex-col items-center gap-0.5 flex-shrink-0"
                  style={{ width: cellW }}
                  onMouseEnter={e => setHovered({ i, x: e.clientX, y: e.clientY })}
                  onMouseMove={e => setHovered(h => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Bracket cell */}
                  <div
                    className="w-full rounded-sm transition-opacity relative"
                    style={{
                      height: 36,
                      backgroundColor: bracket.hex,
                      opacity: row.grossIncome > 0 ? (isHovered ? 0.75 : 1) : 0.15,
                      outline: isHovered ? '2px solid rgba(0,0,0,0.25)' : 'none',
                    }}
                  >
                    {/* Jump arrow */}
                    {isJump && (
                      <span
                        className="absolute inset-0 flex items-center justify-center text-orange-700 font-bold leading-none"
                        style={{ fontSize: Math.max(10, cellW * 0.5) }}
                      >↑</span>
                    )}
                  </div>

                  {/* Age label */}
                  <span className={`text-[9px] text-gray-400 dark:text-gray-500 tabular-nums leading-none ${showLabel ? '' : 'invisible'}`}>
                    {row.age}
                  </span>

                  {/* Tooltip */}
                  {isHovered && <CellTooltip row={row} bracketIdx={bIdx} isJump={isJump} x={hovered.x} y={hovered.y} />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Fix banner */}
      {onFixDrawdown && (
        <div className={`border rounded-lg px-3 py-2 space-y-2 transition-colors ${
          hasJumps
            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
            : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {hasJumps ? (
                <>
                  <p className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">
                    {jumpSet.size} bracket jump{jumpSet.size > 1 ? 's' : ''} detected
                  </p>
                  <p className="text-[10px] text-orange-600 dark:text-orange-500 mt-1 leading-relaxed">
                    <span className="font-semibold">Higher tax early</span> is usually fine — you have more assets earning returns to offset it.
                    <span className="font-semibold"> Higher tax late</span> is costly: mandatory RRIF minimums force large taxable withdrawals on a shrinking portfolio, and the full RRIF balance is taxed as income at death.
                    Ideally brackets stay flat or trend down through retirement.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    No bracket jumps — income is well levelled
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                    Flat or declining brackets mean you're drawing registered funds at predictable, lower rates rather than deferring until RRIF minimums force large late-life withdrawals at higher rates. Run Optimize to confirm this is the lowest-tax combination.
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-row gap-1.5 flex-shrink-0 items-start">

              {/* Auto-fix */}
              <div className="relative group">
                <button
                  onClick={handleFix}
                  className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all w-full ${
                    applied
                      ? 'bg-emerald-500 text-white'
                      : hasJumps
                        ? 'bg-orange-500 hover:bg-orange-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {applied ? '✓ Applied' : 'Auto-fix'}
                </button>
                <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-56 bg-gray-900 dark:bg-gray-700 text-white text-[10px] leading-relaxed rounded-lg px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-xl">
                  <p className="font-semibold mb-0.5">Optimizes for lower tax</p>
                  <p className="text-gray-300">This adjusts withdrawal sequence and RRSP drawdown to reduce taxes on withdrawals. It does <span className="text-white font-semibold">not</span> guarantee the highest portfolio balance at death — a higher drawdown may deplete assets faster.</p>
                </div>
              </div>

              {/* Optimize */}
              {simParams && (
                <div className="relative group">
                  <button
                    onClick={handleOptimize}
                    className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all w-full ${
                      optimized
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-800 dark:bg-gray-200 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900'
                    }`}
                  >
                    {optimized ? '✓ Optimized' : '⚡ Optimize'}
                  </button>
                  <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-56 bg-gray-900 dark:bg-gray-700 text-white text-[10px] leading-relaxed rounded-lg px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-xl">
                    <p className="font-semibold mb-0.5">Brute-force tax minimization</p>
                    <p className="text-gray-300">Tests all 20 combinations of withdrawal sequence and bracket targets, picking the lowest lifetime tax paid. This does <span className="text-white font-semibold">not</span> guarantee the highest portfolio balance at death — minimizing tax on withdrawals and maximizing final wealth are different goals.</p>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Change summary + undo */}
          {changes && changes.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1.5">
              <div className="space-y-1">
                {changes.map(c => (
                  <div key={c.label} className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-gray-400 dark:text-gray-500 w-32 flex-shrink-0">{c.label}</span>
                    <span className="text-gray-500 dark:text-gray-400 line-through">{c.from}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{c.to}</span>
                  </div>
                ))}
              </div>
              {prevState && (
                <button
                  onClick={handleUndo}
                  className="text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2 transition-colors"
                >
                  ↩ Undo changes
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tax Insights */}
      {rows.some(r => r.totalTax > 0) && (
        <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Tax Insights — Lifetime Totals</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Total Federal Tax</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">
                {fmtK(rows.reduce((s, r) => s + r.federalTax, 0))}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Total Provincial Tax</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">
                {fmtK(rows.reduce((s, r) => s + r.provincialTax, 0))}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Total OAS Clawback</p>
              <p className={`text-sm font-semibold mt-0.5 ${rows.some(r => r.oasClawback > 0) ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                {fmtK(rows.reduce((s, r) => s + r.oasClawback, 0))}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Effective Rate (yr 1)</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">
                {retRows[0] ? `${(retRows[0].effectiveRate * 100).toFixed(1)}% eff.` : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Portfolio at Death</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">
                {fmtK(rows[rows.length - 1]?.portfolioTotal ?? 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OAS clawback callout */}
      {retRows.some(r => r.oasClawback > 0) && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-500 dark:text-red-400">
          <span>⚠</span>
          <span>Some years exceed the OAS clawback threshold (~$91K gross income)</span>
        </div>
      )}

      <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed">
        Each cell is one year of retirement. Colour = highest federal bracket reached on that year's gross income. ↑ marks years where income jumped to a higher bracket than any prior year — typically caused by growing RRIF minimums or CPP/OAS starting. Auto-fix sets RRIF First sequencing and a target bracket drawdown to smooth income.
      </p>
    </div>
  )
}
