import { useState, useMemo, useRef } from 'react'
import { runSimulation } from '../lib/simulate.js'

// ─── Presets ──────────────────────────────────────────────────────────────────

export const SEQUENCES = [
  {
    id:    'nonreg-tfsa-rrif',
    order: ['nonreg', 'tfsa', 'rrif'],
    label: 'Non-Reg → TFSA → RRIF',
    name:  'Capital Gains First',
    desc:  'Draws taxable capital gains first, then tax-free TFSA, leaving RRIF income until last. Default — often suboptimal as RRIF grows unchecked.',
  },
  {
    id:    'rrif-nonreg-tfsa',
    order: ['rrif', 'nonreg', 'tfsa'],
    label: 'RRIF → Non-Reg → TFSA',
    name:  'Registered First',
    desc:  'Draws RRIF income early to fill lower tax brackets and shrink the registered account, then non-reg capital gains, with TFSA compounding tax-free the longest. Usually the most tax-efficient.',
  },
  {
    id:    'nonreg-rrif-tfsa',
    order: ['nonreg', 'rrif', 'tfsa'],
    label: 'Non-Reg → RRIF → TFSA',
    name:  'TFSA Last',
    desc:  'Clears non-registered (capital gains) first, then registered income, leaving the full TFSA balance to pass to heirs tax-free. Prioritises estate value.',
  },
  {
    id:    'tfsa-nonreg-rrif',
    order: ['tfsa', 'nonreg', 'rrif'],
    label: 'TFSA → Non-Reg → RRIF',
    name:  'TFSA First',
    desc:  'Draws tax-free TFSA first to minimise current-year income tax, then capital gains, deferring all RRIF income. RRIF and non-reg keep growing — often higher estate tax.',
  },
]

export const DEFAULT_SEQUENCE = SEQUENCES[0].order

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function seqKey(order) { return order.join('-') }

function matchPreset(order) {
  return SEQUENCES.find(s => seqKey(s.order) === seqKey(order ?? DEFAULT_SEQUENCE)) ?? null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SequencingAdvisor({
  inputs, strategy, rrspDrawdown,
  cashOutflows, cashOutflowTaxRates, retCashInflows,
  scenarioActive, effectiveScenario,
  onApply,
}) {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef(null)

  const currentOrder   = inputs.withdrawalSequence ?? DEFAULT_SEQUENCE
  const currentPreset  = matchPreset(currentOrder)

  // Run all 4 sequences for comparison (only when panel is open)
  const comparisons = useMemo(() => {
    if (!hovered) return null
    const baseParams = {
      ...inputs,
      cashOutflows,
      cashOutflowTaxRates,
      cashInflows:    retCashInflows,
      strategyType:   strategy.strategyType,
      strategyParams: { ...strategy.strategyParams, inflation: inputs.inflation / 100 },
      rrspDrawdown,
      scenarioShock:  scenarioActive ? effectiveScenario : null,
    }
    return SEQUENCES.map(seq => {
      try {
        const r = runSimulation({ ...baseParams, withdrawalSequence: seq.order })
        return {
          ...seq,
          totalTax:     r.summary.totalTaxPaid,
          finalBalance: r.summary.finalBalance,
          exhausted:    !!r.summary.portfolioExhaustedAge,
          exhaustedAge: r.summary.portfolioExhaustedAge,
        }
      } catch {
        return { ...seq, totalTax: null, finalBalance: null, exhausted: false }
      }
    })
  }, [hovered, inputs, strategy, rrspDrawdown, cashOutflows, cashOutflowTaxRates, retCashInflows, scenarioActive, effectiveScenario])

  // Best = lowest total tax among solvent sequences
  const bestId = useMemo(() => {
    if (!comparisons) return null
    const solvent = comparisons.filter(c => !c.exhausted && c.totalTax != null)
    if (!solvent.length) return null
    return solvent.reduce((a, b) => a.totalTax <= b.totalTax ? a : b).id
  }, [comparisons])

  const subtitle = currentPreset ? currentPreset.name : 'Custom'

  return (
    <div
      className="relative w-52"
      style={{ zIndex: hovered ? 50 : 1 }}
      onMouseEnter={() => { clearTimeout(leaveTimer.current); setHovered(true) }}
      onMouseLeave={() => { leaveTimer.current = setTimeout(() => setHovered(false), 150) }}
    >
      {/* ── Collapsed card ── */}
      <div className={`card cursor-default transition-shadow duration-200 ${hovered ? 'shadow-md' : ''}`}>
        <div className="flex items-start py-0.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Withdrawal Sequence</h2>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${hovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* ── Hover overlay ── */}
      {hovered && (
        <div className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl space-y-3" style={{ zIndex: 50, minWidth: 420 }}>

          {/* Header */}
          <div>
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Withdrawal Sequence</h3>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Order in which accounts are drawn beyond RRIF minimums. Affects lifetime tax, final balance, and estate.
            </p>
          </div>

          {/* Sequence cards */}
          <div className="space-y-1.5">
            {SEQUENCES.map(seq => {
              const cmp       = comparisons?.find(c => c.id === seq.id)
              const isCurrent = seqKey(currentOrder) === seqKey(seq.order)
              const isBest    = bestId === seq.id

              return (
                <div
                  key={seq.id}
                  onClick={!isCurrent ? () => onApply(seq.order) : undefined}
                  className={`rounded-lg border px-3 py-2 space-y-1 transition-colors ${
                    isCurrent
                      ? 'border-gray-900 dark:border-gray-300 bg-gray-50 dark:bg-gray-800/60'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer'
                  }`}
                >
                  {/* Row 1: name + badges + apply */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[11px] font-semibold ${isCurrent ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                        {seq.name}
                      </span>
                      {isBest && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                          Best tax
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          Active
                        </span>
                      )}
                    </div>
                    {!isCurrent && (
                      <span className="text-[10px] font-medium text-gray-400 flex-shrink-0">
                        Select →
                      </span>
                    )}
                  </div>

                  {/* Row 2: order pill */}
                  <div className="flex items-center gap-1">
                    {seq.order.map((t, i) => (
                      <span key={t} className="flex items-center gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          t === 'rrif'   ? 'bg-amber-100  dark:bg-amber-900/30  text-amber-700  dark:text-amber-400'  :
                          t === 'tfsa'   ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                                           'bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-400'
                        }`}>
                          {t === 'rrif' ? 'RRIF' : t === 'tfsa' ? 'TFSA' : 'Non-Reg'}
                        </span>
                        {i < 2 && <span className="text-[10px] text-gray-300 dark:text-gray-600">→</span>}
                      </span>
                    ))}
                  </div>

                  {/* Row 3: description */}
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">{seq.desc}</p>

                  {/* Row 4: comparison numbers */}
                  {cmp && (
                    <div className="flex items-center gap-4 pt-0.5">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        Tax <span className={`font-medium tabular-nums ${isBest ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-300'}`}>{fmt(cmp.totalTax)}</span>
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        Final Portfolio <span className="font-medium tabular-nums text-gray-600 dark:text-gray-300">
                          {cmp.exhausted ? <span className="text-red-500">⚠ age {cmp.exhaustedAge}</span> : fmt(cmp.finalBalance)}
                        </span>
                      </span>
                    </div>
                  )}
                  {!cmp && (
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 italic">Computing…</p>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-2">
            RRIF minimums are always drawn first regardless of sequence. Sequence controls discretionary withdrawals only. Tax figures are cumulative lifetime totals.
          </p>
        </div>
      )}
    </div>
  )
}
