import { useState, useEffect, useRef } from 'react'
import { formatWhileEditing, parseFormatted, handleArrowKeys } from '../lib/inputHelpers.js'

export function fmtCell(n) {
  if (n == null || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

// ─── One-Time Inflow Cell ─────────────────────────────────────────────────────
export function InflowCell({
  age, value, onChange,
  // retirement summary props (optional)
  inflowForSpending = 0, inflowSurplus = 0, inflowInvestedTo = null,
  inflowSurplusTfsa = 0, inflowSurplusNonReg = 0, tfsaAnnualLimit = null,
  // accumulation label (optional)
  accLabel = null,
}) {
  const [editing,     setEditing]     = useState(false)
  const [local,       setLocal]       = useState(value > 0 ? String(value) : '')
  const [showPopover, setShowPopover] = useState(false)
  const leaveTimer = useRef(null)

  useEffect(() => { setLocal(value > 0 ? String(value) : '') }, [value])

  function handleEnter() { clearTimeout(leaveTimer.current); if (value > 0) setShowPopover(true) }
  function handleLeave() { leaveTimer.current = setTimeout(() => setShowPopover(false), 300) }

  function commit() {
    const n = parseFloat(String(local).replace(/,/g, ''))
    onChange(age, isNaN(n) || n <= 0 ? 0 : Math.round(n))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="relative flex items-center">
        <span className="absolute left-1.5 text-gray-400 text-xs select-none">$</span>
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={local}
          onChange={e => { const f = formatWhileEditing(e.target.value); setLocal(f) }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setEditing(false)
            else handleArrowKeys(e, { value: parseFormatted(local) || 0, step: 1000, min: 0, onChange: v => setLocal(v.toLocaleString()) })
          }}
          className="w-24 pl-4 pr-1 py-0.5 text-xs border border-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>
    )
  }

  // Determine if we have retirement breakdown data
  const hasBreakdown = value > 0 && (inflowForSpending > 0 || inflowSurplus > 0 || inflowInvestedTo)

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        onClick={() => setEditing(true)}
        className={`text-left w-full px-1 py-0.5 rounded transition-colors ${
          value > 0
            ? 'text-green-600 font-medium hover:bg-green-50 dark:hover:bg-green-900/30'
            : 'text-gray-300 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30'
        }`}
        title="Click to add a one-time cash inflow · Hover to see breakdown"
      >
        {value > 0 ? `+${fmtCell(value)}` : '+ add'}
      </button>

      {showPopover && value > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64 whitespace-normal dark:bg-gray-800 dark:border-gray-500">
          <p className="text-xs font-semibold text-gray-700 mb-2 dark:text-gray-200">
            Cash inflow: <span className="text-green-600">+{fmtCell(value)}</span>
          </p>

          {accLabel ? (
            <p className="text-xs text-gray-500">{accLabel}</p>
          ) : hasBreakdown ? (
            <div className="text-xs space-y-1.5">
              {inflowForSpending > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Covers spending</span>
                  <span>{fmtCell(inflowForSpending)}</span>
                </div>
              )}
              {inflowForSpending === 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Covers spending</span>
                  <span className="text-green-500">All covered by income</span>
                </div>
              )}
              {inflowSurplus > 0 && inflowInvestedTo && (
                <>
                  {inflowSurplusTfsa > 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Surplus → TFSA</span>
                      <span>{fmtCell(inflowSurplusTfsa)}</span>
                    </div>
                  )}
                  {inflowSurplusNonReg > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span className="dark:text-gray-400">Surplus → Non-Reg{inflowSurplusTfsa > 0 ? ' (over TFSA limit)' : ''}</span>
                      <span>{fmtCell(inflowSurplusNonReg)}</span>
                    </div>
                  )}
                  {tfsaAnnualLimit !== null && (
                    <div className={`text-xs rounded p-1.5 mt-1 ${inflowSurplusTfsa > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {inflowSurplusTfsa > 0
                        ? `✓ TFSA limit: $${tfsaAnnualLimit.toLocaleString()}/yr · tax-free growth`
                        : inflowInvestedTo === 'Non-Reg'
                          ? 'No TFSA available — returns subject to tax drag'
                          : `TFSA limit: $${tfsaAnnualLimit.toLocaleString()}/yr`}
                    </div>
                  )}
                </>
              )}
              {inflowSurplus === 0 && inflowForSpending > 0 && (
                <p className="text-xs text-gray-400 italic">No surplus — fully used for spending</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              Reduces portfolio withdrawal needed this year.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── One-Time Outflow Cell (with hover tax-rate slider) ───────────────────────
export function OutflowCell({ age, value, taxRate = 0, onChange, onTaxRateChange }) {
  const [editing,     setEditing]     = useState(false)
  const [local,       setLocal]       = useState(value > 0 ? String(value) : '')
  const [showPopover, setShowPopover] = useState(false)
  const leaveTimer = useRef(null)

  useEffect(() => { setLocal(value > 0 ? String(value) : '') }, [value])

  function handleEnter() { clearTimeout(leaveTimer.current); if (value > 0) setShowPopover(true) }
  function handleLeave() { leaveTimer.current = setTimeout(() => setShowPopover(false), 300) }

  function commit() {
    const n = parseFloat(String(local).replace(/,/g, ''))
    onChange(age, isNaN(n) || n <= 0 ? 0 : Math.round(n))
    setEditing(false)
  }

  const rate     = taxRate || 0
  const grossAmt = value > 0 && rate > 0 ? Math.round(value / (1 - rate)) : value
  const taxAmt   = grossAmt - value

  if (editing) {
    return (
      <div className="relative flex items-center">
        <span className="absolute left-1.5 text-gray-400 text-xs select-none">$</span>
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={local}
          onChange={e => { const f = formatWhileEditing(e.target.value); setLocal(f) }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setEditing(false)
            else handleArrowKeys(e, { value: parseFormatted(local) || 0, step: 1000, min: 0, onChange: v => setLocal(v.toLocaleString()) })
          }}
          className="w-24 pl-4 pr-1 py-0.5 text-xs border border-red-400 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
        />
      </div>
    )
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        onClick={() => setEditing(true)}
        className={`text-left w-full px-1 py-0.5 rounded transition-colors ${
          value > 0
            ? 'text-red-600 font-medium hover:bg-red-50 dark:hover:bg-red-900/30'
            : 'text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
        }`}
        title="Click to set amount · Hover to set tax rate"
      >
        {value > 0 ? (
          <span>
            {fmtCell(value)}
            {rate > 0 && (
              <span className="text-red-400 font-normal text-xs ml-1">
                +{Math.round(rate * 100)}%T
              </span>
            )}
          </span>
        ) : '+ add'}
      </button>

      {showPopover && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-60 whitespace-normal dark:bg-gray-800 dark:border-gray-500">
          <p className="text-xs font-semibold text-gray-700 mb-2 dark:text-gray-200">Tax rate on withdrawal</p>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="range"
              min={0}
              max={55}
              step={1}
              value={Math.round(rate * 100)}
              onChange={e => onTaxRateChange(age, parseInt(e.target.value) / 100)}
              onMouseDown={e => e.stopPropagation()}
              className="flex-1 accent-red-500"
            />
            <span className="text-xs font-semibold text-gray-700 w-8 text-right tabular-nums dark:text-gray-200">
              {Math.round(rate * 100)}%
            </span>
          </div>

          {rate > 0 ? (
            <div className="text-xs space-y-1 border-t border-gray-100 pt-2 mt-1 dark:border-gray-700">
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>Net expense</span>
                <span>{fmtCell(value)}</span>
              </div>
              <div className="flex justify-between text-red-500">
                <span>Tax withheld</span>
                <span>{fmtCell(taxAmt)}</span>
              </div>
              <div className="flex justify-between font-semibold text-gray-800 pt-1 border-t border-gray-100 dark:text-gray-200 dark:border-gray-700">
                <span>Gross withdrawal</span>
                <span>{fmtCell(grossAmt)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
              Drag to set effective tax rate if funded from a taxable source (e.g. RRIF).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
