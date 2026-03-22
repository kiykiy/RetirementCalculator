import { useState, Fragment, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { calcTax, PROVINCES } from '../lib/tax.js'
import { calcTfsaLimit } from '../lib/simulate.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1','#f59e0b','#3b82f6','#10b981','#8b5cf6',
  '#ec4899','#f97316','#16a34a','#0ea5e9','#84cc16',
  '#a855f7','#14b8a6','#f43f5e','#64748b',
]
const CAPEX_COLOR = '#94a3b8'

const CPP_RATE = 0.0595;  const CPP_YMPE = 68500; const CPP_YBE = 3500
const CPP2_RATE = 0.04;   const CPP2_UPPER = 73200
const EI_RATE = 0.0166;   const EI_MAX_IE = 65700

const INCOME_TYPES = [
  { value: 'employment',        label: 'Employment'        },
  { value: 'self_employment',   label: 'Self-Employed'     },
  { value: 'rental',            label: 'Rental'            },
  { value: 'eligible_dividend', label: 'Eligible Dividend' },
  { value: 'capital_gains',     label: 'Capital Gains'     },
  { value: 'benefit',           label: 'Gov. Benefit'      },
  { value: 'other',             label: 'Other'             },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const BUDGET_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'income',    label: 'Income'    },
  { id: 'expenses',  label: 'Expenses'  },
  { id: 'capex',     label: 'CapEx'     },
  { id: 'goals',     label: 'Goals'     },
]

const GOAL_COLORS = ['#16a34a', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2']

let _nextId = 200
function nextId(prefix) { return `${prefix}_${_nextId++}` }

// ─── Tax engine ───────────────────────────────────────────────────────────────

function calcIncomeNet(item, province) {
  const gross = item.grossMonthly ?? item.monthly ?? 0
  const gAnn  = gross * 12
  if (gAnn <= 0) return { gross, cpp: 0, ei: 0, tax: 0, federal: 0, provincial: 0, net: 0 }
  const type = item.type ?? 'other'
  const empTr = () => calcTax({ rrif: gAnn, province })
  switch (type) {
    case 'employment': {
      const cpp = Math.max(0, Math.min(gAnn, CPP_YMPE) - CPP_YBE) * CPP_RATE
                + Math.max(0, Math.min(gAnn, CPP2_UPPER) - CPP_YMPE) * CPP2_RATE
      const ei  = Math.min(gAnn, EI_MAX_IE) * EI_RATE
      const tr  = empTr()
      const ud  = item.unionDues ?? 0
      const od  = item.otherDeductions ?? 0
      return { gross, cpp: cpp/12, ei: ei/12, tax: tr.total/12, federal: tr.federal/12, provincial: tr.provincial/12, unionDues: ud, otherDeductions: od, net: (gAnn-cpp-ei-tr.total)/12 - ud - od }
    }
    case 'self_employment': {
      const cpp = (Math.max(0, Math.min(gAnn, CPP_YMPE) - CPP_YBE) * CPP_RATE * 2)
                + (Math.max(0, Math.min(gAnn, CPP2_UPPER) - CPP_YMPE) * CPP2_RATE * 2)
      const tr  = empTr()
      const ud  = item.unionDues ?? 0
      const od  = item.otherDeductions ?? 0
      return { gross, cpp: cpp/12, ei: 0, tax: tr.total/12, federal: tr.federal/12, provincial: tr.provincial/12, unionDues: ud, otherDeductions: od, net: (gAnn-cpp-tr.total)/12 - ud - od }
    }
    case 'rental': {
      const tr = calcTax({ pension: gAnn, province })
      return { gross, cpp: 0, ei: 0, tax: tr.total/12, federal: tr.federal/12, provincial: tr.provincial/12, net: (gAnn-tr.total)/12 }
    }
    case 'eligible_dividend': {
      const rawTax = calcTax({ rrif: gAnn * 1.38, province }).total
      const tax    = Math.max(0, rawTax - gAnn * 0.150198)
      return { gross, cpp: 0, ei: 0, tax: tax/12, federal: 0, provincial: 0, net: (gAnn-tax)/12 }
    }
    case 'capital_gains': {
      const tr = calcTax({ capitalGain: gAnn, province })
      return { gross, cpp: 0, ei: 0, tax: tr.total/12, federal: 0, provincial: 0, net: (gAnn-tr.total)/12 }
    }
    case 'benefit': {
      const tr = calcTax({ cpp: gAnn, province })
      return { gross, cpp: 0, ei: 0, tax: tr.total/12, federal: 0, provincial: 0, net: (gAnn-tr.total)/12 }
    }
    default: {
      const rate = (item.taxRate ?? 0) / 100
      return { gross, cpp: 0, ei: 0, tax: gross*rate, federal: 0, provincial: 0, net: gross*(1-rate) }
    }
  }
}

// ─── Expense helpers ──────────────────────────────────────────────────────────

function itemMonths(item) { return item.months ?? Array(12).fill(item.monthly ?? 0) }

// Leaf-level avg (no subItem recursion)
function leafAvg(item) { return itemMonths(item).reduce((s, v) => s + v, 0) / 12 }

// Aggregated avg — if item has subItems, sum those; else use own months
function avgMonthly(item) {
  if (item.subItems?.length) return item.subItems.reduce((s, si) => s + leafAvg(si), 0)
  return leafAvg(item)
}

// Aggregated 12-month array for an item with subItems
function itemMonthsAgg(item) {
  if (!item.subItems?.length) return itemMonths(item)
  return Array(12).fill(0).map((_, i) => item.subItems.reduce((s, si) => s + (si.months?.[i] ?? 0), 0))
}

// All leaf items (for color mapping, pie chart, etc.)
function allLeafItems(expenseSections) {
  return expenseSections.flatMap(s => s.items.flatMap(i => i.subItems?.length ? i.subItems : [i]))
}

// ─── CapEx helpers ─────────────────────────────────────────────────────────────

// capex is [{id, name, items: [{id, name, cost, intervalYears, reserveBalance, returnRate, enabled, subItems:[]}]}]
// Items with subItems are "parent cards"; their sub-items are the actual leaf items for projection/expenses.
function flatCapexItems(capex) {
  return capex.flatMap(g => (g.items ?? []).flatMap(item => {
    if (item.subItems?.length > 0) {
      // Inherit returnRate and enabled from parent card
      return item.subItems.map(si => ({
        ...si,
        returnRate:      item.returnRate ?? 3,
        enabled:         item.enabled !== false,
        reserveBalance:  si.reserveBalance ?? 0,
      }))
    }
    return [item]
  }))
}

// Monthly reserve for a capex item or parent card (sums sub-items when present)
function capexMonthly(c) {
  if (c.subItems?.length > 0) {
    return c.subItems.reduce((s, si) => s + (si.intervalYears > 0 ? si.cost / si.intervalYears / 12 : 0), 0)
  }
  return c.enabled !== false && c.intervalYears > 0 ? c.cost / c.intervalYears / 12 : 0
}

// ─── CapEx 30-year projection ─────────────────────────────────────────────────

function buildCapexProjection(capexGroups, years = 30) {
  const items   = flatCapexItems(capexGroups)
  const enabled = items.filter(c => c.enabled && c.intervalYears > 0)
  const balances = enabled.map(c => c.reserveBalance ?? 0)
  const rows = []
  for (let yr = 1; yr <= years; yr++) {
    const row = { yr }
    let totalMonthly = 0, totalBalance = 0, totalCashNeed = 0
    enabled.forEach((c, i) => {
      const mo   = c.cost / c.intervalYears / 12
      const rate = (c.returnRate ?? 3) / 100
      balances[i] = balances[i] * (1 + rate) + mo * 12
      let cashNeed = 0
      const isRepl = yr % c.intervalYears === 0
      if (isRepl) { cashNeed = Math.max(0, c.cost - balances[i]); balances[i] = Math.max(0, balances[i] - c.cost) }
      row[`bal_${c.id}`] = Math.round(balances[i])
      row[`cn_${c.id}`]  = Math.round(cashNeed)
      row[`rep_${c.id}`] = isRepl
      totalMonthly  += mo
      totalBalance  += Math.round(balances[i])
      totalCashNeed += Math.round(cashNeed)
    })
    row.totalMonthly = totalMonthly; row.totalBalance = totalBalance; row.totalCashNeed = totalCashNeed
    rows.push(row)
  }
  return { rows, enabled }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtFull(n) { return `$${Math.round(Math.abs(n)).toLocaleString()}` }
function fmtNum(n)  { return Math.round(Math.abs(n)).toLocaleString() }
function fmtK(n) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(a/1_000_000).toFixed(1)}M`
  if (a >= 1_000)     return `$${(a/1_000).toFixed(0)}K`
  return `$${Math.round(a)}`
}
function pct(n) { return `${(n*100).toFixed(1)}%` }

// ─── Base components ──────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  const on  = 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100'
  const off = 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-shrink-0">
      <button onClick={() => onChange(true)}  className={`px-1.5 py-0.5 rounded-md text-[10px] transition-colors ${value ? on : off}`}>On</button>
      <button onClick={() => onChange(false)} className={`px-1.5 py-0.5 rounded-md text-[10px] transition-colors ${!value ? on : off}`}>Off</button>
    </div>
  )
}

function MoneyInput({ value, onChange, className = '', placeholder = '' }) {
  const [local, setLocal]   = useState('')
  const [focused, setFocused] = useState(false)
  const onFocus  = () => { setFocused(true); setLocal(String(value ?? '')) }
  const onChg    = e => { setLocal(e.target.value); const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) onChange(n) }
  const onBlur   = () => { setFocused(false); const n = parseFloat(local.replace(/,/g,'')); if (!isNaN(n)) { onChange(Math.round(n)); setLocal(Math.round(n).toLocaleString()) } else setLocal((value??0).toLocaleString()) }
  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="absolute left-2.5 text-gray-400 text-xs pointer-events-none">$</span>
      <input type="text" inputMode="numeric" placeholder={placeholder}
        value={focused ? local : (value??0).toLocaleString()}
        onFocus={onFocus} onChange={onChg} onBlur={onBlur}
        className="input-field pl-5 pr-2 text-right no-spinner w-full" />
    </div>
  )
}

function CellInput({ value, onChange }) {
  const [local, setLocal]   = useState('')
  const [focused, setFocused] = useState(false)
  const onFocus  = () => { setFocused(true); setLocal(value === 0 ? '' : String(value)) }
  const onChg    = e => { setLocal(e.target.value); const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) onChange(n) }
  const onBlur   = () => { setFocused(false); const n = parseFloat(local.replace(/,/g,'')); onChange(isNaN(n) ? 0 : Math.round(n)) }
  return (
    <input type="text" inputMode="numeric" placeholder="0"
      value={focused ? local : (value === 0 ? '' : value.toLocaleString())}
      onFocus={onFocus} onChange={onChg} onBlur={onBlur}
      className="w-[52px] text-right text-[11px] px-1 py-0.5 rounded border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-brand-300 dark:focus:border-brand-600 focus:outline-none focus:bg-white dark:focus:bg-gray-800 bg-transparent tabular-nums placeholder:text-gray-200 dark:placeholder:text-gray-700 transition-colors"
    />
  )
}

function MetricCard({ label, value, sub, color = 'text-gray-900' }) {
  const dark = { 'text-gray-900':'dark:text-gray-100','text-brand-600':'dark:text-brand-400','text-emerald-600':'dark:text-emerald-400','text-red-600':'dark:text-red-400','text-amber-600':'dark:text-amber-400','text-slate-600':'dark:text-slate-400','text-violet-600':'dark:text-violet-400' }[color] ?? ''
  return (
    <div className="metric-card w-[140px]">
      <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 leading-tight">{label}</p>
      <p className={`text-base font-semibold tracking-tight leading-tight mt-0.5 ${color} ${dark}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function WRow({ label, value, bold = false, positive, divider = false }) {
  const isNeg = value < 0
  const color = positive === true ? 'text-emerald-600 dark:text-emerald-400' : positive === false ? 'text-red-600 dark:text-red-400' : isNeg ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
  return (
    <>
      {divider && <div className="border-t border-gray-200 dark:border-gray-700 my-1" />}
      <div className={`flex items-baseline justify-between gap-2 ${bold ? 'font-semibold' : ''}`}>
        <span className={`text-xs ${bold ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{label}</span>
        <span className={`text-xs tabular-nums whitespace-nowrap ${color}`}>{isNeg ? '−' : ''}{fmtFull(value)}/mo</span>
      </div>
    </>
  )
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-2.5 text-xs pointer-events-none dark:bg-gray-900 dark:border-gray-700">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-0.5">{d.name}</p>
      <p className="text-gray-600 dark:text-gray-400">{fmtFull(d.value)}<span className="text-gray-400"> /mo</span></p>
      <p className="text-gray-400">{fmtFull(d.value * 12)} /yr</p>
    </div>
  )
}

function AddBtn({ onClick, label = 'Add' }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium transition-colors">
      <span className="text-base leading-none">+</span> {label}
    </button>
  )
}

function DelBtn({ onClick }) {
  return (
    <button onClick={onClick} className="w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:bg-red-900/30 transition-colors text-sm flex-shrink-0">×</button>
  )
}

// ─── Annual Spread Popover ────────────────────────────────────────────────────

function AnnualSpreadPopover({ rect, currentAnnual, onSpread, onClose }) {
  const [val, setVal] = useState(Math.round(currentAnnual || 0))
  // Position below the cell, stay within viewport
  const top  = Math.min(rect.bottom + 6, window.innerHeight - 160)
  const left = Math.min(rect.left, window.innerWidth - 220)
  return createPortal(
    <>
      <div className="fixed inset-0 z-50" onMouseDown={onClose} />
      <div
        className="fixed z-[60] w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-3"
        style={{ top, left }}
        onMouseDown={e => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Spread Annual Amount</p>
        <MoneyInput value={val} onChange={setVal} className="w-full mb-1" />
        <p className="text-[10px] text-gray-400 mb-2.5">
          ÷ 12 = <span className="font-medium text-gray-600 dark:text-gray-400">{fmtFull(val / 12)}/mo</span> per month
        </p>
        <button
          onClick={() => { onSpread(val); onClose() }}
          className="w-full py-1.5 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Spread evenly → 12 months
        </button>
      </div>
    </>,
    document.body
  )
}

// ─── Deduction input row ─────────────────────────────────────────────────────

function DeductRow({ label, value, onChange }) {
  const [local, setLocal]     = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <input
        type="text" inputMode="numeric" placeholder="—"
        value={focused ? local : (value > 0 ? value.toLocaleString() : '')}
        onFocus={() => { setFocused(true); setLocal(value > 0 ? String(value) : '') }}
        onChange={e => { setLocal(e.target.value); const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) onChange(n) }}
        onBlur={() => { setFocused(false); const n = parseFloat(local.replace(/,/g,'')); onChange(isNaN(n) ? 0 : Math.round(n)) }}
        className="w-20 text-right text-[11px] px-1 py-0.5 rounded border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-brand-300 dark:focus:border-brand-600 focus:outline-none focus:bg-white dark:focus:bg-gray-800 bg-transparent tabular-nums placeholder:text-gray-300 dark:placeholder:text-gray-700 transition-colors"
      />
    </div>
  )
}

// ─── Employment Paystub card ──────────────────────────────────────────────────

function EmploymentPaystub({ inc, calc, province, onUpdate, onRemove }) {
  const isSelf   = inc.type === 'self_employment'
  const enabled  = inc.enabled !== false
  const annGross = Math.round((inc.grossMonthly ?? 0) * 12)
  const [annLocal, setAnnLocal]     = useState('')
  const [annFocused, setAnnFocused] = useState(false)

  // Breakdown row — bold rows keep $X,XXX/mo; plain rows show just the number
  function PR({ label, value, dim, amber, emerald, bold, note }) {
    if (value === 0 && !bold) return null
    const isNeg = value < 0
    const abs   = Math.abs(value)
    const col   = emerald ? 'text-emerald-600 dark:text-emerald-400'
                : amber   ? 'text-amber-500 dark:text-amber-400'
                : dim     ? 'text-gray-400 dark:text-gray-500'
                :           'text-gray-600 dark:text-gray-300'
    const display = bold
      ? `${isNeg ? '−' : ''}${fmtFull(abs)}/mo`
      : `${isNeg ? '−' : ''}${Math.round(abs).toLocaleString()}`
    return (
      <div className="flex items-baseline justify-between text-[11px]">
        <span className={`${bold ? 'font-semibold text-gray-700 dark:text-gray-200' : col} flex items-center gap-1 leading-snug`}>
          {label}
          {note && <span className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-1 rounded py-0.5">{note}</span>}
        </span>
        <span className={`tabular-nums flex-shrink-0 ${bold ? 'font-semibold ' + col : col}`}>{display}</span>
      </div>
    )
  }

  return (
    <div className={`space-y-1.5 ${!enabled ? 'opacity-40' : ''}`}>
      {/* Row 1: Name + toggle + delete */}
      <div className="flex items-center gap-1">
        <Toggle value={enabled} onChange={v => onUpdate('enabled', v)} />
        <input
          className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5"
          value={inc.name}
          onChange={e => onUpdate('name', e.target.value)}
          placeholder="Name"
        />
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
      </div>

      {/* Row 2: Type select + annual gross (comma-formatted) */}
      <div className="flex items-center gap-1.5">
        <select
          value={inc.type}
          onChange={e => onUpdate('type', e.target.value)}
          className="input-field text-[11px] flex-shrink-0 w-auto"
        >
          <option value="employment">Employment (T4)</option>
          <option value="self_employment">Self-Employed</option>
        </select>
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">$</span>
          <input
            type="text" inputMode="numeric" placeholder="0"
            value={annFocused ? annLocal : (annGross > 0 ? annGross.toLocaleString() : '')}
            onFocus={() => { setAnnFocused(true); setAnnLocal(annGross > 0 ? String(annGross) : '') }}
            onChange={e => { setAnnLocal(e.target.value); const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) onUpdate('grossMonthly', n / 12) }}
            onBlur={() => { setAnnFocused(false); const n = parseFloat(annLocal.replace(/,/g,'')); onUpdate('grossMonthly', isNaN(n) ? 0 : Math.round(n) / 12) }}
            className="input-field text-right pl-4 pr-7 w-full text-[11px]"
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">/yr</span>
        </div>
      </div>

      {/* Payroll breakdown */}
      {annGross > 0 && (
        <div className="space-y-1 pt-1.5 border-t border-gray-100 dark:border-gray-800">
          <PR label="Gross Income" value={calc.gross} bold />
          <div className="border-t border-gray-50 dark:border-gray-800/60" />
          <PR label={isSelf ? 'CPP (self-empl.)' : 'CPP (employee)'} value={-calc.cpp} dim note={isSelf ? 'incl. employer' : undefined} />
          {!isSelf && calc.cpp > 0 && (
            <div className="flex justify-between text-[10px] text-gray-300 dark:text-gray-700 pl-3">
              <span>↳ Employer match</span>
              <span>+{Math.round(calc.cpp).toLocaleString()}</span>
            </div>
          )}
          {!isSelf && <PR label="EI Premium" value={-calc.ei} dim />}
          <PR label="Federal Tax" value={-(calc.federal ?? 0)} amber />
          <PR label={`Prov. Tax (${province})`} value={-(calc.provincial ?? 0)} amber />
          <div className="border-t border-gray-50 dark:border-gray-800/60" />
          <DeductRow label="Union Dues"        value={inc.unionDues ?? 0}        onChange={v => onUpdate('unionDues', v)} />
          <DeductRow label="Other Deductions"  value={inc.otherDeductions ?? 0}  onChange={v => onUpdate('otherDeductions', v)} />
          <div className="border-t border-gray-100 dark:border-gray-800" />
          <PR label="Net Take-Home" value={calc.net} emerald bold />
          <div className="text-[10px] text-right text-gray-300 dark:text-gray-700 tabular-nums">{fmtFull(calc.net * 12)}/yr</div>
        </div>
      )}
    </div>
  )
}

// ─── Rental Income Card ──────────────────────────────────────────────────────

function RentalIncomeCard({ inc, calc, province, onUpdate, onRemove }) {
  const enabled = inc.enabled !== false
  const rent = inc.rental ?? {}
  const setR = (f, v) => onUpdate('rental', { ...rent, [f]: v })

  const grossRent     = rent.monthlyRent ?? 0
  const mortgage      = rent.mortgage ?? 0
  const propertyTax   = rent.propertyTax ?? 0
  const insurance     = rent.insurance ?? 0
  const maintenance   = rent.maintenance ?? 0
  const management    = rent.management ?? 0
  const utilities     = rent.utilities ?? 0
  const condo         = rent.condoFees ?? 0
  const otherExp      = rent.otherExpenses ?? 0
  const totalExpenses = mortgage + propertyTax + insurance + maintenance + management + utilities + condo + otherExp
  const netRental     = grossRent - totalExpenses

  // Sync grossMonthly with net rental for tax calc
  const effectiveGross = inc.grossMonthly ?? 0
  if (Math.round(netRental) !== Math.round(effectiveGross) && grossRent > 0) {
    setTimeout(() => onUpdate('grossMonthly', Math.max(0, netRental)), 0)
  }

  function RR({ label, value, dim, amber, emerald, bold }) {
    if (value === 0 && !bold) return null
    const isNeg = value < 0
    const abs   = Math.abs(value)
    const col   = emerald ? 'text-emerald-600 dark:text-emerald-400'
                : amber   ? 'text-amber-500 dark:text-amber-400'
                : dim     ? 'text-gray-400 dark:text-gray-500'
                :           'text-gray-600 dark:text-gray-300'
    return (
      <div className="flex items-baseline justify-between text-[11px]">
        <span className={bold ? 'font-semibold text-gray-700 dark:text-gray-200' : col}>{label}</span>
        <span className={`tabular-nums flex-shrink-0 ${bold ? 'font-semibold ' + col : col}`}>
          {isNeg ? '−' : ''}{fmtFull(abs)}/mo
        </span>
      </div>
    )
  }

  function ExpenseRow({ label, field }) {
    return (
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
        <MoneyInput value={rent[field] ?? 0} onChange={v => setR(field, v)} className="w-24" />
      </div>
    )
  }

  return (
    <div className={`space-y-1.5 ${!enabled ? 'opacity-40' : ''}`}>
      {/* Name + toggle + delete */}
      <div className="flex items-center gap-1">
        <Toggle value={enabled} onChange={v => onUpdate('enabled', v)} />
        <input
          className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5"
          value={inc.name} onChange={e => onUpdate('name', e.target.value)} placeholder="Property name"
        />
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
      </div>

      {/* Gross rent */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-gray-700 dark:text-gray-200 flex-shrink-0">Monthly Rent</span>
        <MoneyInput value={grossRent} onChange={v => setR('monthlyRent', v)} className="w-24" />
      </div>

      {/* Expenses */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-1.5 space-y-1">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Expenses</p>
        <ExpenseRow label="Mortgage"       field="mortgage" />
        <ExpenseRow label="Property Tax"   field="propertyTax" />
        <ExpenseRow label="Insurance"      field="insurance" />
        <ExpenseRow label="Maintenance"    field="maintenance" />
        <ExpenseRow label="Management"     field="management" />
        <ExpenseRow label="Utilities"      field="utilities" />
        <ExpenseRow label="Condo/Strata"   field="condoFees" />
        <ExpenseRow label="Other"          field="otherExpenses" />
      </div>

      {/* Summary */}
      {(grossRent > 0 || totalExpenses > 0) && (
        <div className="border-t border-gray-100 dark:border-gray-800 pt-1.5 space-y-0.5">
          <RR label="Gross Rent" value={grossRent} bold />
          {totalExpenses > 0 && <RR label="Total Expenses" value={-totalExpenses} amber />}
          <div className="border-t border-gray-100 dark:border-gray-800" />
          <RR label="Net Rental Income" value={netRental} emerald bold />
          {calc.tax > 0 && <RR label="Est. Income Tax" value={-calc.tax} amber />}
          {calc.tax > 0 && <RR label="After-Tax Income" value={calc.net} emerald />}
          <div className="text-[10px] text-right text-gray-300 dark:text-gray-700 tabular-nums">{fmtFull(Math.max(0, netRental) * 12)}/yr net rental</div>
        </div>
      )}
    </div>
  )
}

// ─── Other Income Card (generic) ─────────────────────────────────────────────

function OtherIncomeCard({ inc, calc, onUpdate, onRemove }) {
  const enabled   = inc.enabled !== false
  const isOther   = inc.type === 'other' || !inc.type
  const typeLabel = INCOME_TYPES.find(t => t.value === inc.type)?.label ?? 'Other'

  function IR({ label, value, dim, amber, emerald, bold }) {
    if (value === 0 && !bold) return null
    const isNeg = value < 0
    const abs   = Math.abs(value)
    const col   = emerald ? 'text-emerald-600 dark:text-emerald-400'
                : amber   ? 'text-amber-500 dark:text-amber-400'
                : dim     ? 'text-gray-400 dark:text-gray-500'
                :           'text-gray-600 dark:text-gray-300'
    return (
      <div className="flex items-baseline justify-between text-[11px]">
        <span className={bold ? 'font-semibold text-gray-700 dark:text-gray-200' : col}>{label}</span>
        <span className={`tabular-nums flex-shrink-0 ${bold ? 'font-semibold ' + col : col}`}>
          {isNeg ? '−' : ''}{fmtFull(abs)}/mo
        </span>
      </div>
    )
  }

  return (
    <div className={`space-y-1.5 ${!enabled ? 'opacity-40' : ''}`}>
      {/* Name + toggle + delete */}
      <div className="flex items-center gap-1">
        <Toggle value={enabled} onChange={v => onUpdate('enabled', v)} />
        <input
          className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5"
          value={inc.name} onChange={e => onUpdate('name', e.target.value)} placeholder="Name"
        />
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
      </div>

      {/* Type + amount */}
      <div className="flex items-center gap-1.5">
        <select value={inc.type ?? 'other'} onChange={e => onUpdate('type', e.target.value)} className="input-field text-[11px] flex-shrink-0 w-auto">
          {INCOME_TYPES.filter(t => t.value !== 'employment' && t.value !== 'self_employment' && t.value !== 'rental').map(t =>
            <option key={t.value} value={t.value}>{t.label}</option>
          )}
        </select>
        <MoneyInput value={inc.grossMonthly ?? inc.monthly ?? 0} onChange={v => onUpdate('grossMonthly', v)} className="flex-1 min-w-0" />
        {isOther && (
          <div className="relative w-14 flex-shrink-0">
            <input type="number" min={0} max={60} step={1} value={inc.taxRate ?? 0}
              onChange={e => onUpdate('taxRate', parseFloat(e.target.value) || 0)}
              className="input-field pr-4 text-right no-spinner w-full text-[10px]" />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">%</span>
          </div>
        )}
      </div>

      {/* Breakdown */}
      {(calc.gross > 0 || calc.tax > 0) && (
        <div className="space-y-0.5 pt-1.5 border-t border-gray-100 dark:border-gray-800">
          <IR label="Gross Income" value={calc.gross} bold />
          {calc.tax > 0 && <IR label="Est. Tax" value={-calc.tax} amber />}
          <div className="border-t border-gray-100 dark:border-gray-800" />
          <IR label="Net Income" value={calc.net} emerald bold />
          <div className="text-[10px] text-right text-gray-300 dark:text-gray-700 tabular-nums">{fmtFull(calc.net * 12)}/yr</div>
        </div>
      )}
    </div>
  )
}

// ─── Income Tab ───────────────────────────────────────────────────────────────

function IncomeTab({ incomes, province, incomeCalcs, totalGross, totalCpp, totalEi, totalTax, totalNet,
  onAddIncome, onRemoveIncome, onUpdateIncome, onSetProvince }) {

  const empIncomes    = incomes.filter(i => i.type === 'employment' || i.type === 'self_employment')
  const rentalIncomes = incomes.filter(i => i.type === 'rental')
  const otherIncomes  = incomes.filter(i => i.type !== 'employment' && i.type !== 'self_employment' && i.type !== 'rental')
  const empCalcs      = empIncomes.map(inc => incomeCalcs.find(c => c.inc.id === inc.id) ?? { gross:0,cpp:0,ei:0,tax:0,federal:0,provincial:0,net:0 })
  const enabledEmpCalcs = empCalcs.filter((_, i) => empIncomes[i].enabled !== false)
  const totalEmpGross = enabledEmpCalcs.reduce((s, c) => s + c.gross, 0)
  const totalEmpNet   = enabledEmpCalcs.reduce((s, c) => s + c.net, 0)

  return (
    <div className="space-y-4">

      {/* Province */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 flex-shrink-0">Tax Province:</span>
        <select value={province} onChange={e => onSetProvince(e.target.value)} className="input-field w-48">
          {PROVINCES.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
        <span className="text-[11px] text-gray-400">Used for federal + provincial tax estimates.</span>
      </div>

      {/* ── Employment Income ── */}
      <div className="space-y-2">
        <div>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Employment Income</h3>
          <p className="text-[11px] text-gray-400">T4 &amp; self-employment · payroll deduction estimate</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {empIncomes.map(inc => {
            const calc = incomeCalcs.find(c => c.inc.id === inc.id) ?? { gross:0,cpp:0,ei:0,tax:0,federal:0,provincial:0,net:0 }
            const enabled = inc.enabled !== false
            if (!enabled) return (
              <div key={inc.id} className="border border-gray-100 dark:border-gray-800 rounded-xl px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/30 flex items-center gap-1">
                <Toggle value={false} onChange={v => onUpdateIncome(inc.id, 'enabled', v)} />
                <span className="text-[11px] text-gray-400 dark:text-gray-600 truncate">{inc.name}</span>
                <button onClick={() => onRemoveIncome(inc.id)} className="ml-auto text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
              </div>
            )
            return (
              <div key={inc.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50">
                <EmploymentPaystub
                  inc={inc} calc={calc} province={province}
                  onUpdate={(f, v) => onUpdateIncome(inc.id, f, v)}
                  onRemove={() => onRemoveIncome(inc.id)}
                />
              </div>
            )
          })}
          {/* Add employment — dashed card */}
          <button
            onClick={() => onAddIncome('employment')}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-3 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[60px]"
          >
            <span className="text-base leading-none">+</span>
            <span className="text-[11px] font-medium">Add Employment</span>
          </button>
        </div>
        {empIncomes.length > 1 && (
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-gray-400">{empIncomes.length} sources combined</span>
            <div className="flex items-baseline gap-4 tabular-nums">
              <span className="text-gray-400 dark:text-gray-500">{fmtFull(totalEmpGross)}/mo gross</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtFull(totalEmpNet)}/mo net</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Divider — Rental ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
        <span className="text-[10px] text-gray-300 dark:text-gray-700 uppercase tracking-widest font-medium">Rental Income</span>
        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Rental Income ── */}
      <div className="space-y-2">
        <div>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Rental Properties</h3>
          <p className="text-[11px] text-gray-400">Net rental income after expenses · taxed as ordinary income</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {rentalIncomes.map(inc => {
            const calc = incomeCalcs.find(c => c.inc.id === inc.id) ?? { gross:0, tax:0, net:0 }
            const enabled = inc.enabled !== false
            if (!enabled) return (
              <div key={inc.id} className="border border-gray-100 dark:border-gray-800 rounded-xl px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/30 flex items-center gap-1">
                <Toggle value={false} onChange={v => onUpdateIncome(inc.id, 'enabled', v)} />
                <span className="text-[11px] text-gray-400 dark:text-gray-600 truncate">{inc.name}</span>
                <button onClick={() => onRemoveIncome(inc.id)} className="ml-auto text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
              </div>
            )
            return (
              <div key={inc.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50">
                <RentalIncomeCard
                  inc={inc} calc={calc} province={province}
                  onUpdate={(f, v) => onUpdateIncome(inc.id, f, v)}
                  onRemove={() => onRemoveIncome(inc.id)}
                />
              </div>
            )
          })}
          {/* Add rental — dashed card */}
          <button
            onClick={() => onAddIncome('rental')}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-3 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[60px]"
          >
            <span className="text-base leading-none">+</span>
            <span className="text-[11px] font-medium">Add Property</span>
          </button>
        </div>
      </div>

      {/* ── Divider — Other ── */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
        <span className="text-[10px] text-gray-300 dark:text-gray-700 uppercase tracking-widest font-medium">Other Income</span>
        <div className="flex-1 border-t border-gray-100 dark:border-gray-800" />
      </div>

      {/* ── Other Income Sources ── */}
      <div className="space-y-2">
        <div>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Other Income Sources</h3>
          <p className="text-[11px] text-gray-400">Dividends, capital gains, benefits &amp; other</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {otherIncomes.map(inc => {
            const calc = incomeCalcs.find(c => c.inc.id === inc.id) ?? { gross:0, tax:0, net:0 }
            const enabled = inc.enabled !== false
            if (!enabled) return (
              <div key={inc.id} className="border border-gray-100 dark:border-gray-800 rounded-xl px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/30 flex items-center gap-1">
                <Toggle value={false} onChange={v => onUpdateIncome(inc.id, 'enabled', v)} />
                <span className="text-[11px] text-gray-400 dark:text-gray-600 truncate">{inc.name}</span>
                <button onClick={() => onRemoveIncome(inc.id)} className="ml-auto text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
              </div>
            )
            return (
              <div key={inc.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50">
                <OtherIncomeCard
                  inc={inc} calc={calc}
                  onUpdate={(f, v) => onUpdateIncome(inc.id, f, v)}
                  onRemove={() => onRemoveIncome(inc.id)}
                />
              </div>
            )
          })}
          {/* Add other — dashed card */}
          <button
            onClick={() => onAddIncome('other')}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-3 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[60px]"
          >
            <span className="text-base leading-none">+</span>
            <span className="text-[11px] font-medium">Add Income</span>
          </button>
        </div>
      </div>

      {/* ── Grand Total ── */}
      <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 bg-gray-50/80 dark:bg-gray-800/30">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-700 dark:text-gray-200">Total Net Take-Home</span>
          <div className="flex items-baseline gap-5 tabular-nums">
            <span className="text-gray-400 dark:text-gray-500">{fmtFull(totalGross)}/mo gross</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{fmtFull(totalNet)}/mo</span>
            <span className="text-gray-400 dark:text-gray-500">{fmtFull(totalNet * 12)}/yr</span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">Tax estimates use 2025 federal &amp; provincial brackets · CPP/EI use 2025 rates · For planning purposes only.</p>
    </div>
  )
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

function ExpensesTab({
  expenseSections, capex, totalNet, totalExpenses, totalCapexMo, totalOutflow, itemColorMap,
  onAddSection, onRemoveSection, onUpdateSection,
  onAddItem, onRemoveItem, onUpdateItem, onUpdateItemMonth,
  onAddSubItem, onRemoveSubItem, onUpdateSubItem, onUpdateSubItemMonth,
  onUpdateItemActualMonth, onUpdateSubItemActualMonth,
}) {
  const [spread, setSpread] = useState(null) // {rect, onSpread}
  const [actualMode, setActualMode] = useState(false)
  const allExp = expenseSections.flatMap(s => s.items)

  function openSpread(e, onSpread, currentAnnual) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setSpread({ rect, onSpread, currentAnnual })
  }

  // Column count: name(sticky) + +(action) + avg + annual + %net + 12 months + del = 18
  const COL_SPAN = 18

  return (
    <>
      {spread && (
        <AnnualSpreadPopover
          rect={spread.rect}
          currentAnnual={spread.currentAnnual}
          onSpread={spread.onSpread}
          onClose={() => setSpread(null)}
        />
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Monthly Expenses</h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Mode:</span>
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setActualMode(false)}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-colors ${!actualMode ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500'}`}
              >Planned</button>
              <button
                onClick={() => setActualMode(true)}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-colors ${actualMode ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500'}`}
              >Actual</button>
            </div>
          </div>
        </div>

        {expenseSections.length === 0 && flatCapexItems(capex).filter(c => c.enabled).length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-gray-400 mb-2">No sections yet</p>
            <button onClick={onAddSection} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-1.5 transition-colors">
              <span className="text-base leading-none">+</span> Add Section
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 px-2 text-gray-400 font-medium sticky left-0 bg-white dark:bg-gray-900 min-w-[160px] z-10">Category</th>
                  <th className="w-5"></th>
                  <th className="text-right py-2 px-0.5 text-gray-400 font-medium w-[52px]">Avg</th>
                  <th className="text-right py-2 px-0.5 text-gray-400 font-medium w-[58px]">12m ↕</th>
                  <th className="text-right py-2 px-0.5 text-gray-400 font-medium w-[46px]">% Net</th>
                  {MONTHS.map(m => (
                    <th key={m} className="text-right py-2 px-0.5 text-gray-400 font-medium w-[52px]">
                      {actualMode ? <span>{m}<br/><span className="text-[9px] text-emerald-500">Act</span></span> : m}
                    </th>
                  ))}
                  <th className="w-5"></th>
                </tr>
              </thead>
              <tbody>
                {expenseSections.map(sec => {
                  const secAvg        = sec.items.reduce((s, i) => s + avgMonthly(i), 0)
                  const secMonthTotals = Array(12).fill(0).map((_, mi) =>
                    sec.items.reduce((s, item) => s + (itemMonthsAgg(item)[mi] ?? 0), 0)
                  )
                  return (
                    <Fragment key={sec.id}>
                      {/* Section header */}
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                        <td className="py-1.5 px-2 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 min-w-[160px]">
                          <input
                            className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide bg-transparent border-none outline-none focus:ring-0 focus:bg-white dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5 w-40"
                            value={sec.name}
                            onChange={e => onUpdateSection(sec.id, 'name', e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 px-1 bg-gray-50 dark:bg-gray-800/50">
                          <button
                            onClick={() => onAddItem(sec.id)}
                            title="Add item"
                            className="w-4 h-4 rounded flex items-center justify-center text-brand-500 hover:text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/20 text-sm font-bold flex-shrink-0 transition-colors"
                          >+</button>
                        </td>
                        <td colSpan={COL_SPAN - 3} className="bg-gray-50 dark:bg-gray-800/50" />
                        <td className="py-1.5 px-1 bg-gray-50 dark:bg-gray-800/50">
                          <button onClick={() => onRemoveSection(sec.id)} className="w-4 h-4 rounded flex items-center justify-center text-gray-300 hover:text-red-500 text-sm dark:text-gray-600 transition-colors">×</button>
                        </td>
                      </tr>

                      {/* Items */}
                      {sec.items.map(item => {
                        const hasSub = item.subItems?.length > 0
                        const avg    = avgMonthly(item)
                        const months = itemMonthsAgg(item) // agg if has subItems

                        return (
                          <Fragment key={item.id}>
                            {/* Item / category row */}
                            <tr className={`border-b border-gray-50 dark:border-gray-800/30 group transition-colors ${hasSub ? 'bg-gray-50/40 dark:bg-gray-800/20' : 'hover:bg-amber-50/30 dark:hover:bg-amber-900/5'}`}>
                              <td className={`py-0.5 px-2 sticky left-0 z-10 transition-colors ${hasSub ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 group-hover:bg-amber-50 dark:group-hover:bg-amber-950'}`}>
                                <div className="flex items-center gap-1.5">
                                  {/* dot — square for category, circle for leaf */}
                                  <div className={`w-1.5 h-1.5 flex-shrink-0 ${hasSub ? 'rounded-sm bg-gray-400 dark:bg-gray-500' : 'rounded-full'}`}
                                    style={hasSub ? {} : { background: COLORS[(itemColorMap[item.id] ?? 0) % COLORS.length] }} />
                                  <input
                                    className={`input-field min-w-0 w-28 py-0.5 ${hasSub ? 'text-[11px] font-medium text-gray-700 dark:text-gray-200' : 'text-[11px]'}`}
                                    value={item.name}
                                    onChange={e => onUpdateItem(sec.id, item.id, 'name', e.target.value)}
                                    placeholder="Item name"
                                  />
                                </div>
                              </td>

                              {/* + column — add sub-item */}
                              <td className="py-0.5 px-0.5">
                                <button
                                  onClick={() => onAddSubItem(sec.id, item.id)}
                                  title="Add sub-item"
                                  className="w-4 h-4 rounded flex items-center justify-center text-gray-300 hover:text-brand-600 hover:bg-brand-50 dark:text-gray-600 dark:hover:text-brand-400 dark:hover:bg-brand-900/20 text-sm font-bold flex-shrink-0 transition-colors"
                                >+</button>
                              </td>

                              {/* Avg */}
                              <td className="py-0.5 px-0.5 text-right tabular-nums">
                                <span className={`text-[11px] ${hasSub ? 'font-semibold text-gray-700 dark:text-gray-300' : `font-medium ${avg > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-300 dark:text-gray-700'}`}`}>
                                  {avg > 0 ? fmtNum(avg) : '—'}
                                </span>
                              </td>

                              {/* Annual — clickable for leaves */}
                              <td className="py-0.5 px-0.5 text-right tabular-nums">
                                {!hasSub ? (
                                  <button
                                    onClick={e => openSpread(e,
                                      annualAmt => {
                                        const mo = Math.round(annualAmt / 12)
                                        Array(12).fill(0).forEach((_, mi) => onUpdateItemMonth(sec.id, item.id, mi, mo))
                                      },
                                      avg * 12
                                    )}
                                    className={`text-[11px] tabular-nums underline decoration-dashed decoration-gray-300 hover:decoration-amber-400 cursor-pointer transition-colors ${avg > 0 ? 'text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400' : 'text-gray-300 dark:text-gray-700'}`}
                                    title="Click to spread annual amount"
                                  >
                                    {avg > 0 ? fmtNum(avg * 12) : '—'}
                                  </button>
                                ) : (
                                  <span className={`text-[11px] font-semibold tabular-nums ${avg > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-700'}`}>
                                    {avg > 0 ? fmtNum(avg * 12) : '—'}
                                  </span>
                                )}
                              </td>

                              {/* % net */}
                              <td className="py-0.5 px-0.5 text-right text-gray-400 tabular-nums text-[11px]">
                                {totalOutflow > 0 && avg > 0 ? pct(avg / totalOutflow) : '—'}
                              </td>

                              {/* Month cells — read-only totals if category, inputs if leaf */}
                              {hasSub ? (
                                months.map((v, i) => (
                                  <td key={i} className="py-0.5 px-0.5 text-right">
                                    <span className={`text-[11px] tabular-nums ${v > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-gray-200 dark:text-gray-700'}`}>
                                      {v > 0 ? fmtNum(v) : ''}
                                    </span>
                                  </td>
                                ))
                              ) : actualMode ? (
                                (item.actualMonths ?? Array(12).fill(0)).map((av, i) => (
                                  <td key={i} className="py-0.5 px-0.5">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[9px] text-gray-300 dark:text-gray-700 text-right tabular-nums px-1">{itemMonths(item)[i] > 0 ? fmtNum(itemMonths(item)[i]) : '—'}</span>
                                      <CellInput value={av} onChange={val => onUpdateItemActualMonth(sec.id, item.id, i, val)} />
                                    </div>
                                  </td>
                                ))
                              ) : (
                                itemMonths(item).map((v, i) => (
                                  <td key={i} className="py-0.5 px-0.5">
                                    <CellInput value={v} onChange={val => onUpdateItemMonth(sec.id, item.id, i, val)} />
                                  </td>
                                ))
                              )}

                              <td className="py-0.5 px-1">
                                <button onClick={() => onRemoveItem(sec.id, item.id)} className="w-4 h-4 rounded flex items-center justify-center text-gray-200 hover:text-red-500 text-sm dark:text-gray-700 opacity-0 group-hover:opacity-100 transition-all">×</button>
                              </td>
                            </tr>

                            {/* Sub-item rows */}
                            {hasSub && item.subItems.map(si => {
                              const siAvg = leafAvg(si)
                              return (
                                <tr key={si.id} className="border-b border-gray-50 dark:border-gray-800/20 hover:bg-amber-50/20 dark:hover:bg-amber-900/5 transition-colors">
                                  <td className="py-0.5 pl-7 pr-2 sticky left-0 bg-white dark:bg-gray-900 hover:bg-amber-50 z-10 transition-colors">
                                    <div className="flex items-center gap-1.5">
                                      {/* − button to remove sub-item */}
                                      <button
                                        onClick={() => onRemoveSubItem(sec.id, item.id, si.id)}
                                        title="Remove sub-item"
                                        className="w-4 h-4 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:bg-red-900/30 font-bold text-sm flex-shrink-0 transition-colors leading-none"
                                      >−</button>
                                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COLORS[(itemColorMap[si.id] ?? 0) % COLORS.length] }} />
                                      <input
                                        className="input-field min-w-0 w-24 text-[11px] py-0.5"
                                        value={si.name}
                                        onChange={e => onUpdateSubItem(sec.id, item.id, si.id, 'name', e.target.value)}
                                        placeholder="Sub-item"
                                      />
                                    </div>
                                  </td>
                                  {/* empty + column */}
                                  <td />
                                  {/* Avg */}
                                  <td className="py-0.5 px-0.5 text-right tabular-nums">
                                    <span className={`text-[11px] font-medium ${siAvg > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-300 dark:text-gray-700'}`}>
                                      {siAvg > 0 ? fmtNum(siAvg) : '—'}
                                    </span>
                                  </td>
                                  {/* Annual — clickable */}
                                  <td className="py-0.5 px-0.5 text-right tabular-nums">
                                    <button
                                      onClick={e => openSpread(e,
                                        annualAmt => {
                                          const mo = Math.round(annualAmt / 12)
                                          Array(12).fill(0).forEach((_, mi) => onUpdateSubItemMonth(sec.id, item.id, si.id, mi, mo))
                                        },
                                        siAvg * 12
                                      )}
                                      className={`text-[11px] tabular-nums underline decoration-dashed decoration-gray-300 hover:decoration-amber-400 cursor-pointer transition-colors ${siAvg > 0 ? 'text-gray-600 dark:text-gray-400 hover:text-amber-600' : 'text-gray-300 dark:text-gray-700'}`}
                                      title="Click to spread annual amount"
                                    >
                                      {siAvg > 0 ? fmtNum(siAvg * 12) : '—'}
                                    </button>
                                  </td>
                                  <td className="py-0.5 px-0.5 text-right text-gray-400 tabular-nums text-[11px]">{totalOutflow > 0 && siAvg > 0 ? pct(siAvg / totalOutflow) : '—'}</td>
                                  {actualMode ? (
                                    (si.actualMonths ?? Array(12).fill(0)).map((av, i) => (
                                      <td key={i} className="py-0.5 px-0.5">
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-[9px] text-gray-300 dark:text-gray-700 text-right tabular-nums px-1">{itemMonths(si)[i] > 0 ? fmtNum(itemMonths(si)[i]) : '—'}</span>
                                          <CellInput value={av} onChange={val => onUpdateSubItemActualMonth(sec.id, item.id, si.id, i, val)} />
                                        </div>
                                      </td>
                                    ))
                                  ) : (
                                    itemMonths(si).map((v, i) => (
                                      <td key={i} className="py-0.5 px-0.5">
                                        <CellInput value={v} onChange={val => onUpdateSubItemMonth(sec.id, item.id, si.id, i, val)} />
                                      </td>
                                    ))
                                  )}
                                  <td />
                                </tr>
                              )
                            })}


                          </Fragment>
                        )
                      })}

                      {/* Section subtotal row */}
                      {sec.items.length > 0 && (
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                          <td className="py-0.5 px-2 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide font-medium">subtotal</td>
                          <td />
                          <td className="py-0.5 px-0.5 text-right tabular-nums text-[11px] font-medium text-gray-500 dark:text-gray-400">{secAvg > 0 ? fmtNum(secAvg) : ''}</td>
                          <td className="py-0.5 px-0.5 text-right tabular-nums text-[11px] text-gray-400 dark:text-gray-500">{secAvg > 0 ? fmtNum(secAvg * 12) : ''}</td>
                          <td className="py-0.5 px-0.5 text-right tabular-nums text-[11px] text-gray-400 dark:text-gray-500">{totalOutflow > 0 && secAvg > 0 ? pct(secAvg / totalOutflow) : ''}</td>
                          {secMonthTotals.map((v, i) => (
                            <td key={i} className="py-0.5 px-0.5 text-right">
                              <span className={`text-[11px] tabular-nums ${v > 0 ? 'font-medium text-gray-500 dark:text-gray-400' : 'text-gray-200 dark:text-gray-700'}`}>{v > 0 ? fmtNum(v) : ''}</span>
                            </td>
                          ))}
                          <td />
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {/* Add-section row — always visible at bottom of sections list */}
                {expenseSections.length > 0 && (
                  <tr>
                    <td className="py-1 px-2 sticky left-0 bg-white dark:bg-gray-900 z-10">
                      <button
                        onClick={onAddSection}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        title="Add section"
                      >
                        <span className="text-base leading-none font-bold">+</span> add section
                      </button>
                    </td>
                    <td colSpan={COL_SPAN - 1} />
                  </tr>
                )}

                {/* Expenses subtotal */}
                {expenseSections.length > 0 && (
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-amber-50/40 dark:bg-amber-900/10">
                    <td className="py-1.5 px-2 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-amber-50 dark:bg-amber-950 z-10 text-[11px] uppercase tracking-wide">Expenses Subtotal</td>
                    <td />
                    <td className="py-1.5 px-0.5 text-right font-semibold text-amber-600 dark:text-amber-400 tabular-nums text-xs">{fmtFull(totalExpenses)}/mo</td>
                    <td className="py-1.5 px-0.5 text-right font-semibold text-gray-700 dark:text-gray-300 tabular-nums text-xs">{fmtFull(totalExpenses * 12)}</td>
                    <td className="py-1.5 px-0.5 text-right text-gray-400 tabular-nums text-xs">{totalOutflow > 0 ? pct(totalExpenses / totalOutflow) : '—'}</td>
                    {Array(12).fill(0).map((_, i) => {
                      const col = allLeafItems(expenseSections).reduce((s, item) => s + (item.months?.[i] ?? 0), 0)
                      return (
                        <td key={i} className="py-1.5 px-0.5 text-right tabular-nums text-[11px]">
                          <span className={col > 0 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-gray-200 dark:text-gray-700'}>{col > 0 ? fmtFull(col) : '—'}</span>
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                )}

                {/* CapEx section in expenses tab — grouped by parent card categories */}
                {(() => {
                  const capexItems = flatCapexItems(capex).filter(c => c.enabled && c.intervalYears > 0)
                  if (!capexItems.length) return null

                  // Build category-level rows: parent cards (with or without subItems)
                  const categories = []
                  capex.forEach(g => {
                    (g.items ?? []).forEach(item => {
                      if (item.enabled === false) return
                      const mo = capexMonthly(item)
                      if (mo > 0) categories.push({ id: item.id, name: item.name, mo })
                    })
                  })

                  return (
                    <Fragment>
                      {/* CapEx Reserve header — sticky */}
                      <tr className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 px-2 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">CapEx Reserve</span>
                          {totalCapexMo > 0 && <span className="ml-2 text-[11px] text-slate-400 tabular-nums">{fmtFull(totalCapexMo)}/mo</span>}
                        </td>
                        <td colSpan={COL_SPAN - 1} className="bg-slate-50 dark:bg-slate-900/40" />
                      </tr>

                      {categories.map((cat, idx) => {
                        const bg = idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-slate-50 dark:bg-slate-800'
                        return (
                          <tr key={cat.id} className={`border-b border-slate-50 dark:border-slate-800/30 ${bg}`}>
                            <td className={`py-0.5 px-2 sticky left-0 ${bg} z-10`}>
                              <div className="flex items-center gap-1.5 pl-3">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: CAPEX_COLOR }} />
                                <span className="text-[11px] text-gray-600 dark:text-gray-400">{cat.name}</span>
                              </div>
                            </td>
                            <td />
                            <td className="py-0.5 px-0.5 text-right font-medium text-slate-600 dark:text-slate-400 tabular-nums text-xs">{fmtNum(cat.mo)}</td>
                            <td className="py-0.5 px-0.5 text-right text-gray-500 dark:text-gray-400 tabular-nums text-xs">{fmtNum(cat.mo * 12)}</td>
                            <td className="py-0.5 px-0.5 text-right text-gray-400 tabular-nums text-xs">{totalOutflow > 0 ? pct(cat.mo / totalOutflow) : '—'}</td>
                            {MONTHS.map((_, i) => (
                              <td key={i} className="py-0.5 px-0.5 text-right">
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{cat.mo > 0 ? fmtNum(cat.mo) : ''}</span>
                              </td>
                            ))}
                            <td />
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })()}

                {/* CapEx subtotal */}
                {totalCapexMo > 0 && (
                  <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30">
                    <td className="py-1.5 px-2 font-semibold text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 text-[11px] uppercase tracking-wide">CapEx Subtotal</td>
                    <td />
                    <td className="py-1.5 px-0.5 text-right font-semibold text-slate-600 dark:text-slate-400 tabular-nums text-xs">{fmtFull(totalCapexMo)}/mo</td>
                    <td className="py-1.5 px-0.5 text-right font-semibold text-slate-600 dark:text-slate-400 tabular-nums text-xs">{fmtFull(totalCapexMo * 12)}</td>
                    <td className="py-1.5 px-0.5 text-right text-gray-400 tabular-nums text-xs">{totalOutflow > 0 ? pct(totalCapexMo / totalOutflow) : '—'}</td>
                    {MONTHS.map((_, i) => (
                      <td key={i} className="py-1.5 px-0.5 text-right text-[11px]">
                        <span className="font-medium text-slate-500 dark:text-slate-400 tabular-nums">{fmtFull(totalCapexMo)}</span>
                      </td>
                    ))}
                    <td />
                  </tr>
                )}

                {/* Grand total */}
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-100/60 dark:bg-gray-800/50">
                  <td className="py-2 px-2 font-bold text-gray-900 dark:text-gray-100 sticky left-0 bg-gray-100 dark:bg-gray-800 z-10 text-xs">Total Outflows</td>
                  <td />
                  <td className="py-2 px-0.5 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums text-xs">{fmtFull(totalOutflow)}/mo</td>
                  <td className="py-2 px-0.5 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums text-xs">{fmtFull(totalOutflow * 12)}</td>
                  <td className="py-2 px-0.5 text-right font-bold text-gray-700 dark:text-gray-300 tabular-nums text-xs">{totalOutflow > 0 ? pct(totalOutflow / totalOutflow) : '—'}</td>
                  {Array(12).fill(0).map((_, i) => {
                    const col = allLeafItems(expenseSections).reduce((s, it) => s + (it.months?.[i] ?? 0), 0) + totalCapexMo
                    return (
                      <td key={i} className="py-2 px-0.5 text-right tabular-nums text-[11px]">
                        <span className="font-bold text-gray-700 dark:text-gray-300">{fmtFull(col)}</span>
                      </td>
                    )
                  })}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ─── CapEx Tab ────────────────────────────────────────────────────────────────

function CapExTab({ capex, onAddCapexItem, onRemoveCapexItem, onUpdateCapexItem, onAddCapexSubItem, onRemoveCapexSubItem, onUpdateCapexSubItem }) {
  const rawItems = capex.flatMap(g => g.items ?? [])
  const totalMo  = rawItems.reduce((s, item) => s + capexMonthly(item), 0)
  const { rows: projRows, enabled } = useMemo(() => buildCapexProjection(capex), [capex])

  return (
    <div className="space-y-4">

      {/* Summary strip */}
      {totalMo > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Total reserve</span>
          <span className="text-[11px] font-semibold tabular-nums text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-md">
            {fmtFull(totalMo)}/mo · {fmtFull(totalMo * 12)}/yr
          </span>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {rawItems.map(item => {
          const hasSub = item.subItems?.length > 0
          const mo     = capexMonthly(item)
          return (
            <div key={item.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 space-y-1.5 bg-white dark:bg-gray-800/50">

              {/* Header: name · /mo badge · × */}
              <div className="flex items-center gap-1">
                <input
                  className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5"
                  value={item.name}
                  onChange={e => onUpdateCapexItem(item.id, 'name', e.target.value)}
                  placeholder="Item name"
                />
                {mo > 0 && (
                  <span className="text-[10px] font-semibold tabular-nums whitespace-nowrap flex-shrink-0 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded">
                    {fmtFull(mo)}/mo
                  </span>
                )}
                <button onClick={() => onRemoveCapexItem(item.id)} className="text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
              </div>

              {/* Leaf: cost + interval inline */}
              {!hasSub && (
                <div className="flex items-center gap-1.5">
                  <MoneyInput value={item.cost} onChange={v => onUpdateCapexItem(item.id, 'cost', v)} className="flex-1 min-w-0" />
                  <div className="relative w-[60px] flex-shrink-0">
                    <input type="number" min={1} max={99} value={item.intervalYears}
                      onChange={e => onUpdateCapexItem(item.id, 'intervalYears', Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-field text-right no-spinner pr-4 w-full text-[11px]" />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">y</span>
                  </div>
                </div>
              )}

              {/* Parent: compact sub-item rows */}
              {hasSub && (
                <div className="space-y-0.5">
                  {item.subItems.map(si => {
                    const siMo = si.intervalYears > 0 ? si.cost / si.intervalYears / 12 : 0
                    return (
                      <div key={si.id} className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 rounded-md px-1.5 py-0.5">
                        <input
                          className="flex-1 min-w-0 text-[11px] bg-transparent border-none outline-none focus:ring-0 focus:bg-white dark:focus:bg-gray-700 rounded px-0.5 text-gray-600 dark:text-gray-400 truncate"
                          value={si.name}
                          onChange={e => onUpdateCapexSubItem(item.id, si.id, 'name', e.target.value)}
                          placeholder="Name"
                        />
                        <MoneyInput value={si.cost} onChange={v => onUpdateCapexSubItem(item.id, si.id, 'cost', v)} className="w-[100px] flex-shrink-0" />
                        <div className="relative w-[48px] flex-shrink-0">
                          <input type="number" min={1} max={99} value={si.intervalYears}
                            onChange={e => onUpdateCapexSubItem(item.id, si.id, 'intervalYears', Math.max(1, parseInt(e.target.value) || 1))}
                            className="input-field text-right no-spinner pr-4 w-full text-[11px] py-1" />
                          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">y</span>
                        </div>
                        {siMo > 0 && <span className="text-[10px] text-gray-400 tabular-nums w-9 text-right flex-shrink-0">{fmtFull(siMo)}</span>}
                        <button
                          onClick={() => onRemoveCapexSubItem(item.id, si.id)}
                          className="text-gray-300 hover:text-red-500 text-sm leading-none flex-shrink-0 transition-colors dark:text-gray-600"
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add sub-item */}
              <button
                onClick={() => onAddCapexSubItem(item.id)}
                className="flex items-center gap-0.5 text-[10px] text-gray-300 hover:text-brand-500 dark:text-gray-600 dark:hover:text-brand-400 transition-colors"
              >
                <span className="text-xs leading-none">+</span> add sub-item
              </button>
            </div>
          )
        })}

        {/* Add item — dashed card */}
        <button
          onClick={onAddCapexItem}
          className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-3 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[60px]"
        >
          <span className="text-base leading-none">+</span>
          <span className="text-[11px] font-medium">Add Item</span>
        </button>
      </div>

      {/* 30-year projection */}
      {enabled.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">
            30-Year Reserve Projection
          </h3>
          <p className="text-[11px] text-gray-400 mb-3">Balance grows at each item's rate of return. Highlighted rows = replacement year. Red = cash shortfall needed.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 px-2 text-gray-400 font-medium sticky left-0 bg-white dark:bg-gray-900 z-10 w-12">Yr</th>
                  {enabled.map(c => (
                    <th key={c.id} className="text-right py-2 px-2 text-gray-400 font-medium whitespace-nowrap min-w-[90px]">
                      <div style={{ color: CAPEX_COLOR }}>{c.name}</div>
                      <div className="text-[10px] font-normal text-gray-400">Balance</div>
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 text-gray-400 font-medium whitespace-nowrap border-l border-gray-100 dark:border-gray-800">Mo. Reserve</th>
                  <th className="text-right py-2 px-2 text-gray-400 font-medium whitespace-nowrap">Total Balance</th>
                  <th className="text-right py-2 px-2 text-gray-400 font-medium whitespace-nowrap">Cash Need</th>
                </tr>
              </thead>
              <tbody>
                {projRows.map((row, idx) => {
                  const hasRepl   = enabled.some(c => row[`rep_${c.id}`])
                  const hasCashNeed = row.totalCashNeed > 0
                  const rowBg = hasRepl
                    ? 'bg-orange-50/70 dark:bg-orange-900/10'
                    : idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/30 dark:bg-gray-800/20'
                  return (
                    <tr key={row.yr} className={`border-b border-gray-50 dark:border-gray-800/30 ${rowBg}`}>
                      <td className={`py-1.5 px-2 font-medium tabular-nums sticky left-0 z-10 ${rowBg} ${hasRepl ? 'text-orange-700 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {row.yr}
                      </td>
                      {enabled.map(c => {
                        const bal  = row[`bal_${c.id}`] ?? 0
                        const cn   = row[`cn_${c.id}`] ?? 0
                        const repl = row[`rep_${c.id}`]
                        return (
                          <td key={c.id} className="py-1.5 px-2 text-right tabular-nums">
                            {repl ? (
                              <div>
                                <div className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtK(bal)}</div>
                                {cn > 0  && <div className="text-[10px] text-red-500 dark:text-red-400">−{fmtK(cn)} needed</div>}
                                {cn === 0 && <div className="text-[10px] text-emerald-500 dark:text-emerald-400">✓ funded</div>}
                              </div>
                            ) : (
                              <span className="text-gray-600 dark:text-gray-400">{fmtK(bal)}</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-1.5 px-2 text-right tabular-nums text-slate-500 dark:text-slate-400 border-l border-gray-100 dark:border-gray-800">{fmtK(row.totalMonthly)}/mo</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium text-gray-700 dark:text-gray-300">{fmtK(row.totalBalance)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {hasCashNeed    ? <span className="font-semibold text-red-600 dark:text-red-400">{fmtK(row.totalCashNeed)}</span>
                        : hasRepl       ? <span className="text-emerald-500 dark:text-emerald-400 text-[11px]">✓</span>
                        :                 <span className="text-gray-300 dark:text-gray-700">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Account section (category-level hover expand) ────────────────────────────

function AccountSection({ label, accounts, accBal, rateLabel, defaultRate, onUpdateAccount, onRemoveAccount, onAddAccount, onAddSubAccount, onRemoveSubAccount, onUpdateSubAccount }) {
  const [expanded, setExpanded] = useState(false)
  const total = accounts.reduce((s, a) => s + accBal(a), 0)

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Collapsed: category title + total badge + account name pills */}
      <div className="flex items-center gap-2 py-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <span className="text-[10px] font-semibold tabular-nums text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded">
          {fmtFull(total)}
        </span>
        {!expanded && accounts.length > 0 && (
          <div className="flex items-center gap-1.5 ml-1">
            {accounts.map(acc => (
              <span key={acc.id} className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/40 px-1.5 py-0.5 rounded">
                {acc.name} <span className="text-gray-300 dark:text-gray-600">{fmtFull(accBal(acc))}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded: full account cards grid */}
      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mt-1">
          {accounts.map(acc => {
            const bal = accBal(acc)
            const projBal = bal * (1 + (acc.rate ?? defaultRate) / 100)
            return (
              <AccountCard
                key={acc.id}
                acc={acc}
                rateLabel={rateLabel}
                defaultRate={defaultRate}
                onUpdate={(f, v) => onUpdateAccount(acc.id, f, v)}
                onRemove={() => onRemoveAccount(acc.id)}
                projBalance={projBal}
                projGain={projBal - bal}
                onAddSubAccount={onAddSubAccount}
                onRemoveSubAccount={onRemoveSubAccount}
                onUpdateSubAccount={onUpdateSubAccount}
              />
            )
          })}
          <button
            onClick={onAddAccount}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-3 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[60px]"
          >
            <span className="text-base leading-none">+</span>
            <span className="text-[11px] font-medium">Add Account</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Account input card ───────────────────────────────────────────────────────

function AccountCard({ acc, rateLabel, defaultRate, onUpdate, onRemove, projBalance, projGain, tooltip, onAddSubAccount, onRemoveSubAccount, onUpdateSubAccount }) {
  const hasSub = acc.subAccounts?.length > 0
  const totalBal = hasSub
    ? acc.subAccounts.reduce((s, sa) => s + (sa.balance ?? 0), 0)
    : (acc.balance ?? 0)
  const [rateLocal, setRateLocal] = useState('')
  const [rateFocused, setRateFocused] = useState(false)
  const rateOnFocus = () => { setRateFocused(true); setRateLocal(String(acc.rate ?? defaultRate)) }
  const rateOnChange = e => { setRateLocal(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onUpdate('rate', n) }
  const rateOnBlur = () => { setRateFocused(false); const n = parseFloat(rateLocal); if (!isNaN(n)) onUpdate('rate', n) }

  return (
    <div
      className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50 transition-all duration-200"
      title={tooltip || undefined}
    >
      {/* Header: name · total badge · × */}
      <div className="flex items-center gap-1">
        <input
          className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5"
          value={acc.name}
          onChange={e => onUpdate('name', e.target.value)}
          placeholder="Account name"
        />
        <span className="text-[10px] font-semibold tabular-nums whitespace-nowrap flex-shrink-0 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded">
          {fmtFull(totalBal)}
        </span>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600">✕</button>
      </div>

      <div className="space-y-1.5 mt-1.5">
        {/* Leaf account — single balance input */}
        {!hasSub && (
          <>
            <MoneyInput value={acc.balance ?? 0} onChange={v => onUpdate('balance', v)} />
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 flex-1">{rateLabel}</span>
              <input
                type="text" inputMode="decimal"
                value={rateFocused ? rateLocal : (acc.rate ?? defaultRate)}
                onFocus={rateOnFocus} onChange={rateOnChange} onBlur={rateOnBlur}
                className="w-10 text-right text-[10px] px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-brand-300 dark:focus:border-brand-600"
              />
              <span className="text-[10px] text-gray-400">%</span>
            </div>
          </>
        )}

        {/* Parent account — sub-account rows */}
        {hasSub && (
          <div className="space-y-0.5">
            {acc.subAccounts.map(sa => (
              <div key={sa.id} className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 rounded-md px-1.5 py-0.5" title={sa.tooltip || undefined}>
                <input
                  className="flex-1 min-w-0 text-[11px] bg-transparent border-none outline-none focus:ring-0 focus:bg-white dark:focus:bg-gray-700 rounded px-0.5 text-gray-600 dark:text-gray-400 truncate"
                  value={sa.name}
                  onChange={e => onUpdateSubAccount(acc.id, sa.id, 'name', e.target.value)}
                  placeholder="Name"
                />
                <div className="relative w-[90px] flex-shrink-0">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">$</span>
                  <input type="text" inputMode="numeric"
                    value={(sa.balance ?? 0).toLocaleString()}
                    onChange={e => { const n = parseFloat(e.target.value.replace(/,/g,'')); if (!isNaN(n)) onUpdateSubAccount(acc.id, sa.id, 'balance', n) }}
                    className="input-field text-right no-spinner pl-4 pr-1 w-full text-[11px] py-1" />
                </div>
                <button
                  onClick={() => onRemoveSubAccount(acc.id, sa.id)}
                  className="text-gray-300 hover:text-red-500 text-sm leading-none flex-shrink-0 transition-colors dark:text-gray-600"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Add sub-account */}
        {onAddSubAccount && (
          <button
            onClick={() => onAddSubAccount(acc.id)}
            className="flex items-center gap-0.5 text-[10px] text-gray-300 hover:text-brand-500 dark:text-gray-600 dark:hover:text-brand-400 transition-colors"
          >
            <span className="text-xs leading-none">+</span> add sub-account
          </button>
        )}

        {/* Rate (for parent cards) */}
        {hasSub && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 flex-1">{rateLabel}</span>
            <input
              type="text" inputMode="decimal"
              value={rateFocused ? rateLocal : (acc.rate ?? defaultRate)}
              onFocus={rateOnFocus} onChange={rateOnChange} onBlur={rateOnBlur}
              className="w-10 text-right text-[10px] px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-brand-300 dark:focus:border-brand-600"
            />
            <span className="text-[10px] text-gray-400">%</span>
          </div>
        )}

        {/* 12-mo projection */}
        {totalBal > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-1 flex items-baseline justify-between">
            <span className="text-[10px] text-gray-400">12-mo</span>
            <span className={`text-[11px] tabular-nums font-medium ${projGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {fmtFull(projBalance)}
              {projGain !== 0 && <span className={`ml-1 text-[9px] ${projGain > 0 ? 'text-emerald-500' : 'text-red-400'}`}>{projGain > 0 ? '+' : '−'}{fmtFull(Math.abs(projGain))}</span>}
            </span>
          </div>
          )}
        </div>
    </div>
  )
}

// ─── CapEx 30-Year Projection Chart ───────────────────────────────────────────

function CapExProjectionChart({ capex, reserveBal, darkMode, projYears = 30 }) {
  const scrollRef = useRef(null)
  const dragRef   = useRef({ active: false, startX: 0, scrollLeft: 0 })

  const PROJ_YEARS = projYears
  const baseYear   = new Date().getFullYear()
  const { rows, enabled } = buildCapexProjection(capex, PROJ_YEARS)

  // Build chart data: reserve balance + planned expenditure spikes per year
  // Each point carries an `items` array of { name, cost } for tooltip detail
  const chartData = [{ label: 'Now', balance: reserveBal, spend: null, items: [] }]
  rows.forEach((row, i) => {
    const yr       = i + 1
    const dueItems = enabled
      .filter(c => yr % c.intervalYears === 0)
      .map(c => ({ name: c.name, cost: c.cost }))
    const totalSpend = dueItems.reduce((s, c) => s + c.cost, 0)
    chartData.push({
      label:   String(baseYear + yr),
      balance: row.totalBalance,
      spend:   totalSpend > 0 ? totalSpend : null,
      items:   dueItems,
    })
  })

  function CapExTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const bal   = payload.find(p => p.dataKey === 'balance')?.value
    const spend = payload.find(p => p.dataKey === 'spend')?.value
    const items = payload[0]?.payload?.items ?? []
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-2.5 text-xs min-w-[160px]">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{label}</p>
        {bal != null && (
          <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
            <span>Reserve balance</span>
            <span className="tabular-nums font-medium">{fmtFull(bal)}</span>
          </div>
        )}
        {spend != null && items.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 space-y-0.5">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Planned expenditures</p>
            {items.map((it, idx) => (
              <div key={idx} className="flex justify-between gap-4 text-amber-600 dark:text-amber-400">
                <span>{it.name}</span>
                <span className="tabular-nums font-medium">{fmtFull(it.cost)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 font-semibold text-gray-700 dark:text-gray-300 pt-1 border-t border-gray-100 dark:border-gray-700 mt-0.5">
              <span>Total</span>
              <span className="tabular-nums">{fmtFull(spend)}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  const endBalance = rows[rows.length - 1]?.totalBalance ?? reserveBal
  const delta      = endBalance - reserveBal
  const isUp       = delta >= 0
  const axisColor  = darkMode ? '#6b7280' : '#9ca3af'

  const PX_PER = 30
  const chartW = (PROJ_YEARS + 1) * PX_PER

  const onMouseDown = e => {
    if (!scrollRef.current) return
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: scrollRef.current.scrollLeft }
    scrollRef.current.style.cursor = 'grabbing'
  }
  const onMouseMove = e => {
    if (!dragRef.current.active || !scrollRef.current) return
    scrollRef.current.scrollLeft = dragRef.current.scrollLeft - (e.clientX - dragRef.current.startX)
  }
  const onMouseUp = () => {
    dragRef.current.active = false
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab'
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            CapEx Reserve · {PROJ_YEARS}-Year Outlook
          </p>
          <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">
            Drag to scroll ·{' '}
            <span className="text-emerald-500">Balance</span>
            {' · '}
            <span className="text-amber-500">Planned expenditures</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">
            {fmtFull(endBalance)}
          </p>
          <p className={`text-[10px] font-semibold tabular-nums ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {isUp ? '+' : '−'}{fmtFull(Math.abs(delta))} over {PROJ_YEARS} yrs
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto no-scrollbar cursor-grab select-none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <ComposedChart width={chartW} height={180} data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gradCapex30" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: axisColor }}
            axisLine={false} tickLine={false} interval={1}
          />
          <YAxis yAxisId="bal"   hide domain={[0, 'dataMax + 1000']} />
          <YAxis yAxisId="spend" hide orientation="right" domain={[0, dataMax => dataMax * 5]} />
          <ReTooltip content={<CapExTooltip />} cursor={{ stroke: axisColor, strokeDasharray: '3 3' }} />
          <Area
            yAxisId="bal" type="monotone" dataKey="balance"
            stroke="#34d399" fill="url(#gradCapex30)" strokeWidth={2} dot={false}
          />
          <Bar
            yAxisId="spend" dataKey="spend"
            fill="#f59e0b" opacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={12}
          />
        </ComposedChart>
      </div>
    </div>
  )
}

// ─── Goals Tab ────────────────────────────────────────────────────────────────

function GoalsTab({ goals = [], onAddGoal, onUpdateGoal, onRemoveGoal }) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-indexed

  const totalMonthlyNeeded = goals.reduce((s, g) => {
    const gy = g.targetYear ?? (currentYear + 5)
    const gm = g.targetMonth ?? 0
    const monthsRemaining = (gy - currentYear) * 12 + (gm - currentMonth)
    if (monthsRemaining <= 0) return s
    const remaining = Math.max(0, (g.targetAmount ?? 0) - (g.currentSaved ?? 0))
    return s + remaining / monthsRemaining
  }, 0)

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {goals.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{goals.length} goal{goals.length !== 1 ? 's' : ''}</span>
          {totalMonthlyNeeded > 0 && (
            <span className="text-[11px] font-semibold tabular-nums text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-md">
              {fmtFull(totalMonthlyNeeded)}/mo total needed
            </span>
          )}
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {goals.map((goal, idx) => {
          const color = GOAL_COLORS[idx % GOAL_COLORS.length]
          const targetAmount = goal.targetAmount ?? 0
          const currentSaved = goal.currentSaved ?? 0
          const progress = targetAmount > 0 ? Math.min(100, (currentSaved / targetAmount) * 100) : 0
          const targetYear = goal.targetYear ?? (currentYear + 5)
          const targetMonthIdx = goal.targetMonth ?? 0
          const monthsRemaining = Math.max(0, (targetYear - currentYear) * 12 + (targetMonthIdx - currentMonth))
          const monthlyNeeded = monthsRemaining > 0
            ? Math.max(0, (targetAmount - currentSaved)) / monthsRemaining
            : 0

          return (
            <div key={goal.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50 space-y-2">
              {/* Name + remove */}
              <div className="flex items-center gap-1">
                <input
                  className="flex-1 min-w-0 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:bg-gray-50 dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5"
                  value={goal.name ?? ''}
                  onChange={e => onUpdateGoal(goal.id, 'name', e.target.value)}
                  placeholder="Goal name"
                />
                <button
                  onClick={() => onRemoveGoal(goal.id)}
                  className="text-gray-300 hover:text-red-500 text-sm leading-none px-0.5 flex-shrink-0 transition-colors dark:text-gray-600"
                >✕</button>
              </div>

              {/* Target amount */}
              <div className="space-y-0.5">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Target Amount</p>
                <MoneyInput value={targetAmount} onChange={v => onUpdateGoal(goal.id, 'targetAmount', v)} />
              </div>

              {/* Current saved */}
              <div className="space-y-0.5">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Current Saved</p>
                <MoneyInput value={currentSaved} onChange={v => onUpdateGoal(goal.id, 'currentSaved', v)} />
              </div>

              {/* Target date (month + year selects) */}
              <div className="space-y-0.5">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Target Date</p>
                <div className="flex gap-1">
                  <select
                    value={targetMonthIdx}
                    onChange={e => onUpdateGoal(goal.id, 'targetMonth', parseInt(e.target.value))}
                    className="input-field text-[11px] flex-1 min-w-0"
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select
                    value={targetYear}
                    onChange={e => onUpdateGoal(goal.id, 'targetYear', parseInt(e.target.value))}
                    className="input-field text-[11px] w-[64px] flex-shrink-0"
                  >
                    {Array.from({ length: 31 }, (_, i) => currentYear + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress bar */}
              {targetAmount > 0 && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400">{Math.round(progress)}% saved</span>
                    {monthsRemaining > 0 && <span className="text-gray-400">{monthsRemaining}mo left</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, background: color }}
                    />
                  </div>
                </div>
              )}

              {/* Monthly contribution needed */}
              {monthlyNeeded > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-1 flex items-baseline justify-between">
                  <span className="text-[10px] text-gray-400">Needed/mo</span>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{fmtFull(monthlyNeeded)}</span>
                </div>
              )}
              {targetAmount > 0 && currentSaved >= targetAmount && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-1 text-center">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Goal reached!</span>
                </div>
              )}
            </div>
          )
        })}

        {/* Add goal — dashed card */}
        <button
          onClick={onAddGoal}
          className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-3 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[60px]"
        >
          <span className="text-base leading-none">+</span>
          <span className="text-[11px] font-medium">Add Goal</span>
        </button>
      </div>
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({
  totalGross, totalNet, totalExpenses, totalCapexMo, totalOutflow, netCashflow, savingsRate,
  expenseSections, capex, pieData, barData, darkMode,
  lifeExpectancy = 90, currentAge = 40,
  cashAccounts, investmentAccounts,
  onAddCashAccount, onRemoveCashAccount, onUpdateCashAccount,
  onAddCashSubAccount, onRemoveCashSubAccount, onUpdateCashSubAccount,
  onAddInvestmentAccount, onRemoveInvestmentAccount, onUpdateInvestmentAccount,
  onAddInvestmentSubAccount, onRemoveInvestmentSubAccount, onUpdateInvestmentSubAccount,
  retirementInputs = {},
}) {
  // Per-month expense totals (from actual monthly values)
  const expByMonth = Array(12).fill(0).map((_, mi) =>
    expenseSections.flatMap(s => s.items).reduce((s, item) => s + (itemMonthsAgg(item)[mi] ?? 0), 0)
  )
  // CapEx reserve is a transfer to Reserve account, not a true expense
  const cashflowByMonth = expByMonth.map(exp => totalNet - exp - totalCapexMo)
  const annualCashflow  = cashflowByMonth.reduce((s, v) => s + v, 0)
  // Cashflow excluding CapEx transfer (for spending cash balance)
  const spendCashflowByMonth = expByMonth.map(exp => totalNet - exp)

  // Account projections
  const accBal = a => a.subAccounts?.length > 0
    ? a.subAccounts.reduce((s, sa) => s + (sa.balance ?? 0), 0)
    : (a.balance ?? 0)
  // Find Reserve sub-account balance (linked to CapEx fund)
  const reserveBal = cashAccounts.reduce((s, a) => {
    if (a.subAccounts?.length > 0) return s + a.subAccounts.filter(sa => sa.name === 'Reserve').reduce((ss, sa) => ss + (sa.balance ?? 0), 0)
    return s
  }, 0)
  const cashExReserve    = cashAccounts.reduce((s, a) => {
    if (a.subAccounts?.length > 0) return s + a.subAccounts.filter(sa => sa.name !== 'Reserve').reduce((ss, sa) => ss + (sa.balance ?? 0), 0)
    return s + (a.balance ?? 0)
  }, 0)
  const totalCash        = cashAccounts.reduce((s, a) => s + accBal(a), 0)
  const totalInvestments = investmentAccounts.reduce((s, a) => s + accBal(a), 0)
  const projCash         = cashAccounts.reduce((s, a) => s + accBal(a) * (1 + (a.rate ?? 0) / 100), 0) + annualCashflow
  const projInvestments  = investmentAccounts.reduce((s, a) => s + accBal(a) * (1 + (a.rate ?? 6) / 100), 0)
  const totalNW          = totalCash + totalInvestments
  const projNW           = projCash + projInvestments

  return (
    <div className="space-y-5">

      {/* ── Accounts ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Accounts</h3>
          {totalNW > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-gray-400">Now: <span className="font-semibold text-gray-700 dark:text-gray-300">{fmtFull(totalNW)}</span></span>
              <span className="text-gray-300 dark:text-gray-600">→</span>
              <span className="text-[11px] text-gray-400">12 mo: <span className={`font-semibold ${projNW >= totalNW ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fmtFull(projNW)}</span></span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${projNW >= totalNW ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}>
                {projNW >= totalNW ? '+' : '−'}{fmtFull(Math.abs(projNW - totalNW))}
              </span>
            </div>
          )}
        </div>

        {/* Cash & Savings */}
        <AccountSection
          label="Cash &amp; Savings"
          accounts={cashAccounts}
          accBal={accBal}
          rateLabel="Interest %"
          defaultRate={0}
          onUpdateAccount={onUpdateCashAccount}
          onRemoveAccount={onRemoveCashAccount}
          onAddAccount={onAddCashAccount}
          onAddSubAccount={onAddCashSubAccount}
          onRemoveSubAccount={onRemoveCashSubAccount}
          onUpdateSubAccount={onUpdateCashSubAccount}
        />

        {/* Investments */}
        <AccountSection
          label="Investments"
          accounts={investmentAccounts}
          accBal={accBal}
          rateLabel="Return %"
          defaultRate={6}
          onUpdateAccount={onUpdateInvestmentAccount}
          onRemoveAccount={onRemoveInvestmentAccount}
          onAddAccount={onAddInvestmentAccount}
          onAddSubAccount={onAddInvestmentSubAccount}
          onRemoveSubAccount={onRemoveInvestmentSubAccount}
          onUpdateSubAccount={onUpdateInvestmentSubAccount}
        />


      </div>

      {/* ── 12-Month Summary ── */}
      <div className="card overflow-hidden">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">12-Month Summary</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2 px-2 text-gray-400 font-medium sticky left-0 bg-white dark:bg-gray-900 min-w-[130px] z-10">Category</th>
                {MONTHS.map(m => <th key={m} className="text-right py-2 px-1.5 text-gray-400 font-medium w-[52px]">{m}</th>)}
                <th className="text-right py-2 px-1.5 text-gray-400 font-medium w-[68px] border-l border-gray-100 dark:border-gray-800">Annual</th>
              </tr>
            </thead>
            <tbody>
              {/* Net income row */}
              <tr className="border-b border-gray-50 dark:border-gray-800/30">
                <td className="py-1 px-2 sticky left-0 bg-white dark:bg-gray-900 z-10">
                  <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">Net Income</span>
                </td>
                {Array(12).fill(totalNet).map((v, i) => (
                  <td key={i} className="py-1 px-1.5 text-right">
                    <span className={`text-[11px] tabular-nums ${v > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-gray-300 dark:text-gray-700'}`}>{v > 0 ? fmtNum(v) : '—'}</span>
                  </td>
                ))}
                <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                  <span className={`text-[11px] tabular-nums font-semibold ${totalNet > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-gray-300'}`}>{totalNet > 0 ? fmtNum(totalNet * 12) : '—'}</span>
                </td>
              </tr>

              {/* Spending expense sections (exclude Savings) */}
              {(() => {
                const SAVINGS_NAMES = new Set(['Savings', 'Saving', 'Investments'])
                const spendSecs = expenseSections.filter(s => !SAVINGS_NAMES.has(s.name))
                const saveSecs  = expenseSections.filter(s => SAVINGS_NAMES.has(s.name))

                // Spending subtotal by month
                const spendByMonth = Array(12).fill(0).map((_, mi) =>
                  spendSecs.flatMap(s => s.items).reduce((s, item) => s + (itemMonthsAgg(item)[mi] ?? 0), 0)
                )
                const spendAnnual = spendByMonth.reduce((s, v) => s + v, 0)

                // Savings + CapEx subtotal by month
                const saveByMonth = Array(12).fill(0).map((_, mi) =>
                  saveSecs.flatMap(s => s.items).reduce((s, item) => s + (itemMonthsAgg(item)[mi] ?? 0), 0)
                )
                const saveAnnual = saveByMonth.reduce((s, v) => s + v, 0)

                return (
                  <>
                    {/* Spending sections */}
                    {spendSecs.map(sec => {
                      const secByMonth = Array(12).fill(0).map((_, mi) =>
                        sec.items.reduce((s, item) => s + (itemMonthsAgg(item)[mi] ?? 0), 0)
                      )
                      const secAnnual = secByMonth.reduce((s, v) => s + v, 0)
                      if (!secAnnual) return null
                      return (
                        <tr key={sec.id} className="border-b border-gray-50 dark:border-gray-800/30">
                          <td className="py-1 px-2 sticky left-0 bg-white dark:bg-gray-900 z-10">
                            <span className="text-[11px] text-gray-600 dark:text-gray-400">{sec.name}</span>
                          </td>
                          {secByMonth.map((v, i) => (
                            <td key={i} className="py-1 px-1.5 text-right">
                              <span className={`text-[11px] tabular-nums ${v > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-200 dark:text-gray-700'}`}>{v > 0 ? fmtNum(v) : ''}</span>
                            </td>
                          ))}
                          <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                            <span className="text-[11px] tabular-nums font-medium text-amber-700 dark:text-amber-400">{fmtNum(secAnnual)}</span>
                          </td>
                        </tr>
                      )
                    })}

                    {/* Spending subtotal */}
                    {spendAnnual > 0 && (
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-amber-50 dark:bg-amber-950/30">
                        <td className="py-1 px-2 sticky left-0 bg-amber-50 dark:bg-amber-950/30 z-10">
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Spending Subtotal</span>
                        </td>
                        {spendByMonth.map((v, i) => (
                          <td key={i} className="py-1 px-1.5 text-right">
                            <span className={`text-[11px] tabular-nums font-medium ${v > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-200 dark:text-gray-700'}`}>{v > 0 ? fmtNum(v) : ''}</span>
                          </td>
                        ))}
                        <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                          <span className="text-[11px] tabular-nums font-semibold text-amber-600 dark:text-amber-400">{fmtNum(spendAnnual)}</span>
                        </td>
                      </tr>
                    )}

                    {/* Divider */}
                    {(saveAnnual > 0 || totalCapexMo > 0) && (
                      <tr><td colSpan={14} className="py-0.5"><div className="border-t border-dashed border-gray-200 dark:border-gray-700" /></td></tr>
                    )}

                    {/* Savings sections */}
                    {saveSecs.map(sec => {
                      const secByMonth = Array(12).fill(0).map((_, mi) =>
                        sec.items.reduce((s, item) => s + (itemMonthsAgg(item)[mi] ?? 0), 0)
                      )
                      const secAnnual = secByMonth.reduce((s, v) => s + v, 0)
                      if (!secAnnual) return null
                      return (
                        <tr key={sec.id} className="border-b border-gray-50 dark:border-gray-800/30">
                          <td className="py-1 px-2 sticky left-0 bg-white dark:bg-gray-900 z-10">
                            <span className="text-[11px] text-brand-600 dark:text-brand-400">{sec.name}</span>
                          </td>
                          {secByMonth.map((v, i) => (
                            <td key={i} className="py-1 px-1.5 text-right">
                              <span className={`text-[11px] tabular-nums ${v > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-gray-200 dark:text-gray-700'}`}>{v > 0 ? fmtNum(v) : ''}</span>
                            </td>
                          ))}
                          <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                            <span className="text-[11px] tabular-nums font-medium text-brand-600 dark:text-brand-400">{fmtNum(secAnnual)}</span>
                          </td>
                        </tr>
                      )
                    })}

                    {/* CapEx row — shown as transfer to Reserve */}
                    {totalCapexMo > 0 && (
                      <tr className="border-b border-gray-50 dark:border-gray-800/30">
                        <td className="py-1 px-2 sticky left-0 bg-white dark:bg-gray-900 z-10">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">→ CapEx Reserve</span>
                        </td>
                        {Array(12).fill(totalCapexMo).map((v, i) => (
                          <td key={i} className="py-1 px-1.5 text-right">
                            <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{fmtNum(v)}</span>
                          </td>
                        ))}
                        <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                          <span className="text-[11px] tabular-nums font-medium text-slate-500 dark:text-slate-400">{fmtNum(totalCapexMo * 12)}</span>
                        </td>
                      </tr>
                    )}

                    {/* Total expenses row */}
                    {(totalOutflow > 0) && (
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-amber-50/30 dark:bg-amber-900/5">
                        <td className="py-1 px-2 sticky left-0 bg-amber-50/30 dark:bg-amber-900/5 z-10">
                          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Total Outflows</span>
                        </td>
                        {expByMonth.map((exp, i) => {
                          const v = exp + totalCapexMo
                          return (
                            <td key={i} className="py-1 px-1.5 text-right">
                              <span className={`text-[11px] tabular-nums font-medium ${v > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-200 dark:text-gray-700'}`}>{v > 0 ? fmtNum(v) : ''}</span>
                            </td>
                          )
                        })}
                        <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                          <span className="text-[11px] tabular-nums font-semibold text-amber-700 dark:text-amber-400">{fmtNum(totalOutflow * 12)}</span>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })()}

              {/* Net cashflow row */}
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/30">
                <td className="py-1.5 px-2 sticky left-0 bg-gray-50/60 dark:bg-gray-800/30 z-10">
                  <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100">Net Cashflow</span>
                </td>
                {cashflowByMonth.map((v, i) => (
                  <td key={i} className="py-1.5 px-1.5 text-right">
                    <span className={`text-[11px] tabular-nums font-semibold ${v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-300 dark:text-gray-700'}`}>
                      {v > 0 ? fmtNum(v) : v < 0 ? `−${fmtNum(v)}` : '—'}
                    </span>
                  </td>
                ))}
                <td className="py-1.5 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                  <span className={`text-[11px] tabular-nums font-bold ${annualCashflow > 0 ? 'text-emerald-600 dark:text-emerald-400' : annualCashflow < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
                    {annualCashflow > 0 ? fmtNum(annualCashflow) : annualCashflow < 0 ? `−${fmtNum(annualCashflow)}` : '—'}
                  </span>
                </td>
              </tr>

              {/* Spending cash balance (excludes Reserve) */}
              {cashExReserve > 0 && (() => {
                let cum = cashExReserve
                return (
                  <tr className="bg-gray-50/30 dark:bg-gray-800/20">
                    <td className="py-1 px-2 sticky left-0 bg-gray-50/30 dark:bg-gray-800/20 z-10">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Cash Balance</span>
                    </td>
                    {spendCashflowByMonth.map((v, i) => {
                      cum += v
                      return (
                        <td key={i} className="py-1 px-1.5 text-right">
                          <span className={`text-[10px] tabular-nums ${cum >= 0 ? 'text-gray-500 dark:text-gray-400' : 'text-red-500 dark:text-red-400'}`}>{fmtNum(cum)}</span>
                        </td>
                      )
                    })}
                    <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                      <span className={`text-[10px] tabular-nums font-semibold ${(cashExReserve + spendCashflowByMonth.reduce((s, v) => s + v, 0)) >= 0 ? 'text-gray-600 dark:text-gray-400' : 'text-red-500 dark:text-red-400'}`}>{fmtNum(cashExReserve + spendCashflowByMonth.reduce((s, v) => s + v, 0))}</span>
                    </td>
                  </tr>
                )
              })()}

              {/* CapEx Reserve balance — tied to Reserve sub-account */}
              {totalCapexMo > 0 && (() => {
                let cum = reserveBal
                return (
                  <tr className="bg-slate-50/30 dark:bg-slate-900/10">
                    <td className="py-1 px-2 sticky left-0 bg-slate-50/30 dark:bg-slate-900/10 z-10">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">CapEx Reserve</span>
                    </td>
                    {Array(12).fill(totalCapexMo).map((v, i) => {
                      cum += v
                      return (
                        <td key={i} className="py-1 px-1.5 text-right">
                          <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{fmtNum(cum)}</span>
                        </td>
                      )
                    })}
                    <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                      <span className="text-[10px] tabular-nums font-semibold text-slate-600 dark:text-slate-400">{fmtNum(reserveBal + totalCapexMo * 12)}</span>
                    </td>
                  </tr>
                )
              })()}

              {/* Projected investment balance row */}
              {totalInvestments > 0 && (() => {
                const monthlyGrowthRate = investmentAccounts.reduce((s, a) => {
                  const bal = accBal(a)
                  return s + bal * (a.rate ?? 6) / 100
                }, 0) / 12
                let cum = totalInvestments
                return (
                  <tr className="bg-gray-50/30 dark:bg-gray-800/20">
                    <td className="py-1 px-2 sticky left-0 bg-gray-50/30 dark:bg-gray-800/20 z-10">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Investments</span>
                    </td>
                    {Array(12).fill(0).map((_, i) => {
                      cum += cum * (investmentAccounts.reduce((s, a) => s + (a.rate ?? 6), 0) / investmentAccounts.length / 100 / 12)
                      return (
                        <td key={i} className="py-1 px-1.5 text-right">
                          <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">{fmtNum(cum)}</span>
                        </td>
                      )
                    })}
                    <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                      <span className="text-[10px] tabular-nums font-semibold text-gray-600 dark:text-gray-400">{fmtNum(projInvestments)}</span>
                    </td>
                  </tr>
                )
              })()}

              {/* Net worth row — spending cash + capex reserve + investments */}
              {totalNW > 0 && (() => {
                let cumSpend   = cashExReserve
                let cumReserve = reserveBal
                const avgInvRate = investmentAccounts.length > 0
                  ? investmentAccounts.reduce((s, a) => s + (a.rate ?? 6), 0) / investmentAccounts.length / 100 / 12
                  : 0
                let cumInv = totalInvestments
                return (
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/30">
                    <td className="py-1 px-2 sticky left-0 bg-gray-50/60 dark:bg-gray-800/30 z-10">
                      <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Net Worth</span>
                    </td>
                    {spendCashflowByMonth.map((v, i) => {
                      cumSpend += v
                      cumReserve += totalCapexMo
                      cumInv += cumInv * avgInvRate
                      const nw = cumSpend + cumReserve + cumInv
                      return (
                        <td key={i} className="py-1 px-1.5 text-right">
                          <span className={`text-[10px] tabular-nums font-medium ${nw >= totalNW ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtNum(nw)}</span>
                        </td>
                      )
                    })}
                    <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                      <span className={`text-[10px] tabular-nums font-bold ${projNW >= totalNW ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtNum(projNW)}</span>
                    </td>
                  </tr>
                )
              })()}

              {/* Projected investment balance row */}
              {totalInvestments > 0 && (() => {
                const monthlyGrowthRate = investmentAccounts.reduce((s, a) => {
                  const bal = accBal(a)
                  return s + bal * (a.rate ?? 6) / 100
                }, 0) / 12
                let cum = totalInvestments
                return (
                  <tr className="bg-gray-50/30 dark:bg-gray-800/20">
                    <td className="py-1 px-2 sticky left-0 bg-gray-50/30 dark:bg-gray-800/20 z-10">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Investments</span>
                    </td>
                    {Array(12).fill(0).map((_, i) => {
                      cum += cum * (investmentAccounts.reduce((s, a) => s + (a.rate ?? 6), 0) / investmentAccounts.length / 100 / 12)
                      return (
                        <td key={i} className="py-1 px-1.5 text-right">
                          <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">{fmtNum(cum)}</span>
                        </td>
                      )
                    })}
                    <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                      <span className="text-[10px] tabular-nums font-semibold text-gray-600 dark:text-gray-400">{fmtNum(projInvestments)}</span>
                    </td>
                  </tr>
                )
              })()}

              {/* Net worth row — spending cash + capex reserve + investments */}
              {totalNW > 0 && (() => {
                let cumSpend   = cashExReserve
                let cumReserve = reserveBal
                const avgInvRate = investmentAccounts.length > 0
                  ? investmentAccounts.reduce((s, a) => s + (a.rate ?? 6), 0) / investmentAccounts.length / 100 / 12
                  : 0
                let cumInv = totalInvestments
                return (
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/30">
                    <td className="py-1 px-2 sticky left-0 bg-gray-50/60 dark:bg-gray-800/30 z-10">
                      <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Net Worth</span>
                    </td>
                    {spendCashflowByMonth.map((v, i) => {
                      cumSpend += v
                      cumReserve += totalCapexMo
                      cumInv += cumInv * avgInvRate
                      const nw = cumSpend + cumReserve + cumInv
                      return (
                        <td key={i} className="py-1 px-1.5 text-right">
                          <span className={`text-[10px] tabular-nums font-medium ${nw >= totalNW ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtNum(nw)}</span>
                        </td>
                      )
                    })}
                    <td className="py-1 px-1.5 text-right border-l border-gray-100 dark:border-gray-800">
                      <span className={`text-[10px] tabular-nums font-bold ${projNW >= totalNW ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtNum(projNW)}</span>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cash Balance Chart — 30-year projection ── */}
      {(cashExReserve > 0 || totalCapexMo > 0) && (() => {
        const PROJ_YEARS = 30
        const baseYear   = new Date().getFullYear()
        const annualCash = spendCashflowByMonth.reduce((s, v) => s + v, 0)
        let cumCash = cashExReserve
        const cashData = [{ month: 'Now', value: cumCash }]
        for (let y = 1; y <= PROJ_YEARS; y++) {
          cumCash += annualCash
          cashData.push({ month: String(baseYear + y), value: Math.round(cumCash) })
        }
        const cashStart  = cashData[0].value
        const cashEnd    = cashData[cashData.length - 1].value
        const cashDelta  = cashEnd - cashStart
        const isUp       = cashDelta >= 0
        const stroke     = isUp ? '#6366f1' : '#f87171'
        const gradColor  = stroke
        const axisColor  = darkMode ? '#6b7280' : '#9ca3af'
        return (
          <div className="card">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Cash Balance · 30-Year Outlook</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-tight">{fmtFull(cashEnd)}</p>
              </div>
              <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums ${isUp ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-900/20'}`}>
                <span>{isUp ? '↑' : '↓'}</span>
                <span>{isUp ? '+' : '−'}{fmtFull(Math.abs(cashDelta))}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={cashData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradAppleCash30" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={gradColor} stopOpacity={0.20} />
                    <stop offset="100%" stopColor={gradColor} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} interval={4} />
                <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
                <ReTooltip
                  formatter={v => [fmtFull(v), 'Cash Balance']}
                  contentStyle={{ background: darkMode ? '#111827' : '#fff', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, borderRadius: '0.75rem', fontSize: 11, padding: '6px 10px' }}
                  cursor={{ stroke: axisColor, strokeDasharray: '3 3' }}
                />
                <Area type="monotone" dataKey="value" stroke={stroke} fill="url(#gradAppleCash30)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* ── CapEx Reserve — draggable 30-year projection with expenditure spikes ── */}
      {(reserveBal > 0 || totalCapexMo > 0 || capex.some(g => g.items?.length > 0)) && (
        <CapExProjectionChart capex={capex} reserveBal={reserveBal} darkMode={darkMode}
          projYears={Math.max(5, lifeExpectancy - currentAge)} />
      )}

      {/* ── Cash & Reserve Balance Chart ── */}
      {(cashExReserve > 0 || reserveBal > 0 || totalCapexMo > 0) && (() => {
        let cumCash = cashExReserve
        let cumRes  = reserveBal
        const chartData = [{ month: 'Now', cash: cumCash, reserve: cumRes }]
        MONTHS.forEach((m, i) => {
          cumCash += spendCashflowByMonth[i]
          cumRes  += totalCapexMo
          chartData.push({ month: m, cash: Math.round(cumCash), reserve: Math.round(cumRes) })
        })
        return (
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">Cash & Reserve Balances</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradReserve" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: darkMode ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 10, fill: darkMode ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} width={48} />
                <ReTooltip
                  formatter={(v, name) => [fmtFull(v), name === 'cash' ? 'Cash Balance' : 'CapEx Reserve']}
                  contentStyle={{ background: darkMode ? '#111827' : '#fff', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, borderRadius: '0.75rem', fontSize: 11, padding: '8px 12px' }}
                  cursor={{ stroke: darkMode ? '#374151' : '#d1d5db', strokeDasharray: '3 3' }}
                />
                <Area type="monotone" dataKey="cash" name="cash" stroke="#6366f1" fill="url(#gradCash)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="reserve" name="reserve" stroke="#94a3b8" fill="url(#gradReserve)" strokeWidth={2} dot={false} />
                <Legend
                  verticalAlign="top" align="right" height={24}
                  formatter={v => <span className="text-[10px] text-gray-500 dark:text-gray-400">{v === 'cash' ? 'Cash Balance' : 'CapEx Reserve'}</span>}
                  iconSize={8}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      })()}



      {/* ── Room Tracker (Feature 6) ── */}
      {(() => {
        const currentYear = new Date().getFullYear()
        const inflation = retirementInputs.inflation ?? 2.5
        const tfsaIndexed = retirementInputs.tfsaIndexedToInflation ?? false
        const tfsaLimit = calcTfsaLimit(currentYear, inflation, tfsaIndexed)
        const tfsaContrib = retirementInputs.accounts?.find(a => a.taxType === 'tfsa')?.annualContribution ?? 0
        const tfsaRemaining = Math.max(0, tfsaLimit - tfsaContrib)

        const rrspLimit = Math.min(31560, Math.round((retirementInputs.cppAvgEarnings ?? 0) * 0.18))
        const rrspContrib = (retirementInputs.accounts?.find(a => a.taxType === 'rrif')?.annualContribution ?? 0)
        const rrspRemaining = Math.max(0, rrspLimit - rrspContrib)

        const marginalRate = retirementInputs.workingMarginalRate ?? 40
        const recommendation = marginalRate > 40
          ? 'Your marginal rate is high — prioritize RRSP contributions for maximum tax deferral.'
          : marginalRate < 30
          ? 'Your marginal rate is low — favour TFSA contributions to shelter future tax-free growth.'
          : 'Split contributions between RRSP and TFSA for balanced tax optimization.'

        return (
          <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">RRSP / TFSA Room Tracker</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* TFSA */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">TFSA ({currentYear})</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Annual limit</span>
                  <span className="text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-300">{fmtFull(tfsaLimit)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Contributing</span>
                  <span className="text-[11px] tabular-nums text-brand-600 dark:text-brand-400">{fmtFull(tfsaContrib)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-gray-100 dark:border-gray-800 pt-1">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Remaining room</span>
                  <span className={`text-[11px] font-semibold tabular-nums ${tfsaRemaining > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>{fmtFull(tfsaRemaining)}</span>
                </div>
                {tfsaIndexed && <p className="text-[10px] text-gray-400">Indexed to inflation at {inflation}%</p>}
              </div>

              {/* RRSP */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">RRSP (Est.)</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Est. deduction limit</span>
                  <span className="text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-300">{fmtFull(rrspLimit)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Contributing</span>
                  <span className="text-[11px] tabular-nums text-brand-600 dark:text-brand-400">{fmtFull(rrspContrib)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-gray-100 dark:border-gray-800 pt-1">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Remaining room</span>
                  <span className={`text-[11px] font-semibold tabular-nums ${rrspRemaining > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>{fmtFull(rrspRemaining)}</span>
                </div>
                <p className="text-[10px] text-gray-400">18% of prior-year earnings, max $31,560</p>
              </div>
            </div>

            {/* Recommendation */}
            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Optimal Split · Marginal Rate: {marginalRate}%
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-300">{recommendation}</p>
            </div>
          </div>
        )
      })()}

      {/* ── Budget vs Actual (Feature 4) ── */}
      {(() => {
        const hasActual = expenseSections.some(sec =>
          sec.items.some(item => {
            const directSum = (item.actualMonths ?? []).reduce((s, v) => s + v, 0)
            const subSum = (item.subItems ?? []).reduce((ss, si) => ss + (si.actualMonths ?? []).reduce((s2, v) => s2 + v, 0), 0)
            return directSum + subSum > 0
          })
        )
        if (!hasActual) return null

        return (
          <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 bg-white dark:bg-gray-800/50">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">Budget vs Actual</h3>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-400 font-medium uppercase tracking-wider pb-1 border-b border-gray-100 dark:border-gray-800">
                <span>Section</span>
                <div className="flex items-center gap-6">
                  <span>Planned</span>
                  <span>Actual</span>
                  <span>Variance</span>
                </div>
              </div>
              {expenseSections.map(sec => {
                const planned = sec.items.reduce((s, item) => s + avgMonthly(item), 0)
                const actual = sec.items.reduce((s, item) => {
                  if (item.subItems?.length > 0) {
                    return s + item.subItems.reduce((ss, si) =>
                      ss + (si.actualMonths ?? Array(12).fill(0)).reduce((sv, v) => sv + v, 0) / 12, 0)
                  }
                  return s + (item.actualMonths ?? Array(12).fill(0)).reduce((sv, v) => sv + v, 0) / 12
                }, 0)
                if (planned === 0 && actual === 0) return null
                const variance = planned - actual
                const isUnder = variance >= 0
                return (
                  <div key={sec.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600 dark:text-gray-400">{sec.name}</span>
                    <div className="flex items-center gap-6 tabular-nums">
                      <span className="text-gray-500 dark:text-gray-400 w-20 text-right">{fmtFull(planned)}</span>
                      <span className="text-gray-700 dark:text-gray-300 w-20 text-right">{actual > 0 ? fmtFull(actual) : '—'}</span>
                      <span className={`w-20 text-right font-medium ${actual > 0 ? (isUnder ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400') : 'text-gray-300 dark:text-gray-700'}`}>
                        {actual > 0 ? `${isUnder ? '−' : '+'}${fmtFull(Math.abs(variance))}` : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-4">Expense Breakdown</h3>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <div style={{ width: 170, height: 170, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={2} dataKey="value">
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <ReTooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {pieData.slice(0, 9).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="flex-1 min-w-0 truncate text-gray-600 dark:text-gray-400">{d.name}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-200 tabular-nums flex-shrink-0">{fmtFull(d.value)}</span>
                  </div>
                ))}
                {pieData.length > 9 && <p className="text-[10px] text-gray-400">+{pieData.length - 9} more</p>}
              </div>
            </div>
          ) : <p className="text-xs text-gray-400 text-center py-8">Add expenses to see breakdown</p>}
        </div>

        <div className="card">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-4">Monthly Overview</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 4, left: 8 }} barSize={40}>
              <CartesianGrid vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: darkMode ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 10, fill: darkMode ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} width={48} />
              <ReTooltip formatter={v => [fmtFull(v)]} contentStyle={{ background: darkMode ? '#111827' : '#fff', border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`, borderRadius: '0.75rem', fontSize: 12, padding: '8px 12px' }} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>{barData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Main BudgetApp ───────────────────────────────────────────────────────────

export default function BudgetApp({ budget, onChange, darkMode, tab = 'dashboard', onTabChange, lifeExpectancy = 90, currentAge = 40, retirementInputs = {} }) {
  const { incomes, expenseSections = [], capex = [], province = 'ON', cashAccounts = [], investmentAccounts = [], goals = [] } = budget

  function upd(key, fn) { onChange({ ...budget, [key]: fn(budget[key] ?? []) }) }
  function set(key, val){ onChange({ ...budget, [key]: val }) }

  // ── Income ──
  const addIncome        = (type = 'employment') => upd('incomes', p => [...p, { id: nextId('i'), name: 'New Income', type, grossMonthly: 0, enabled: true }])
  const removeIncome     = id        => upd('incomes', p => p.filter(x => x.id !== id))
  const updateIncome     = (id,f,v)  => upd('incomes', p => p.map(x => x.id === id ? { ...x, [f]: v } : x))

  // ── Expense sections ──
  const addSection       = ()          => upd('expenseSections', p => [...p, { id: nextId('s'), name: 'New Section', items: [] }])
  const removeSection    = sid         => upd('expenseSections', p => p.filter(s => s.id !== sid))
  const updateSection    = (sid,f,v)   => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, [f]: v } : s))
  const addItem          = sid         => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, items: [...s.items, { id: nextId('e'), name: 'New Item', months: Array(12).fill(0), subItems: [] }] } : s))
  const removeItem       = (sid,iid)   => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s))
  const updateItem       = (sid,iid,f,v) => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, [f]: v } : i) } : s))
  const updateItemMonth  = (sid,iid,mi,val) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => { if (i.id !== iid) return i; const m = [...itemMonths(i)]; m[mi] = val; return { ...i, months: m } }) } : s))

  // ── Expense sub-items ──
  const addSubItem = (sid, iid) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => {
        if (i.id !== iid) return i
        const existing = i.subItems ?? []
        // First sub-item inherits parent's existing data; subsequent ones are blank
        const newSub = existing.length === 0
          ? { id: nextId('si'), name: i.name, months: itemMonths(i) }
          : { id: nextId('si'), name: 'New Sub-item', months: Array(12).fill(0) }
        return { ...i, subItems: [...existing, newSub] }
      })} : s))

  const removeSubItem = (sid, iid, siid) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, subItems: (i.subItems ?? []).filter(si => si.id !== siid) } : i) } : s))

  const updateSubItem = (sid, iid, siid, f, v) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, subItems: (i.subItems ?? []).map(si => si.id === siid ? { ...si, [f]: v } : si) } : i) } : s))

  const updateSubItemMonth = (sid, iid, siid, mi, val) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => {
        if (i.id !== iid) return i
        return { ...i, subItems: (i.subItems ?? []).map(si => {
          if (si.id !== siid) return si
          const m = [...itemMonths(si)]; m[mi] = val; return { ...si, months: m }
        })}
      })} : s))

  // ── Actual months (Feature 4) ──
  const updateItemActualMonth = (sid, iid, mi, val) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => {
        if (i.id !== iid) return i
        const m = [...(i.actualMonths ?? Array(12).fill(0))]; m[mi] = val
        return { ...i, actualMonths: m }
      })} : s))

  const updateSubItemActualMonth = (sid, iid, siid, mi, val) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => {
        if (i.id !== iid) return i
        return { ...i, subItems: (i.subItems ?? []).map(si => {
          if (si.id !== siid) return si
          const m = [...(si.actualMonths ?? Array(12).fill(0))]; m[mi] = val
          return { ...si, actualMonths: m }
        })}
      })} : s))

  // ── Goals (Feature 8) ──
  const addGoal = () => upd('goals', p => [...(p ?? []), {
    id: nextId('g'),
    name: 'New Goal',
    targetAmount: 10000,
    targetYear: new Date().getFullYear() + 3,
    targetMonth: 0,
    currentSaved: 0,
    color: GOAL_COLORS[((p ?? []).length) % GOAL_COLORS.length],
  }])
  const updateGoal = (id, f, v) => upd('goals', p => (p ?? []).map(g => g.id === id ? { ...g, [f]: v } : g))
  const removeGoal = id => upd('goals', p => (p ?? []).filter(g => g.id !== id))

  // ── CapEx (one card per item, single internal group) ──
  const _ensureCg = p => p.length > 0 ? p : [{ id: nextId('cg'), name: 'Capital Expenses', items: [] }]
  const addCapexItem    = ()       => upd('capex', p => { const gs = _ensureCg(p); const g = gs[0]; return [{ ...g, items: [...(g.items ?? []), { id: nextId('cx'), name: 'New Item', cost: 5000, intervalYears: 5, reserveBalance: 0, returnRate: 3, enabled: true, subItems: [] }] }] })
  const removeCapexItem = id       => upd('capex', p => p.map(g => ({ ...g, items: (g.items ?? []).filter(c => c.id !== id) })))
  const updateCapexItem = (id,f,v) => upd('capex', p => p.map(g => ({ ...g, items: (g.items ?? []).map(c => c.id === id ? { ...c, [f]: v } : c) })))

  // ── CapEx sub-items ──
  const addCapexSubItem    = itemId          => upd('capex', p => p.map(g => ({ ...g, items: (g.items ?? []).map(item => item.id !== itemId ? item : { ...item, subItems: [...(item.subItems ?? []), { id: nextId('cxs'), name: 'New Item', cost: 5000, intervalYears: 10, reserveBalance: 0 }] }) })))
  const removeCapexSubItem = (itemId, subId) => upd('capex', p => p.map(g => ({ ...g, items: (g.items ?? []).map(item => item.id !== itemId ? item : { ...item, subItems: (item.subItems ?? []).filter(si => si.id !== subId) }) })))
  const updateCapexSubItem = (itemId, subId, f, v) => upd('capex', p => p.map(g => ({ ...g, items: (g.items ?? []).map(item => item.id !== itemId ? item : { ...item, subItems: (item.subItems ?? []).map(si => si.id === subId ? { ...si, [f]: v } : si) }) })))

  // ── Cash accounts ──
  const addCashAccount    = ()       => upd('cashAccounts', p => [...p, { id: nextId('ca'), name: 'New Account', balance: 0, rate: 0, subAccounts: [] }])
  const removeCashAccount = id       => upd('cashAccounts', p => p.filter(a => a.id !== id))
  const updateCashAccount = (id,f,v) => upd('cashAccounts', p => p.map(a => a.id === id ? { ...a, [f]: v } : a))
  const addCashSubAccount    = accId          => upd('cashAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: [...(a.subAccounts ?? []), { id: nextId('cas'), name: 'New', balance: 0 }] }))
  const removeCashSubAccount = (accId, subId) => upd('cashAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).filter(sa => sa.id !== subId) }))
  const updateCashSubAccount = (accId, subId, f, v) => upd('cashAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).map(sa => sa.id === subId ? { ...sa, [f]: v } : sa) }))

  // ── Investment accounts ──
  const addInvestmentAccount    = ()       => upd('investmentAccounts', p => [...p, { id: nextId('ia'), name: 'New Account', balance: 0, rate: 6, subAccounts: [] }])
  const removeInvestmentAccount = id       => upd('investmentAccounts', p => p.filter(a => a.id !== id))
  const updateInvestmentAccount = (id,f,v) => upd('investmentAccounts', p => p.map(a => a.id === id ? { ...a, [f]: v } : a))
  const addInvestmentSubAccount    = accId          => upd('investmentAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: [...(a.subAccounts ?? []), { id: nextId('ias'), name: 'New', balance: 0 }] }))
  const removeInvestmentSubAccount = (accId, subId) => upd('investmentAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).filter(sa => sa.id !== subId) }))
  const updateInvestmentSubAccount = (accId, subId, f, v) => upd('investmentAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).map(sa => sa.id === subId ? { ...sa, [f]: v } : sa) }))

  // ── Derived ──
  const incomeCalcs   = incomes.map(inc => ({ inc, ...calcIncomeNet(inc, province) }))
  const enabledCalcs  = incomeCalcs.filter(c => c.inc.enabled !== false)
  const totalGross    = enabledCalcs.reduce((s, c) => s + c.gross, 0)
  const totalCpp      = enabledCalcs.reduce((s, c) => s + c.cpp,   0)
  const totalEi       = enabledCalcs.reduce((s, c) => s + c.ei,    0)
  const totalTax      = enabledCalcs.reduce((s, c) => s + c.tax,   0)
  const totalNet      = enabledCalcs.reduce((s, c) => s + c.net,   0)

  const leafItems     = allLeafItems(expenseSections)
  const totalExpenses = expenseSections.flatMap(s => s.items).reduce((s, i) => s + avgMonthly(i), 0)
  const totalCapexMo  = flatCapexItems(capex).reduce((s, c) => s + capexMonthly(c), 0)
  const totalOutflow  = totalExpenses + totalCapexMo
  const netCashflow   = totalNet - totalOutflow
  const savingsRate   = totalNet > 0 ? netCashflow / totalNet : 0

  // Color map (leaf items only)
  const itemColorMap = {}
  leafItems.forEach((item, idx) => { itemColorMap[item.id] = idx % COLORS.length })

  const pieData = [
    ...leafItems.filter(e => leafAvg(e) > 0).map(e => ({ name: e.name, value: leafAvg(e), color: COLORS[itemColorMap[e.id] ?? 0] })),
    ...flatCapexItems(capex).filter(c => c.enabled && capexMonthly(c) > 0).map(c => ({ name: `${c.name} Reserve`, value: capexMonthly(c), color: CAPEX_COLOR })),
  ].sort((a, b) => b.value - a.value)

  const barData = [
    { label: 'Gross',    value: totalGross,              fill: '#16a34a' },
    { label: 'Net',      value: totalNet,                fill: '#0ea5e9' },
    { label: 'Expenses', value: totalOutflow,            fill: '#f59e0b' },
    { label: 'Savings',  value: Math.max(0, netCashflow), fill: '#6366f1' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
        {tab === 'dashboard' && (
          <DashboardTab
            totalGross={totalGross} totalNet={totalNet} totalExpenses={totalExpenses}
            totalCapexMo={totalCapexMo} totalOutflow={totalOutflow} netCashflow={netCashflow}
            savingsRate={savingsRate} expenseSections={expenseSections}
            capex={capex} pieData={pieData} barData={barData} darkMode={darkMode}
            lifeExpectancy={lifeExpectancy} currentAge={currentAge}
            cashAccounts={cashAccounts} investmentAccounts={investmentAccounts}
            onAddCashAccount={addCashAccount} onRemoveCashAccount={removeCashAccount} onUpdateCashAccount={updateCashAccount}
            onAddCashSubAccount={addCashSubAccount} onRemoveCashSubAccount={removeCashSubAccount} onUpdateCashSubAccount={updateCashSubAccount}
            onAddInvestmentAccount={addInvestmentAccount} onRemoveInvestmentAccount={removeInvestmentAccount} onUpdateInvestmentAccount={updateInvestmentAccount}
            onAddInvestmentSubAccount={addInvestmentSubAccount} onRemoveInvestmentSubAccount={removeInvestmentSubAccount} onUpdateInvestmentSubAccount={updateInvestmentSubAccount}
            retirementInputs={retirementInputs}
          />
        )}
        {tab === 'income' && (
          <IncomeTab
            incomes={incomes} province={province} incomeCalcs={incomeCalcs}
            totalGross={totalGross} totalCpp={totalCpp} totalEi={totalEi} totalTax={totalTax} totalNet={totalNet}
            onAddIncome={addIncome} onRemoveIncome={removeIncome} onUpdateIncome={updateIncome}
            onSetProvince={v => set('province', v)}
          />
        )}
        {tab === 'expenses' && (
          <ExpensesTab
            expenseSections={expenseSections} capex={capex} totalNet={totalNet}
            totalExpenses={totalExpenses} totalCapexMo={totalCapexMo} totalOutflow={totalOutflow}
            itemColorMap={itemColorMap}
            onAddSection={addSection} onRemoveSection={removeSection} onUpdateSection={updateSection}
            onAddItem={addItem} onRemoveItem={removeItem} onUpdateItem={updateItem} onUpdateItemMonth={updateItemMonth}
            onAddSubItem={addSubItem} onRemoveSubItem={removeSubItem}
            onUpdateSubItem={updateSubItem} onUpdateSubItemMonth={updateSubItemMonth}
            onUpdateItemActualMonth={updateItemActualMonth}
            onUpdateSubItemActualMonth={updateSubItemActualMonth}
          />
        )}
        {tab === 'capex' && (
          <CapExTab
            capex={capex}
            onAddCapexItem={addCapexItem} onRemoveCapexItem={removeCapexItem} onUpdateCapexItem={updateCapexItem}
            onAddCapexSubItem={addCapexSubItem} onRemoveCapexSubItem={removeCapexSubItem} onUpdateCapexSubItem={updateCapexSubItem}
          />
        )}
        {tab === 'goals' && (
          <GoalsTab
            goals={goals}
            onAddGoal={addGoal}
            onUpdateGoal={updateGoal}
            onRemoveGoal={removeGoal}
          />
        )}
        <p className="text-[11px] text-gray-400 text-center pt-4 pb-2">
          Tax estimates use 2025 federal &amp; provincial brackets · CPP/EI use 2025 rates · For planning purposes only
        </p>
      </div>
    </div>
  )
}
