import { useState, useRef } from 'react'
import { formatWhileEditing, parseFormatted, handleArrowKeys, flashCommit } from '../lib/inputHelpers.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { calcTax } from '../lib/tax.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

const CPP_RATE = 0.0595; const CPP_YMPE = 68500; const CPP_YBE = 3500
const CPP2_RATE = 0.04;  const CPP2_UPPER = 73200
const EI_RATE = 0.0166;  const EI_MAX_IE = 65700

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcMonthlyNet(incomes, province) {
  return (incomes ?? []).filter(i => i.enabled !== false).reduce((total, inc) => {
    const gross = inc.grossMonthly ?? inc.monthly ?? 0
    const gAnn  = gross * 12
    if (gAnn <= 0) return total
    const type = inc.type ?? 'other'
    if (type === 'employment') {
      const cpp = Math.max(0, Math.min(gAnn, CPP_YMPE) - CPP_YBE) * CPP_RATE
               + Math.max(0, Math.min(gAnn, CPP2_UPPER) - CPP_YMPE) * CPP2_RATE
      const ei  = Math.min(gAnn, EI_MAX_IE) * EI_RATE
      const tax = calcTax({ rrif: gAnn, province }).total
      return total + (gAnn - cpp - ei - tax) / 12
    }
    if (type === 'self_employment') {
      const cpp = (Math.max(0, Math.min(gAnn, CPP_YMPE) - CPP_YBE) * CPP_RATE * 2)
               + (Math.max(0, Math.min(gAnn, CPP2_UPPER) - CPP_YMPE) * CPP2_RATE * 2)
      const tax = calcTax({ rrif: gAnn, province }).total
      return total + (gAnn - cpp - tax) / 12
    }
    if (type === 'eligible_dividend') {
      const rawTax = calcTax({ rrif: gAnn * 1.38, province }).total
      const tax    = Math.max(0, rawTax - gAnn * 0.150198)
      return total + (gAnn - tax) / 12
    }
    if (type === 'capital_gains') {
      const tax = calcTax({ capitalGain: gAnn, province }).total
      return total + (gAnn - tax) / 12
    }
    const tax = calcTax({ rrif: gAnn, province }).total
    return total + (gAnn - tax) / 12
  }, 0)
}

function itemMonths(item) { return item.months ?? Array(12).fill(item.monthly ?? 0) }

function itemMonthsAgg(item) {
  if (!item.subItems?.length) return itemMonths(item)
  return Array(12).fill(0).map((_, idx) =>
    item.subItems.reduce((s, si) => s + (si.months?.[idx] ?? 0), 0)
  )
}

function getActualForMonth(item, mi) {
  if (item.subItems?.length > 0)
    return item.subItems.reduce((s, si) => s + (si.actualMonths?.[mi] ?? 0), 0)
  return item.actualMonths?.[mi] ?? 0
}

function fmtFull(n) { return `$${Math.round(Math.abs(n)).toLocaleString()}` }
function fmtK(n) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(a/1_000_000).toFixed(1)}M`
  if (a >= 1_000)     return `$${(a/1_000).toFixed(0)}K`
  return `$${Math.round(a)}`
}

// ─── Actual Amount Input ──────────────────────────────────────────────────────

function ActualInput({ value, onChange }) {
  const [local, setLocal]     = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const prevValue = useRef(value)
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={focused ? local : (value > 0 ? Math.round(value).toLocaleString() : '')}
      placeholder="—"
      onFocus={() => { prevValue.current = value; setLocal(value > 0 ? Math.round(value).toLocaleString() : ''); setFocused(true) }}
      onBlur={() => { setFocused(false); const v = parseFormatted(local); const n = isNaN(v) ? 0 : Math.max(0, Math.round(v)); onChange(n); if (n !== prevValue.current) flashCommit(inputRef.current) }}
      onChange={e => { const f = formatWhileEditing(e.target.value); setLocal(f) }}
      onKeyDown={e => handleArrowKeys(e, { value: parseFormatted(local) || value, step: 10, min: 0, onChange: v => { onChange(v); setLocal(v > 0 ? Math.round(v).toLocaleString() : '') } })}
      className="w-[72px] text-right text-[12px] tabular-nums px-1.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600"
    />
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ sec, mi, darkMode, onUpdateActual, onUpdateSubActual }) {
  const [expanded, setExpanded] = useState(false)
  const secVariance = sec.planned - sec.actual
  const fillPct = sec.planned > 0 ? Math.min(1, sec.actual / sec.planned) : 0

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-2.5 text-left"
        onClick={() => setExpanded(p => !p)}
      >
        <span
          className="text-[9px] text-gray-400 transition-transform duration-150 flex-shrink-0"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >▶</span>
        <span className="flex-1 text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{sec.name}</span>
        <div className="flex items-center gap-4 tabular-nums flex-shrink-0">
          <span className="text-[11px] text-gray-400">{fmtFull(sec.planned)}</span>
          <span className={`text-[11px] font-medium w-[72px] text-right ${sec.actual > sec.planned ? 'text-red-600 dark:text-red-400' : sec.actual > 0 ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>
            {sec.actual > 0 ? fmtFull(sec.actual) : '—'}
          </span>
          <span className={`text-[11px] font-semibold w-20 text-right ${
            sec.actual === 0 ? 'text-gray-300 dark:text-gray-700'
            : secVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
          }`}>
            {sec.actual > 0 ? `${secVariance >= 0 ? '−' : '+'}${fmtFull(Math.abs(secVariance))}` : '—'}
          </span>
        </div>
      </button>

      {/* Spend bar */}
      <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            fillPct > 1 ? 'bg-red-400' : fillPct > 0.9 ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
          style={{ width: `${Math.min(100, fillPct * 100)}%` }}
        />
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-0.5">
          {/* Column headers */}
          <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium uppercase tracking-wider pb-1.5 border-b border-gray-100 dark:border-gray-800">
            <span className="flex-1">Item</span>
            <span className="w-[72px] text-right">Budget</span>
            <span className="w-[72px] text-right">Actual</span>
            <span className="w-20 text-right">Variance</span>
          </div>

          {sec.items.map(item => {
            const hasSub    = item.subItems?.length > 0
            const itemVar   = item.planned - item.actual
            return (
              <div key={item.id}>
                {/* Item row */}
                <div className={`flex items-center gap-2 py-1 ${hasSub ? 'opacity-70' : ''}`}>
                  <span className="flex-1 text-[11px] text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                  <span className="w-[72px] text-right text-[11px] text-gray-400 tabular-nums">
                    {item.planned > 0 ? fmtFull(item.planned) : '—'}
                  </span>
                  {hasSub ? (
                    <span className={`w-[72px] text-right text-[11px] tabular-nums ${item.actual > item.planned ? 'text-red-600 dark:text-red-400' : item.actual > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                      {item.actual > 0 ? fmtFull(item.actual) : '—'}
                    </span>
                  ) : (
                    <ActualInput
                      value={item.actual}
                      onChange={val => onUpdateActual(sec.id, item.id, val)}
                    />
                  )}
                  <span className={`w-20 text-right text-[11px] font-medium tabular-nums ${
                    item.actual === 0 ? 'text-gray-300 dark:text-gray-700'
                    : itemVar >= 0 ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                  }`}>
                    {item.actual > 0 ? `${itemVar >= 0 ? '−' : '+'}${fmtFull(Math.abs(itemVar))}` : '—'}
                  </span>
                </div>

                {/* Sub-item rows */}
                {hasSub && item.subItems.map(si => {
                  const siActual  = si.actualMonths?.[mi] ?? 0
                  const siPlanned = si.months?.[mi] ?? 0
                  const siVar     = siPlanned - siActual
                  return (
                    <div key={si.id} className="flex items-center gap-2 py-1 pl-5">
                      <span className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">{si.name}</span>
                      <span className="w-[72px] text-right text-[11px] text-gray-400 tabular-nums">
                        {siPlanned > 0 ? fmtFull(siPlanned) : '—'}
                      </span>
                      <ActualInput
                        value={siActual}
                        onChange={val => onUpdateSubActual(sec.id, item.id, si.id, val)}
                      />
                      <span className={`w-20 text-right text-[11px] font-medium tabular-nums ${
                        siActual === 0 ? 'text-gray-300 dark:text-gray-700'
                        : siVar >= 0 ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                      }`}>
                        {siActual > 0 ? `${siVar >= 0 ? '−' : '+'}${fmtFull(Math.abs(siVar))}` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg text-[11px]">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color ?? p.fill }}>
          {p.name === 'planned' ? 'Budgeted' : 'Actual'}: {fmtFull(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── TrackingApp ──────────────────────────────────────────────────────────────

export default function TrackingApp({ budget, onChange, darkMode }) {
  const { expenseSections = [], incomes = [], province = 'ON' } = budget

  const today        = new Date()
  const [mi, setMi]  = useState(today.getMonth())

  const totalNet = calcMonthlyNet(incomes, province)

  // ── Update handlers ──
  function updateActual(sid, iid, val) {
    onChange({
      ...budget,
      expenseSections: expenseSections.map(s => s.id !== sid ? s : {
        ...s, items: s.items.map(i => {
          if (i.id !== iid) return i
          const m = [...(i.actualMonths ?? Array(12).fill(0))]; m[mi] = val
          return { ...i, actualMonths: m }
        }),
      }),
    })
  }

  function updateSubActual(sid, iid, siid, val) {
    onChange({
      ...budget,
      expenseSections: expenseSections.map(s => s.id !== sid ? s : {
        ...s, items: s.items.map(i => i.id !== iid ? i : {
          ...i, subItems: (i.subItems ?? []).map(si => {
            if (si.id !== siid) return si
            const m = [...(si.actualMonths ?? Array(12).fill(0))]; m[mi] = val
            return { ...si, actualMonths: m }
          }),
        }),
      }),
    })
  }

  // ── Derived data ──
  const sections = expenseSections.map(sec => {
    const items = sec.items.map(item => ({
      ...item,
      planned: itemMonthsAgg(item)[mi] ?? 0,
      actual:  getActualForMonth(item, mi),
    }))
    return {
      ...sec, items,
      planned: items.reduce((s, i) => s + i.planned, 0),
      actual:  items.reduce((s, i) => s + i.actual, 0),
    }
  })

  const totalPlanned  = sections.reduce((s, sec) => s + sec.planned, 0)
  const totalActual   = sections.reduce((s, sec) => s + sec.actual, 0)
  const totalVariance = totalPlanned - totalActual
  const netCashflow   = totalNet - totalActual

  // Month progress (only for current month)
  const isCurrentMonth = mi === today.getMonth()
  const daysInMonth    = new Date(today.getFullYear(), mi + 1, 0).getDate()
  const monthPct       = isCurrentMonth ? today.getDate() / daysInMonth
                       : mi < today.getMonth() ? 1 : 0

  // Pacing: how much should we have spent by today vs how much we have
  const expectedSpend = totalPlanned * monthPct
  const paceVariance  = expectedSpend - totalActual // positive = ahead of pace

  const chartData = sections
    .filter(s => s.planned > 0 || s.actual > 0)
    .map(s => ({ name: s.name, planned: Math.round(s.planned), actual: Math.round(s.actual) }))

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">

        {/* ── Month selector ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
              {MONTH_FULL[mi]} {today.getFullYear()}
            </h2>
            {isCurrentMonth && (
              <span className="text-[10px] text-gray-400">
                Day {today.getDate()} of {daysInMonth} · {Math.round(monthPct * 100)}% through month
              </span>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {MONTHS.map((m, i) => (
              <button
                key={i}
                onClick={() => setMi(i)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  i === mi
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : i === today.getMonth()
                    ? 'bg-brand-50 text-brand-600 border border-brand-200 dark:bg-brand-900/20 dark:text-brand-400 dark:border-brand-800'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >{m}</button>
            ))}
          </div>
          {isCurrentMonth && (
            <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-400 rounded-full" style={{ width: `${monthPct * 100}%` }} />
            </div>
          )}
        </div>

        {/* ── Summary cards ── */}
        <div className={`grid gap-3 ${totalNet > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
          <div className="card py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Budgeted</p>
            <p className="text-base font-bold text-gray-900 dark:text-gray-100">{fmtFull(totalPlanned)}</p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Spent</p>
            <p className={`text-base font-bold ${totalActual > totalPlanned ? 'text-red-600 dark:text-red-400' : totalActual > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
              {totalActual > 0 ? fmtFull(totalActual) : '—'}
            </p>
          </div>
          <div className="card py-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
              {totalVariance >= 0 ? 'Under Budget' : 'Over Budget'}
            </p>
            <p className={`text-base font-bold ${totalActual === 0 ? 'text-gray-400 dark:text-gray-500' : totalVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalActual > 0 ? fmtFull(Math.abs(totalVariance)) : '—'}
            </p>
          </div>
          {totalNet > 0 && (
            <div className="card py-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Net Cashflow</p>
              <p className={`text-base font-bold ${totalActual === 0 ? 'text-gray-400 dark:text-gray-500' : netCashflow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {totalActual > 0 ? `${netCashflow >= 0 ? '+' : '−'}${fmtFull(Math.abs(netCashflow))}` : '—'}
              </p>
            </div>
          )}
        </div>

        {/* ── Pacing insight (current month only) ── */}
        {isCurrentMonth && totalActual > 0 && totalPlanned > 0 && (
          <div className={`card py-3 flex items-center gap-3 border ${paceVariance >= 0 ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'}`}>
            <span className="text-lg flex-shrink-0">{paceVariance >= 0 ? '✓' : '⚡'}</span>
            <div>
              <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                {paceVariance >= 0
                  ? `${fmtFull(paceVariance)} under expected pace`
                  : `${fmtFull(Math.abs(paceVariance))} ahead of expected pace`}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Expected by day {today.getDate()}: {fmtFull(expectedSpend)} · Actual: {fmtFull(totalActual)}
              </p>
            </div>
          </div>
        )}

        {/* ── Chart ── */}
        {chartData.length > 0 && (totalPlanned > 0 || totalActual > 0) && (
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">Budget vs Actual · {MONTHS[mi]}</h3>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -16, bottom: 0 }} barGap={2} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f0f0f0'} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: darkMode ? '#9ca3af' : '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: darkMode ? '#9ca3af' : '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => fmtK(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="planned" name="planned" fill={darkMode ? '#374151' : '#e5e7eb'} radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" name="actual" radius={[2, 2, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.actual > d.planned ? '#f87171' : '#34d399'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-1 justify-end">
              <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300 dark:bg-gray-600 inline-block" />Budgeted</span>
              <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />Under</span>
              <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Over</span>
            </div>
          </div>
        )}

        {/* ── Section cards ── */}
        {sections.length === 0 ? (
          <div className="card py-10 text-center">
            <p className="text-xs text-gray-400 mb-1">No expense categories yet.</p>
            <p className="text-[11px] text-gray-400">Add sections in the Budget Planner first.</p>
          </div>
        ) : (
          sections.map(sec => (
            <SectionCard
              key={sec.id}
              sec={sec}
              mi={mi}
              darkMode={darkMode}
              onUpdateActual={updateActual}
              onUpdateSubActual={updateSubActual}
            />
          ))
        )}

        <p className="text-[11px] text-gray-400 text-center pt-2 pb-2">
          Actuals sync with Budget Planner · For planning purposes only
        </p>

      </div>
    </div>
  )
}
