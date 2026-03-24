import { useState, Fragment, useMemo, useRef, useEffect } from 'react'
import { formatWhileEditing, parseFormatted, handleArrowKeys, flashCommit } from '../lib/inputHelpers.js'
import ExpenseTracker from './ExpenseTracker.jsx'
import { buildDemoTransactions } from './ExpenseTracker.jsx'
import { createPortal } from 'react-dom'
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend, ReferenceLine, Line,
} from 'recharts'
import { calcTax, PROVINCES } from '../lib/tax.js'
import { calcTfsaLimit } from '../lib/simulate.js'
import { calcRealEstateSummary } from './RealEstateApp.jsx'

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
  { id: 'plan',      label: 'Plan'      },
  { id: 'capex',     label: 'Big Purchases' },
  { id: 'goals',     label: 'Goals'     },
]

const GOAL_COLORS = ['#16a34a', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2']

// ─── Demo account overlays (balance/rate/minPayment shown when dashDemo is on) ─
const DEMO_CASH_OVERLAYS = [
  { balance: 8420,  rate: 0.5 },
  { balance: 18750, rate: 2.1 },
  { balance: 5200,  rate: 0.3 },
  { balance: 3840,  rate: 0.0 },
]
const DEMO_INV_OVERLAYS = [
  { balance: 112400, rate: 7.2 },
  { balance: 45200,  rate: 5.8 },
  { balance: 23800,  rate: 6.5 },
  { balance: 68000,  rate: 7.0 },
]
const DEMO_DEBT_OVERLAYS = [
  { balance: 2340,   rate: 19.99, minPayment: 120  },
  { balance: 385000, rate: 5.50,  minPayment: 2200 },
  { balance: 14500,  rate: 6.00,  minPayment: 350  },
  { balance: 9800,   rate: 8.00,  minPayment: 250  },
]
const DEMO_OTHER_ASSETS = [
  { id: 'demo_re',  name: 'Primary Residence', assetType: 'real_estate', value: 650000, appreciation: 3.5 },
  { id: 'demo_car', name: 'Vehicle',            assetType: 'vehicle',     value: 28000,  appreciation: -8  },
]

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

function itemMonths(item, year) {
  if (year != null && item.monthsByYear?.[year]) return item.monthsByYear[year]
  return item.months ?? Array(12).fill(item.monthly ?? 0)
}

// Leaf-level avg (no subItem recursion)
function leafAvg(item, year) { return itemMonths(item, year).reduce((s, v) => s + v, 0) / 12 }

// Aggregated avg — if item has subItems, sum those; else use own months
function avgMonthly(item, year) {
  if (item.subItems?.length) return item.subItems.reduce((s, si) => s + leafAvg(si, year), 0)
  return leafAvg(item, year)
}

// Aggregated 12-month array for an item with subItems
function itemMonthsAgg(item, year) {
  if (!item.subItems?.length) return itemMonths(item, year)
  return Array(12).fill(0).map((_, i) => item.subItems.reduce((s, si) => s + (itemMonths(si, year)[i] ?? 0), 0))
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

// Sinking fund PMT: monthly contribution to accumulate exactly `cost` in `intervalYears` years
function sinkingFundPMT(cost, intervalYears, returnRate = 3) {
  const N = Math.max(1, intervalYears) * 12
  const r = (returnRate ?? 3) / 100 / 12
  if (r < 0.0001) return cost / N
  const factor = Math.pow(1 + r, N)
  return cost * r / (factor - 1)
}

// Monthly reserve for a capex item or parent card (sums sub-items when present)
// Uses monthlyContrib override if set (from Optimize), otherwise simple cost/interval/12
function capexMonthly(c) {
  if (c.subItems?.length > 0) {
    return c.subItems.reduce((s, si) => s + (
      si.monthlyContrib != null ? si.monthlyContrib
      : si.intervalYears > 0 ? si.cost / si.intervalYears / 12 : 0
    ), 0)
  }
  if (c.enabled === false || c.intervalYears <= 0) return 0
  return c.monthlyContrib != null ? c.monthlyContrib : c.cost / c.intervalYears / 12
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
      const mo   = c.monthlyContrib != null ? c.monthlyContrib : c.cost / c.intervalYears / 12
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

function MoneyInput({ value, onChange, className = '', placeholder = '', compact = false }) {
  const [local, setLocal]   = useState('')
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)
  const inputRef = useRef(null)
  const prevValue = useRef(value)
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const onFocus  = () => { setFocused(true); prevValue.current = value; setLocal((value??0).toLocaleString()) }
  const onChg    = e => { const f = formatWhileEditing(e.target.value); setLocal(f); const n = parseFormatted(f); if (!isNaN(n)) { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onChange(n), 250) } }
  const onBlur   = () => { clearTimeout(timerRef.current); setFocused(false); const n = parseFormatted(local); if (!isNaN(n)) { const v = Math.round(n); onChange(v); setLocal(v.toLocaleString()); if (v !== prevValue.current) flashCommit(inputRef.current) } else setLocal((value??0).toLocaleString()) }
  return (
    <div className={`relative flex items-center ${className}`}>
      <span className={`absolute left-2 text-gray-400 pointer-events-none ${compact ? 'text-[11px]' : 'text-xs'}`}>$</span>
      <input ref={inputRef} type="text" inputMode="numeric" placeholder={placeholder}
        value={focused ? local : (value??0).toLocaleString()}
        onFocus={onFocus} onChange={onChg} onBlur={onBlur}
        onKeyDown={e => handleArrowKeys(e, { value: parseFormatted(local) || value, step: 100, min: 0, onChange: v => { onChange(v); setLocal(v.toLocaleString()) } })}
        className={`input-field pl-4 pr-2 text-right no-spinner w-full ${compact ? '!text-xs !py-1' : ''}`} />
    </div>
  )
}

function CellInput({ value, onChange }) {
  const [local, setLocal]   = useState('')
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const onFocus  = () => { setFocused(true); setLocal(value === 0 ? '' : value.toLocaleString()) }
  const onChg    = e => { const f = formatWhileEditing(e.target.value); setLocal(f); const n = parseFormatted(f); if (!isNaN(n)) { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onChange(n), 250) } }
  const onBlur   = () => { clearTimeout(timerRef.current); setFocused(false); const n = parseFormatted(local); onChange(isNaN(n) ? 0 : Math.round(n)) }
  return (
    <input type="text" inputMode="numeric" placeholder="0"
      value={focused ? local : (value === 0 ? '' : value.toLocaleString())}
      onFocus={onFocus} onChange={onChg} onBlur={onBlur}
      onKeyDown={e => handleArrowKeys(e, { value: parseFormatted(local) || value, step: 50, min: 0, onChange: v => { onChange(v); setLocal(v === 0 ? '' : v.toLocaleString()) } })}
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
  planYear, onPlanYearChange,
  onAddSection, onRemoveSection, onUpdateSection, onReorderSections,
  onAddItem, onRemoveItem, onUpdateItem, onUpdateItemMonth, onReorderItems,
  onAddSubItem, onRemoveSubItem, onUpdateSubItem, onUpdateSubItemMonth,
}) {
  const [spread, setSpread] = useState(null) // {rect, onSpread}
  const [dragSecId, setDragSecId] = useState(null)
  const [dragOverSecId, setDragOverSecId] = useState(null)
  // item drag: key = "secId:itemId"
  const [dragItemKey, setDragItemKey] = useState(null)
  const [dragOverItemKey, setDragOverItemKey] = useState(null)
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
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">Monthly Expenses</h3>

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
                  <th className="text-left py-2 px-2 text-gray-400 font-medium sticky left-0 bg-white dark:bg-gray-900 min-w-[160px] z-10">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onPlanYearChange(y => y - 1)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base leading-none">‹</button>
                      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 tabular-nums">{planYear}</span>
                      <button onClick={() => onPlanYearChange(y => y + 1)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-base leading-none">›</button>
                    </div>
                  </th>
                  <th className="w-5"></th>
                  <th className="text-right py-2 px-0.5 text-gray-400 font-medium w-[52px]">Avg</th>
                  <th className="text-right py-2 px-0.5 text-gray-400 font-medium w-[58px]">12m ↕</th>
                  <th className="text-right py-2 px-0.5 text-gray-400 font-medium w-[46px]">% Net</th>
                  {MONTHS.map(m => (
                    <th key={m} className="text-right py-2 px-0.5 text-gray-400 font-medium w-[52px]">{m}</th>
                  ))}
                  <th className="w-5"></th>
                </tr>
              </thead>
              <tbody>
                {expenseSections.map(sec => {
                  const secAvg        = sec.items.reduce((s, i) => s + avgMonthly(i, planYear), 0)
                  const secMonthTotals = Array(12).fill(0).map((_, mi) =>
                    sec.items.reduce((s, item) => s + (itemMonthsAgg(item, planYear)[mi] ?? 0), 0)
                  )
                  return (
                    <Fragment key={sec.id}>
                      {/* Section header — draggable */}
                      <tr
                        draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragSecId(sec.id) }}
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSecId(sec.id) }}
                        onDrop={e => { e.preventDefault(); if (dragSecId && dragSecId !== sec.id) onReorderSections(dragSecId, sec.id); setDragSecId(null); setDragOverSecId(null) }}
                        onDragEnd={() => { setDragSecId(null); setDragOverSecId(null) }}
                        className={`border-b border-gray-100 dark:border-gray-800 transition-all
                          ${dragSecId === sec.id ? 'opacity-40' : 'bg-gray-50 dark:bg-gray-800/50'}
                          ${dragOverSecId === sec.id && dragSecId !== sec.id ? 'border-t-2 border-t-brand-400 dark:border-t-brand-500' : ''}`}
                      >
                        <td className="py-1.5 px-2 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 min-w-[160px]">
                          <div className="flex items-center gap-1.5">
                            <span className="cursor-grab text-gray-300 dark:text-gray-600 select-none text-[13px] leading-none" title="Drag to reorder">⠿</span>
                            <button
                              onClick={() => onRemoveSection(sec.id)}
                              title="Remove section"
                              className="w-4 h-4 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:bg-red-900/30 font-bold text-sm flex-shrink-0 transition-colors leading-none"
                            >−</button>
                            <input
                              className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide bg-transparent border-none outline-none focus:ring-0 focus:bg-white dark:focus:bg-gray-700 rounded px-1 -mx-1 py-0.5 w-32"
                              value={sec.name}
                              onChange={e => onUpdateSection(sec.id, 'name', e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="py-1.5 px-1 bg-gray-50 dark:bg-gray-800/50">
                          <button
                            onClick={() => onAddItem(sec.id)}
                            title="Add item"
                            className="w-4 h-4 rounded flex items-center justify-center text-brand-500 hover:text-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/20 text-sm font-bold flex-shrink-0 transition-colors"
                          >+</button>
                        </td>
                        <td colSpan={COL_SPAN - 3} className="bg-gray-50 dark:bg-gray-800/50" />
                        <td className="bg-gray-50 dark:bg-gray-800/50" />
                      </tr>

                      {/* Items */}
                      {sec.items.map(item => {
                        const hasSub = item.subItems?.length > 0
                        const avg    = avgMonthly(item, planYear)
                        const months = itemMonthsAgg(item, planYear) // agg if has subItems

                        const itemKey = `${sec.id}:${item.id}`
                        return (
                          <Fragment key={item.id}>
                            {/* Item / category row — draggable */}
                            <tr
                              draggable
                              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragItemKey(itemKey) }}
                              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverItemKey(itemKey) }}
                              onDrop={e => {
                                e.preventDefault()
                                if (dragItemKey && dragItemKey !== itemKey) {
                                  const [fromSec, fromItem] = dragItemKey.split(':')
                                  if (fromSec === sec.id) onReorderItems(sec.id, fromItem, item.id)
                                }
                                setDragItemKey(null); setDragOverItemKey(null)
                              }}
                              onDragEnd={() => { setDragItemKey(null); setDragOverItemKey(null) }}
                              className={`border-b border-gray-50 dark:border-gray-800/30 group transition-all
                                ${dragItemKey === itemKey ? 'opacity-40' : hasSub ? 'bg-gray-50/40 dark:bg-gray-800/20' : 'hover:bg-amber-50/30 dark:hover:bg-amber-900/5'}
                                ${dragOverItemKey === itemKey && dragItemKey !== itemKey ? 'border-t-2 border-t-brand-400 dark:border-t-brand-500' : ''}`}
                            >
                              <td className={`py-0.5 px-2 sticky left-0 z-10 transition-colors ${hasSub ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 group-hover:bg-amber-50 dark:group-hover:bg-amber-950'}`}>
                                <div className="flex items-center gap-1.5">
                                  {/* − remove button */}
                                  <button
                                    onClick={() => onRemoveItem(sec.id, item.id)}
                                    title="Remove item"
                                    className="w-4 h-4 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:bg-red-900/30 font-bold text-sm flex-shrink-0 transition-colors leading-none opacity-0 group-hover:opacity-100"
                                  >−</button>
                                  {/* dot — square for category, circle for leaf */}
                                  <div className={`w-1.5 h-1.5 flex-shrink-0 ${hasSub ? 'rounded-sm bg-gray-400 dark:bg-gray-500' : 'rounded-full'}`}
                                    style={hasSub ? {} : { background: COLORS[(itemColorMap[item.id] ?? 0) % COLORS.length] }} />
                                  <input
                                    className={`input-field min-w-0 w-24 py-0.5 ${hasSub ? 'text-[11px] font-medium text-gray-700 dark:text-gray-200' : 'text-[11px]'}`}
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
                              ) : (
                                itemMonths(item, planYear).map((v, i) => (
                                  <td key={i} className="py-0.5 px-0.5">
                                    <CellInput value={v} onChange={val => onUpdateItemMonth(sec.id, item.id, i, val)} />
                                  </td>
                                ))
                              )}

                              <td />
                            </tr>

                            {/* Sub-item rows */}
                            {hasSub && item.subItems.map(si => {
                              const siAvg = leafAvg(si, planYear)
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
                                  {itemMonths(si, planYear).map((v, i) => (
                                    <td key={i} className="py-0.5 px-0.5">
                                      <CellInput value={v} onChange={val => onUpdateSubItemMonth(sec.id, item.id, si.id, i, val)} />
                                    </td>
                                  ))}
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
                    <td className="py-1.5 px-0.5 text-right font-semibold text-amber-600 dark:text-amber-400 tabular-nums text-[11px]">{fmtFull(totalExpenses)}/mo</td>
                    <td className="py-1.5 px-0.5 text-right font-semibold text-gray-700 dark:text-gray-300 tabular-nums text-[11px]">{fmtFull(totalExpenses * 12)}</td>
                    <td className="py-1.5 px-0.5 text-right text-gray-400 tabular-nums text-[11px]">{totalOutflow > 0 ? pct(totalExpenses / totalOutflow) : '—'}</td>
                    {Array(12).fill(0).map((_, i) => {
                      const col = allLeafItems(expenseSections).reduce((s, item) => s + (itemMonths(item, planYear)[i] ?? 0), 0)
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
                      {/* Big Purchases Reserve header — sticky */}
                      <tr className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 px-2 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Big Purchases Reserve</span>
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
                            <td className="py-0.5 px-0.5 text-right font-medium text-slate-600 dark:text-slate-400 tabular-nums text-[11px]">{fmtNum(cat.mo)}</td>
                            <td className="py-0.5 px-0.5 text-right text-gray-500 dark:text-gray-400 tabular-nums text-[11px]">{fmtNum(cat.mo * 12)}</td>
                            <td className="py-0.5 px-0.5 text-right text-gray-400 tabular-nums text-[11px]">{totalOutflow > 0 ? pct(cat.mo / totalOutflow) : '—'}</td>
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
                    <td className="py-1.5 px-2 font-semibold text-slate-600 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 text-[11px] uppercase tracking-wide">Big Purchases Subtotal</td>
                    <td />
                    <td className="py-1.5 px-0.5 text-right font-semibold text-slate-600 dark:text-slate-400 tabular-nums text-[11px]">{fmtFull(totalCapexMo)}/mo</td>
                    <td className="py-1.5 px-0.5 text-right font-semibold text-slate-600 dark:text-slate-400 tabular-nums text-[11px]">{fmtFull(totalCapexMo * 12)}</td>
                    <td className="py-1.5 px-0.5 text-right text-gray-400 tabular-nums text-[11px]">{totalOutflow > 0 ? pct(totalCapexMo / totalOutflow) : '—'}</td>
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
                  <td className="py-2 px-2 font-bold text-gray-900 dark:text-gray-100 sticky left-0 bg-gray-100 dark:bg-gray-800 z-10 text-[11px]">Total Outflows</td>
                  <td />
                  <td className="py-2 px-0.5 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums text-[11px]">{fmtFull(totalOutflow)}/mo</td>
                  <td className="py-2 px-0.5 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums text-[11px]">{fmtFull(totalOutflow * 12)}</td>
                  <td className="py-2 px-0.5 text-right font-bold text-gray-700 dark:text-gray-300 tabular-nums text-[11px]">{totalOutflow > 0 ? pct(totalOutflow / totalOutflow) : '—'}</td>
                  {Array(12).fill(0).map((_, i) => {
                    const col = allLeafItems(expenseSections).reduce((s, it) => s + (itemMonths(it, planYear)[i] ?? 0), 0) + totalCapexMo
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

function CapExTab({ capex, onAddCapexItem, onRemoveCapexItem, onUpdateCapexItem, onAddCapexSubItem, onRemoveCapexSubItem, onUpdateCapexSubItem, onOptimize, reserveBal = 0, darkMode = false, lifeExpectancy = 90, currentAge = 40, cashAccounts = [], reserveAccountId = null, onSetReserveAccountId }) {
  const rawItems = capex.flatMap(g => g.items ?? [])
  const totalMo  = rawItems.reduce((s, item) => s + capexMonthly(item), 0)
  const isOptimized = rawItems.some(item =>
    item.monthlyContrib != null || (item.subItems ?? []).some(si => si.monthlyContrib != null)
  )

  return (
    <div className="space-y-4">

      {/* Summary strip + Optimize button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {totalMo > 0 && (<>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">Total reserve</span>
            <span className="text-[11px] font-semibold tabular-nums text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded-md">
              {fmtFull(totalMo)}/mo · {fmtFull(totalMo * 12)}/yr
            </span>
            {isOptimized && (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-md">✓ Optimized</span>
            )}
          </>)}

          {/* Reserve account picker */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">Reserve account</span>
            {cashAccounts.length > 0 ? (
              <select
                value={reserveAccountId ?? ''}
                onChange={e => onSetReserveAccountId(e.target.value || null)}
                className="text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
              >
                <option value="">— not linked —</option>
                {cashAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{reserveBal > 0 && a.id === reserveAccountId ? ` · ${fmtFull(reserveBal)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-amber-500 dark:text-amber-400">Add a cash account in Accounts first</span>
            )}
            {reserveAccountId && reserveBal > 0 && (
              <span className="text-[11px] tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{fmtFull(reserveBal)} balance</span>
            )}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
              {reserveAccountId ? 'Outlook uses linked account balance' : 'Outlook assumes 3% return · link an account to use its balance'}
            </span>
          </div>
        </div>
        {rawItems.length > 0 && (
          <div className="flex items-center gap-2">
            {isOptimized && (
              <button
                onClick={() => onOptimize(false)}
                className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors"
              >Reset</button>
            )}
            <div className="relative group">
              <button
                onClick={() => onOptimize(true)}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-sm"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 8h2m8 0h2M8 2v2m0 8v2M4.5 4.5l1.5 1.5m4 4l1.5 1.5M4.5 11.5l1.5-1.5m4-4l1.5-1.5"/>
                  <circle cx="8" cy="8" r="2"/>
                </svg>
                Optimize Contributions
              </button>
              {/* Hover tooltip */}
              <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl px-3.5 py-3 shadow-2xl z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <p className="font-semibold text-white mb-1.5">How Optimize Contributions works</p>
                <p className="text-gray-300 mb-2">Your reserve fund should sit in a dedicated account earning a return (e.g. a HISA or short-term GIC). Because the balance compounds over time, the amount you need to contribute each month decreases — the snowball does more and more of the work.</p>
                <p className="text-gray-300">This button calculates the <span className="text-white font-medium">minimum monthly contribution</span> for each item based on its cost, how many years until you'll need it, and an assumed growth rate — so you hit the target exactly without over-saving.</p>
                <div className="mt-2 pt-2 border-t border-gray-700 text-gray-400 text-[10px]">Assumes 3% annual return on the reserve balance (conservative HISA/GIC rate).</div>
              </div>
            </div>
          </div>
        )}
      </div>

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
                  <MoneyInput value={item.cost} onChange={v => onUpdateCapexItem(item.id, 'cost', v)} className="flex-1 min-w-0" compact />
                  <div className="relative w-[60px] flex-shrink-0">
                    <input type="number" min={1} max={99} value={item.intervalYears}
                      onChange={e => onUpdateCapexItem(item.id, 'intervalYears', Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-field text-right no-spinner pr-5 w-full !text-xs !py-1" />
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
                          className="flex-1 min-w-0 text-xs bg-transparent border-none outline-none focus:ring-0 focus:bg-white dark:focus:bg-gray-700 rounded px-0.5 text-gray-600 dark:text-gray-400 truncate"
                          value={si.name}
                          onChange={e => onUpdateCapexSubItem(item.id, si.id, 'name', e.target.value)}
                          placeholder="Name"
                        />
                        <MoneyInput value={si.cost} onChange={v => onUpdateCapexSubItem(item.id, si.id, 'cost', v)} className="w-[100px] flex-shrink-0" compact />
                        <div className="relative w-[48px] flex-shrink-0">
                          <input type="number" min={1} max={99} value={si.intervalYears}
                            onChange={e => onUpdateCapexSubItem(item.id, si.id, 'intervalYears', Math.max(1, parseInt(e.target.value) || 1))}
                            className="input-field text-right no-spinner pr-5 w-full !text-xs !py-1" />
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

      {/* Reserve projection chart */}
      {rawItems.length > 0 && (
        <CapExProjectionChart
          capex={capex}
          reserveBal={reserveBal}
          darkMode={darkMode}
          projYears={Math.max(5, lifeExpectancy - currentAge)}
        />
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

        {/* Parent account — bucket rows */}
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

        {/* Add bucket */}
        {onAddSubAccount && (
          <button
            onClick={() => onAddSubAccount(acc.id)}
            className="flex items-center gap-0.5 text-[10px] text-gray-300 hover:text-brand-500 dark:text-gray-600 dark:hover:text-brand-400 transition-colors"
          >
            <span className="text-xs leading-none">+</span> add bucket
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
            Big Purchases Reserve · {PROJ_YEARS}-Year Outlook
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

// ─── Account Sparkline ───────────────────────────────────────────────────────
// Apple-style mini line chart showing projected account balance over 12 months.
function AcctSparkline({ balance = 0, rate = 0, monthlyAdd = 0, color = '#10b981', id = 'acct', volatility = 0 }) {
  const months = 12
  const r = rate / 100 / 12
  const pts = []
  let b = balance
  // Seeded deterministic noise based on id so each account has a unique but consistent shape
  const seed = String(id).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xfffffff, 17)
  for (let i = 0; i <= months; i++) {
    const jitter = volatility > 0 ? (((seed * (i + 3) * 1_000_003) % 997) / 997 - 0.5) * volatility * balance : 0
    pts.push(b + jitter)
    b = b * (1 + r) + monthlyAdd
  }
  const lo = Math.min(...pts), hi = Math.max(...pts)
  const rng = hi - lo || 1
  const W = 72, H = 24, PAD = 2
  const x = i => (i / months) * W
  const y = v => H - PAD - ((v - lo) / rng) * (H - PAD * 2)
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const fill = `${d} L ${W} ${H} L 0 ${H} Z`
  const uid = `sp-${id}`
  return (
    <svg width={W} height={H} className="flex-shrink-0 overflow-visible">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0}    />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${uid})`} />
      <path d={d}    fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Budget Sankey ─────────────────────────────────────────────────────────────
// 3-column SVG Sankey: Income → [Fixed | Discretionary | Savings | Over Budget] → Items
// showActual: when true uses transaction actuals instead of planned amounts.
function BudgetSankey({ expenseSections, capex, totalNet,
  transactions, planYear, periodMos, periodLabel: pLabel, darkMode, showActual }) {

  const W = 580, H = 340, nodeW = 13, PAD = 5
  const xL  = nodeW                        // income bar right edge
  const xMl = Math.round(W * 0.37)         // mid column left
  const xMr = xMl + nodeW                  // mid column right
  const xRl = W - nodeW                    // right column left
  const [tooltip, setTooltip] = useState(null)

  const periodNet = totalNet * periodMos.length

  const actualByCat = useMemo(() => {
    if (!showActual) return {}
    const map = {}
    const moSet = new Set(periodMos)
    for (const t of transactions) {
      if (!t.categoryId || !t.date || t.type !== 'expense') continue
      const d = new Date(t.date + 'T00:00:00')
      if (d.getFullYear() !== planYear || !moSet.has(d.getMonth())) continue
      map[t.categoryId] = (map[t.categoryId] ?? 0) + Math.abs(t.amount ?? 0)
    }
    return map
  }, [transactions, planYear, periodMos, showActual])

  // ── Middle column groups ───────────────────────────────────────────────────
  const MID_GROUPS = [
    { id: 'fixed',         label: 'Fixed',        color: '#6366f1', desc: 'Non-controllable' },
    { id: 'discretionary', label: 'Discretionary', color: '#f59e0b', desc: 'Controllable' },
    { id: 'savings',       label: 'Savings',       color: '#10b981', desc: 'Wealth building' },
    { id: 'overbudget',    label: 'Over Budget',   color: '#ef4444', desc: 'Budget shortfall' },
  ]
  const GROUP_ORDER = { fixed: 0, discretionary: 1, savings: 2, overbudget: 3 }

  function classifyNode(id, label) {
    if (id === '_deficit')  return 'overbudget'
    if (id === '_surplus')  return 'savings'
    const n = label.toLowerCase()
    if (/mortgage|rent|car\b|auto|loan|insurance|tax|phone|internet|cell|cable|hydro|electric|gas\b|water|condo|strata|hoa|utility|utilities/.test(n)) return 'fixed'
    if (/rrsp|tfsa|sav|invest|pension|retire|resp|emergency|reserve|capex/.test(n)) return 'savings'
    return 'discretionary'
  }

  // ── Build right nodes ─────────────────────────────────────────────────────
  const palette = ['#f59e0b','#3b82f6','#8b5cf6','#ec4899','#f97316','#0ea5e9','#84cc16','#14b8a6','#a855f7','#6366f1','#10b981','#ef4444','#fb923c','#34d399','#818cf8']
  let colorIdx = 0
  const rightRaw = []

  for (const sec of expenseSections) {
    for (const item of sec.items) {
      const leafs = item.subItems?.length ? item.subItems : [item]
      let val = 0
      if (showActual) {
        val = leafs.reduce((s, l) => s + (actualByCat[l.id] ?? 0), 0)
      } else {
        val = leafs.reduce((s, l) =>
          s + periodMos.reduce((ss, mi) => ss + (itemMonths(l, planYear)[mi] ?? 0), 0), 0)
      }
      if (val > 0.5) {
        const group = classifyNode(item.id, item.name)
        rightRaw.push({ id: item.id, label: item.name, value: val, color: palette[colorIdx % palette.length], section: sec.name, group })
        colorIdx++
      }
    }
  }

  // CapEx
  const capexTotal = capex.flatMap(g => g.items ?? []).filter(i => i.enabled !== false)
    .reduce((s, i) => s + (i.cost ?? 0) / Math.max(1, i.intervalYears ?? 1) / 12, 0) * periodMos.length
  if (capexTotal > 0.5) rightRaw.push({ id: '_capex', label: 'Big Purchases Reserve', value: capexTotal, color: '#94a3b8', section: 'Capital Expenses', group: 'savings' })

  // Cap nodes
  const MAX_NODES = 20
  if (rightRaw.length > MAX_NODES) {
    rightRaw.sort((a, b) => b.value - a.value)
    rightRaw.splice(MAX_NODES)
  }

  const totalRight = rightRaw.reduce((s, n) => s + n.value, 0)
  const surplus = periodNet - totalRight
  if (surplus > 1)   rightRaw.push({ id: '_surplus', label: 'Surplus',  value: surplus,           color: '#10b981', section: 'Savings',          group: 'savings' })
  else if (surplus < -1) rightRaw.push({ id: '_deficit', label: 'Deficit', value: Math.abs(surplus), color: '#ef4444', section: 'Budget Shortfall', group: 'overbudget' })

  // Sort by group so mid→right flows are non-crossing
  rightRaw.sort((a, b) => (GROUP_ORDER[a.group] ?? 99) - (GROUP_ORDER[b.group] ?? 99))

  const total = Math.max(periodNet, totalRight + Math.abs(surplus))
  if (total <= 0) return <p className="text-[11px] text-center py-8 text-gray-400">Add income and expenses to see the flow</p>

  // ── Layout helper ─────────────────────────────────────────────────────────
  function layoutNodes(nodes, T, Hh, Pp) {
    const usable = Hh - Pp * Math.max(0, nodes.length - 1)
    let y = 0
    return nodes.map(n => {
      const h = Math.max(3, (n.value / T) * usable)
      const node = { ...n, y, h }
      y += h + Pp
      return node
    })
  }

  // ── Build mid nodes ───────────────────────────────────────────────────────
  const midRaw = MID_GROUPS
    .map(g => ({ ...g, value: rightRaw.filter(n => n.group === g.id).reduce((s, n) => s + n.value, 0) }))
    .filter(g => g.value > 0)

  const incomeColor = '#10b981'
  const leftH  = Math.max(3, (periodNet / total) * H)
  const mNodes = layoutNodes(midRaw, total, H, PAD)
  const rNodes = layoutNodes(rightRaw, total, H, PAD)
  const tc = darkMode ? '#9ca3af' : '#6b7280'

  // ── Income → Mid flows ────────────────────────────────────────────────────
  let lCursor = 0
  const incToMidFlows = mNodes.map(mn => {
    const lh = (mn.value / total) * leftH
    const y0t = lCursor, y0b = lCursor + lh
    const cx  = (xL + xMl) / 2
    lCursor  += lh
    return {
      id: mn.id, label: mn.label, value: mn.value, color: mn.color,
      section: mn.desc, isGroup: true,
      d: `M ${xL} ${y0t} C ${cx} ${y0t}, ${cx} ${mn.y},        ${xMl} ${mn.y}
          L ${xMl} ${mn.y + mn.h} C ${cx} ${mn.y + mn.h}, ${cx} ${y0b}, ${xL} ${y0b} Z`,
    }
  })

  // ── Mid → Right flows ─────────────────────────────────────────────────────
  const midCursors = Object.fromEntries(mNodes.map(mn => [mn.id, mn.y]))
  const midToRightFlows = rNodes.map((rn, i) => {
    const item = rightRaw[i]
    const mn   = mNodes.find(m => m.id === item.group)
    if (!mn) return null
    const mh   = (item.value / mn.value) * mn.h
    const y0t  = midCursors[item.group]
    const y0b  = y0t + mh
    midCursors[item.group] += mh
    const cx   = (xMr + xRl) / 2
    return {
      id: rn.id, label: rn.label, value: rn.value, color: rn.color,
      section: mn.label, group: item.group,
      d: `M ${xMr} ${y0t} C ${cx} ${y0t}, ${cx} ${rn.y},        ${xRl} ${rn.y}
          L ${xRl} ${rn.y + rn.h} C ${cx} ${rn.y + rn.h}, ${cx} ${y0b}, ${xMr} ${y0b} Z`,
    }
  }).filter(Boolean)

  // ── Tooltip helpers ───────────────────────────────────────────────────────
  const pctOfIncome = n => periodNet > 0 ? (n.value / periodNet * 100).toFixed(1) : '—'
  const monthly     = n => periodMos.length > 1 ? fmtFull(n.value / periodMos.length) + '/mo' : null
  const svgRect     = e => e.currentTarget.closest('svg').parentElement.getBoundingClientRect()
  const showTip     = (e, data) => {
    const r = svgRect(e)
    setTooltip({ ...data, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  const moveTip = e => {
    const r = svgRect(e)
    setTooltip(prev => prev ? { ...prev, x: e.clientX - r.left, y: e.clientY - r.top } : prev)
  }

  const activeId = tooltip?.id

  return (
    <div className="relative select-none" onMouseLeave={() => setTooltip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, overflow: 'visible' }}>

        {/* ── Income → Mid flows (background layer) ── */}
        {incToMidFlows.map((f, i) => (
          <path key={`im${i}`} d={f.d} fill={f.color}
            opacity={activeId ? (activeId === f.id ? 0.45 : 0.08) : 0.2}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => showTip(e, f)} onMouseMove={moveTip}
          />
        ))}

        {/* ── Mid → Right flows ── */}
        {midToRightFlows.map((f, i) => (
          <path key={`mr${i}`} d={f.d} fill={f.color}
            opacity={activeId ? (activeId === f.id ? 0.65 : 0.08) : 0.3}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => showTip(e, f)} onMouseMove={moveTip}
          />
        ))}

        {/* ── Income bar ── */}
        <rect x={0} y={0} width={nodeW} height={leftH} rx={3} fill={incomeColor} />
        <text x={xL + 5} y={leftH / 2} dominantBaseline="middle" fontSize={9} fill={tc} fontWeight={600}>
          {pLabel}
        </text>

        {/* ── Mid column nodes ── */}
        {mNodes.map(mn => {
          const grp = MID_GROUPS.find(g => g.id === mn.id)
          return (
            <g key={mn.id} style={{ cursor: 'pointer' }}
              onMouseEnter={e => showTip(e, { ...mn, section: grp?.desc ?? '', isGroup: true })}
              onMouseMove={moveTip}
            >
              <rect x={xMl} y={mn.y} width={nodeW} height={Math.max(3, mn.h)} rx={3} fill={mn.color}
                opacity={activeId ? (activeId === mn.id ? 1 : 0.35) : 1}
                style={{ transition: 'opacity 0.15s' }}
              />
              {/* Label above node */}
              <text x={xMl + nodeW / 2} y={mn.y - 4} textAnchor="middle" fontSize={9}
                fill={mn.color} fontWeight={700}
                opacity={activeId ? (activeId === mn.id ? 1 : 0.4) : 1}
                style={{ transition: 'opacity 0.15s' }}>
                {mn.label}
              </text>
              {/* Amount below node (only if enough space) */}
              {mn.h > 12 && (
                <text x={xMl + nodeW / 2} y={mn.y + mn.h + 9} textAnchor="middle" fontSize={7}
                  fill={tc} opacity={activeId ? (activeId === mn.id ? 0.9 : 0.2) : 0.7}>
                  {fmtFull(mn.value)}
                </text>
              )}
            </g>
          )
        })}

        {/* ── Right column nodes ── */}
        {rNodes.map(rn => {
          const flow = midToRightFlows.find(f => f.id === rn.id)
          return (
            <g key={rn.id} style={{ cursor: 'pointer' }}
              onMouseEnter={e => flow && showTip(e, flow)} onMouseMove={moveTip}
            >
              <rect x={xRl} y={rn.y} width={nodeW} height={Math.max(2, rn.h)} rx={2} fill={rn.color}
                opacity={activeId ? (activeId === rn.id ? 1 : 0.3) : 1}
                style={{ transition: 'opacity 0.15s' }}
              />
              <text x={xRl - 5} y={rn.y + rn.h / 2} textAnchor="end" dominantBaseline="middle"
                fontSize={9} fill={tc}
                opacity={activeId ? (activeId === rn.id ? 1 : 0.3) : 1}
                style={{ transition: 'opacity 0.15s' }}>
                {rn.label} · {fmtFull(rn.value)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* ── Hover Tooltip ── */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-3 py-2.5 min-w-[175px]"
          style={{
            left: tooltip.x + 14,
            top:  tooltip.y - 12,
            transform: tooltip.x > W * 0.55 ? 'translateX(calc(-100% - 28px))' : undefined,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: tooltip.color }} />
            <span className="text-[11px] font-bold text-gray-900 dark:text-gray-100 leading-tight">{tooltip.label}</span>
          </div>
          {tooltip.section && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{tooltip.section}</p>
          )}
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-[10px] text-gray-500">Period total</span>
              <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200 tabular-nums">{fmtFull(tooltip.value)}</span>
            </div>
            {monthly(tooltip) && (
              <div className="flex justify-between gap-4">
                <span className="text-[10px] text-gray-500">Monthly avg</span>
                <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{monthly(tooltip)}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-[10px] text-gray-500">% of take-home</span>
              <span className="text-[10px] font-semibold tabular-nums"
                style={{ color: tooltip.id === '_surplus' ? '#10b981' : tooltip.id === '_deficit' || tooltip.id === 'overbudget' ? '#ef4444' : '#6b7280' }}>
                {pctOfIncome(tooltip)}%
              </span>
            </div>
            <div className="mt-1.5 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(pctOfIncome(tooltip)))}%`, background: tooltip.color }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Mid-column legend ── */}
      <div className="flex items-center gap-3 justify-center mt-2 flex-wrap">
        {MID_GROUPS.filter(g => midRaw.find(m => m.id === g.id)).map(g => (
          <div key={g.id} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: g.color }} />
            <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400">{g.label}</span>
            <span className="text-[9px] text-gray-400 dark:text-gray-500">·</span>
            <span className="text-[9px] text-gray-400 dark:text-gray-500">{g.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({
  totalGross, totalNet, totalExpenses, totalCapexMo, totalOutflow, netCashflow, savingsRate,
  incomes = [], province = 'ON',
  expenseSections, capex, pieData, barData, darkMode, planYear, onPlanYearChange,
  transactions = [], debtAccounts = [],
  lifeExpectancy = 90, currentAge = 40,
  cashAccounts, investmentAccounts,
  onAddCashAccount, onRemoveCashAccount, onUpdateCashAccount,
  onAddCashSubAccount, onRemoveCashSubAccount, onUpdateCashSubAccount,
  onAddInvestmentAccount, onRemoveInvestmentAccount, onUpdateInvestmentAccount,
  onAddInvestmentSubAccount, onRemoveInvestmentSubAccount, onUpdateInvestmentSubAccount,
  retirementInputs = {},
  onOpenAccounts,
  dashDemo = false,
  onToggleDashDemo,
  otherAssets = [],
  properties = [],
}) {
  const now = new Date()
  const [selPeriod, setSelPeriod] = useState({ type: 'quarter', q: 1 })
  const [chartYear, setChartYear] = useState(() => planYear)

  // When dashDemo is on, include generated demo transactions
  const demoTxns = useMemo(() => dashDemo
    ? buildDemoTransactions({ cashAccounts, investmentAccounts, debtAccounts, expenseSections })
    : [],
    [dashDemo, cashAccounts, investmentAccounts, debtAccounts, expenseSections]
  )
  const effectiveTxns = dashDemo ? [...transactions, ...demoTxns] : transactions

  // Period helpers
  const periodMIs = p => {
    if (p.type === 'annual')  return [0,1,2,3,4,5,6,7,8,9,10,11]
    if (p.type === 'quarter') return [0,1,2].map(i => (p.q - 1) * 3 + i)
    return [p.month]
  }
  const selMIs    = periodMIs(selPeriod)
  const selMult   = selMIs.length
  const selLbl    = selPeriod.type === 'annual' ? 'Annual'
    : selPeriod.type === 'quarter' ? `Q${selPeriod.q} · ${MONTHS[(selPeriod.q-1)*3]}–${MONTHS[(selPeriod.q-1)*3+2]}`
    : MONTHS[selPeriod.month]

  // ── Core computations ──────────────────────────────────────────────────────
  const expByMonth = Array(12).fill(0).map((_, mi) =>
    expenseSections.flatMap(s => s.items).reduce((s, item) => s + (itemMonthsAgg(item, planYear)[mi] ?? 0), 0)
  )

  const periodExp = selMIs.reduce((s, mi) => s + expByMonth[mi], 0)
  const periodInc = totalNet * selMult
  const periodCf  = periodInc - periodExp - totalCapexMo * selMult
  const cashflowByMonth     = expByMonth.map(exp => totalNet - exp - totalCapexMo)
  const annualCashflow      = cashflowByMonth.reduce((s, v) => s + v, 0)
  const spendCashflowByMonth = expByMonth.map(exp => totalNet - exp)

  const accBal = a => a.subAccounts?.length > 0
    ? a.subAccounts.reduce((s, sa) => s + (sa.balance ?? 0), 0)
    : (a.balance ?? 0)

  // In demo mode, overlay realistic balances/rates so sparklines show trends
  const displayCash        = dashDemo
    ? cashAccounts.map((a, i) => ({ ...a, ...(DEMO_CASH_OVERLAYS[i] ?? DEMO_CASH_OVERLAYS.at(-1)) }))
    : cashAccounts
  const displayInvestments = dashDemo
    ? investmentAccounts.map((a, i) => ({ ...a, ...(DEMO_INV_OVERLAYS[i] ?? DEMO_INV_OVERLAYS.at(-1)) }))
    : investmentAccounts
  const displayDebt        = dashDemo
    ? debtAccounts.map((a, i) => ({ ...a, ...(DEMO_DEBT_OVERLAYS[i] ?? DEMO_DEBT_OVERLAYS.at(-1)) }))
    : debtAccounts
  const displayOtherAssets = dashDemo && otherAssets.length === 0 ? DEMO_OTHER_ASSETS : otherAssets
  const totalOtherAssets   = displayOtherAssets.reduce((s, a) => s + (a.value ?? 0), 0)

  // Real estate (from RealEstateApp)
  const reSummary            = calcRealEstateSummary(properties)
  const totalPropertyValue   = reSummary.totalPropertyValue
  const totalMortgageDebt    = reSummary.totalMortgageDebt
  const reEquity             = reSummary.totalRealEstateEquity
  const reRentalIncome       = reSummary.monthlyRentalIncome

  const reserveBal = displayCash.reduce((s, a) => {
    if (a.subAccounts?.length > 0) return s + a.subAccounts.filter(sa => sa.name === 'Reserve').reduce((ss, sa) => ss + (sa.balance ?? 0), 0)
    return s
  }, 0)
  const cashExReserve = displayCash.reduce((s, a) => {
    if (a.subAccounts?.length > 0) return s + a.subAccounts.filter(sa => sa.name !== 'Reserve').reduce((ss, sa) => ss + (sa.balance ?? 0), 0)
    return s + (a.balance ?? 0)
  }, 0)
  const totalCash        = displayCash.reduce((s, a) => s + accBal(a), 0)
  const totalInvestments = displayInvestments.reduce((s, a) => s + accBal(a), 0)
  const totalDebt        = displayDebt.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalNW          = totalCash + totalInvestments + totalOtherAssets + totalPropertyValue - totalDebt - totalMortgageDebt
  const projCash         = displayCash.reduce((s, a) => s + accBal(a) * (1 + (a.rate ?? 0) / 100), 0) + annualCashflow
  const projInvestments  = displayInvestments.reduce((s, a) => s + accBal(a) * (1 + (a.rate ?? 6) / 100), 0)
  const projNW           = projCash + projInvestments - totalDebt

  // ── 10-year net worth projection for hero chart ─────────────────────────────
  const nwChartData = useMemo(() => {
    const baseYear = now.getFullYear()
    const totalInvBal = displayInvestments.reduce((s, a) => s + accBal(a), 0)
    const weightedInvRate = totalInvBal > 0
      ? displayInvestments.reduce((s, a) => s + accBal(a) * (a.rate ?? 6), 0) / totalInvBal / 100
      : 0.06
    let runCash  = totalCash
    let runInv   = totalInvestments
    let runDebts = displayDebt.map(a => ({ rate: a.rate ?? 0, balance: a.balance ?? 0, minPayment: a.minPayment ?? 0 }))
    // Real estate: properties appreciate independently; mortgages pay down
    let runProps = properties.map(p => ({
      value: p.currentValue ?? 0,
      appreciation: (p.appreciation ?? 3) / 100,
      mortBal: p.mortgage?.enabled ? (p.mortgage?.balance ?? 0) : 0,
      mortRate: (p.mortgage?.rate ?? 0) / 100 / 12,
      mortPayment: (() => { const m = p.mortgage; if (!m?.enabled || !m.balance) return 0; const r = (m.rate ?? 0)/100/12; const n = m.amortizationMonths ?? 0; if (!n) return 0; return r === 0 ? m.balance/n : m.balance*r/(1-Math.pow(1+r,-n)) })(),
    }))
    const startRePropValue = runProps.reduce((s, p) => s + p.value, 0)
    const startReMortDebt  = runProps.reduce((s, p) => s + p.mortBal, 0)
    const rows = [{ year: 'Now', assets: totalCash + totalInvestments + totalOtherAssets + startRePropValue, liabilities: totalDebt + startReMortDebt, netWorth: totalNW }]
    let runOther = totalOtherAssets
    for (let y = 1; y <= 10; y++) {
      runCash = runCash + annualCashflow
      runInv  = runInv * (1 + weightedInvRate)
      runOther = displayOtherAssets.reduce((s, a) => s + (a.value ?? 0) * Math.pow(1 + (a.appreciation ?? 0) / 100, y), 0)
      runProps = runProps.map(p => {
        const newValue = p.value * (1 + p.appreciation)
        let bal = p.mortBal
        for (let m = 0; m < 12; m++) bal = Math.max(0, bal * (1 + p.mortRate) - p.mortPayment)
        return { ...p, value: newValue, mortBal: bal }
      })
      runDebts = runDebts.map(d => {
        let bal = d.balance
        const r = d.rate / 100 / 12
        const mp = d.minPayment
        for (let m = 0; m < 12; m++) bal = Math.max(0, bal * (1 + r) - mp)
        return { ...d, balance: bal }
      })
      const rePropValue = runProps.reduce((s, p) => s + p.value, 0)
      const reMortDebt  = runProps.reduce((s, p) => s + p.mortBal, 0)
      const assets      = Math.max(0, runCash) + runInv + runOther + rePropValue
      const liabilities = runDebts.reduce((s, d) => s + d.balance, 0) + reMortDebt
      rows.push({ year: String(baseYear + y), assets: Math.round(assets), liabilities: Math.round(liabilities), netWorth: Math.round(assets - liabilities) })
    }
    return rows
  }, [totalCash, totalInvestments, totalDebt, annualCashflow, displayCash, displayInvestments, displayDebt])

  // ── Transaction helpers for budget progress ─────────────────────────────────
  const planTxns = useMemo(() =>
    effectiveTxns.filter(t => t.date && new Date(t.date + 'T00:00:00').getFullYear() === planYear && t.categoryId),
    [effectiveTxns, planYear]
  )
  const hasTxns = planTxns.length > 0

  const actualByCat = useMemo(() => {
    const map = {}
    if (!hasTxns) return map
    for (const t of planTxns) {
      if (!map[t.categoryId]) map[t.categoryId] = Array(12).fill(0)
      map[t.categoryId][new Date(t.date + 'T00:00:00').getMonth()] += Math.abs(t.amount ?? 0)
    }
    return map
  }, [planTxns, hasTxns])

  const axisColor = darkMode ? '#6b7280' : '#9ca3af'
  const tooltipStyle = {
    background: darkMode ? '#111827' : '#fff',
    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
    borderRadius: '0.75rem',
    fontSize: 11,
    padding: '8px 12px',
  }

  const yFmt = v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v/1_000).toFixed(0)}K` : `$${Math.round(v)}`

  // ── Cashflow bar chart data ─────────────────────────────────────────────────
  const chartExpByMonth = Array(12).fill(0).map((_, mi) =>
    expenseSections.flatMap(s => s.items).reduce((s, item) => s + (itemMonthsAgg(item, chartYear)[mi] ?? 0), 0)
  )
  const cashflowChartData = MONTHS.map((m, mi) => {
    const inc = totalNet
    const exp = -(chartExpByMonth[mi] + totalCapexMo)
    return { month: m, income: inc, expense: exp, net: inc + exp }
  })

  // ── Recent transactions (last 8, non-demo, date desc) ───────────────────────
  const recentTxns = useMemo(() =>
    [...effectiveTxns]
      .filter(t => !t.isDemo && t.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8),
    [effectiveTxns]
  )

  // Helper: find category name from expenseSections by id
  const catName = id => {
    for (const sec of expenseSections) {
      for (const item of sec.items) {
        if (item.id === id) return item.name
        if (item.subItems?.length) {
          const si = item.subItems.find(s => s.id === id)
          if (si) return si.name
        }
      }
    }
    return null
  }

  return (
    <div className="space-y-5">

      {/* ── 1. ACCOUNTS + NET WORTH ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Compact Accounts Card */}
        <div className="card !p-4">
          <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Accounts</h3>
            <div className="flex items-center gap-2">
              {onOpenAccounts && (
                <button onClick={onOpenAccounts}
                  className="text-[10px] text-brand-600 dark:text-brand-400 hover:text-brand-700 border border-brand-200 dark:border-brand-800 hover:border-brand-300 rounded-lg px-2.5 py-0.5 transition-colors font-medium">
                  Manage →
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Cash & Savings */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Cash</p>
              {displayCash.length === 0 ? (
                <p className="text-[10px] text-gray-300 dark:text-gray-600 italic">None</p>
              ) : (
                <div className="space-y-1.5">
                  {displayCash.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0">{a.name || 'Account'}</span>
                      <span className="text-[10px] font-medium tabular-nums text-gray-700 dark:text-gray-300 flex-shrink-0">{fmtFull(accBal(a))}</span>
                      <AcctSparkline id={a.id} balance={accBal(a)} rate={a.rate ?? 0} monthlyAdd={annualCashflow / 12 / Math.max(1, displayCash.length)} color="#10b981" volatility={dashDemo ? 0.05 : 0} />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total</span>
                    <span className="text-[10px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtFull(totalCash)}</span>
                  </div>
                </div>
              )}
            </div>
            {/* Investments */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Investments</p>
              {displayInvestments.length === 0 ? (
                <p className="text-[10px] text-gray-300 dark:text-gray-600 italic">None</p>
              ) : (
                <div className="space-y-1.5">
                  {displayInvestments.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0">{a.name || 'Account'}</span>
                      <span className="text-[10px] font-medium tabular-nums text-gray-700 dark:text-gray-300 flex-shrink-0">{fmtFull(accBal(a))}</span>
                      <AcctSparkline id={a.id} balance={accBal(a)} rate={a.rate ?? 6} monthlyAdd={0} color="#6366f1" volatility={dashDemo ? 0.07 : 0} />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total</span>
                    <span className="text-[10px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtFull(totalInvestments)}</span>
                  </div>
                </div>
              )}
            </div>
            {/* Debt */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Debt</p>
              {displayDebt.length === 0 ? (
                <p className="text-[10px] text-gray-300 dark:text-gray-600 italic">None</p>
              ) : (
                <div className="space-y-1.5">
                  {displayDebt.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0">{a.name || 'Debt'}</span>
                      <span className="text-[10px] font-medium tabular-nums text-red-600 dark:text-red-400 flex-shrink-0">{fmtFull(a.balance ?? 0)}</span>
                      <AcctSparkline id={a.id} balance={a.balance ?? 0} rate={-(a.rate ?? 5)} monthlyAdd={-(a.minPayment ?? 0)} color="#ef4444" volatility={dashDemo ? 0.04 : 0} />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Total</span>
                    <span className="text-[10px] font-bold tabular-nums text-red-600 dark:text-red-400">{fmtFull(totalDebt)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Other Assets row */}
          {displayOtherAssets.length > 0 && (
            <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Other Assets</p>
                <span className="text-[10px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtFull(totalOtherAssets)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                {displayOtherAssets.map(a => (
                  <span key={a.id} className="text-[10px] text-gray-500 dark:text-gray-400">
                    {a.name} <span className="font-medium text-gray-700 dark:text-gray-300">{fmtFull(a.value ?? 0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Net Worth Chart Card */}
        <div className="card !p-4">
          <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Net Worth</p>
              <p className={`text-xl font-bold tabular-nums ${totalNW >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
                {totalNW < 0 ? '−' : ''}{fmtFull(Math.abs(totalNW))}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                Assets {fmtFull(totalCash + totalInvestments + totalOtherAssets)}
                {totalDebt > 0 && <span className="ml-2">Debt <span className="text-red-500">{fmtFull(totalDebt)}</span></span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {[['#10b981', 'Assets'], ['#ef4444', 'Debt'], ['#3b82f6', 'Net Worth']].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1 text-[9px] text-gray-400 dark:text-gray-500">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart data={nwChartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradNWAssets" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fontSize: 8, fill: axisColor }} axisLine={false} tickLine={false} />
              <YAxis hide domain={['dataMin - 5000', 'dataMax + 5000']} />
              <ReTooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  `$${fmtNum(Math.round(Math.abs(value)))}`,
                  { assets: 'Assets', liabilities: 'Debt', netWorth: 'Net Worth' }[name] ?? name,
                ]}
                cursor={{ stroke: axisColor, strokeDasharray: '3 3' }}
              />
              <Area type="monotone" dataKey="assets"      stroke="#10b981" strokeWidth={1.5} fill="url(#gradNWAssets)" dot={false} />
              <Area type="monotone" dataKey="liabilities" stroke="#ef4444" strokeWidth={1.5} fill="none" dot={false} />
              <Area type="monotone" dataKey="netWorth"    stroke="#3b82f6" strokeWidth={2}   fill="none" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── 2. INCOME SUMMARY + SANKEY/BUDGET ROW ── */}

      {/* Income summary bar */}
      {incomes.length > 0 && (() => {
        const enabledInc = incomes.filter(i => i.enabled !== false)
        return (
          <div className="card !py-2.5">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full flex-shrink-0">Income</span>
              {enabledInc.map(inc => {
                const calc = calcIncomeNet(inc, province)
                return (
                  <div key={inc.id} className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{inc.name || 'Income'}</span>
                    <span className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{fmtFull(calc.net)}<span className="text-[9px] text-gray-400 font-normal">/mo net</span></span>
                  </div>
                )
              })}
              {reRentalIncome > 0 && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">🏘 Rental</span>
                  <span className="text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{fmtFull(reRentalIncome)}<span className="text-[9px] text-gray-400 font-normal">/mo net</span></span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                <span className="text-[10px] text-gray-400">Gross <span className="text-gray-600 dark:text-gray-300 font-semibold tabular-nums">{fmtFull(totalGross)}</span></span>
                <span className="text-[10px] text-gray-400">Tax <span className="text-rose-500 font-semibold tabular-nums">{fmtFull(totalGross - totalNet)}</span></span>
                <span className="text-[10px] text-gray-400">Net <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{fmtFull(totalNet)}</span></span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Sankey + Budget Progress side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Sankey Card ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Cash Flow · {selLbl}</h3>
            {/* Hover dropdown period selector */}
            <div className="relative group">
              <button className="flex items-center gap-1 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none">
                {selLbl} <span className="text-gray-400">▾</span>
              </button>
              <div className="absolute right-0 top-full pt-1 z-30 hidden group-hover:block">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 min-w-[170px]">
                  {/* Annual */}
                  <button
                    onMouseDown={() => setSelPeriod({ type: 'annual' })}
                    className={`w-full text-left text-[11px] px-2 py-1 rounded-lg mb-1 font-medium transition-colors
                      ${selPeriod.type === 'annual' ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                  >Annual</button>
                  {/* Quarters */}
                  <div className="grid grid-cols-4 gap-0.5 mb-1">
                    {[1,2,3,4].map(q => (
                      <button
                        key={q}
                        onMouseDown={() => setSelPeriod({ type: 'quarter', q })}
                        className={`text-[10px] font-medium py-0.5 rounded-md transition-colors
                          ${selPeriod.type === 'quarter' && selPeriod.q === q ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                      >Q{q}</button>
                    ))}
                  </div>
                  {/* Months grid */}
                  <div className="grid grid-cols-3 gap-0.5">
                    {MONTHS.map((m, mi) => {
                      const isActive = selPeriod.type === 'month' && selPeriod.month === mi
                      const isCurrent = mi === now.getMonth() && planYear === now.getFullYear()
                      return (
                        <button
                          key={m}
                          onMouseDown={() => setSelPeriod({ type: 'month', month: mi })}
                          className={`text-[10px] font-medium py-0.5 rounded-md transition-colors relative
                            ${isActive ? 'bg-brand-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                        >
                          {m}
                          {isCurrent && !isActive && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-brand-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <BudgetSankey
            expenseSections={expenseSections}
            capex={capex}
            totalNet={totalNet}
            transactions={effectiveTxns}
            planYear={planYear}
            periodMos={selMIs}
            periodLabel={selLbl}
            darkMode={darkMode}
            showActual={hasTxns}
          />
        </div>

        {/* ── Budget Progress (right column) ── */}
        {(() => {
          const leafItems = allLeafItems(expenseSections)
          const colorMap  = {}
          leafItems.forEach((item, i) => { colorMap[item.id] = COLORS[i % COLORS.length] })
          const rows = []
          for (const sec of expenseSections) {
            const secItems = sec.items.flatMap(item => item.subItems?.length ? item.subItems : [item])
            const secRows = secItems
              .map(item => {
                const plan   = selMIs.reduce((s, mi) => s + (itemMonths(item, planYear)[mi] ?? 0), 0)
                const actual = hasTxns ? selMIs.reduce((s, mi) => s + (actualByCat[item.id]?.[mi] ?? 0), 0) : 0
                if (plan === 0 && actual === 0) return null
                return { item, sec, plan, actual }
              })
              .filter(Boolean)
            if (secRows.length > 0) rows.push({ sec, secRows })
          }
          return (
            <div className="card overflow-y-auto" style={{ maxHeight: 420 }}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  Budget · {selLbl}
                </h3>
                {!hasTxns && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                    Add transactions to track actuals
                  </p>
                )}
              </div>
              {rows.length === 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-6">
                  No budget items planned for {selLbl}
                </p>
              ) : (
                <div className="space-y-4">
                  {rows.map(({ sec, secRows }) => (
                    <div key={sec.id}>
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                        {sec.name}
                      </p>
                      <div className="space-y-2">
                        {secRows.map(({ item, plan, actual }) => {
                          const barPct  = plan > 0 ? Math.min(100, (actual / plan) * 100) : (actual > 0 ? 100 : 0)
                          const ratio   = plan > 0 ? actual / plan : 0
                          const barColor = ratio >= 1 ? '#ef4444' : ratio >= 0.8 ? '#f59e0b' : '#10b981'
                          const dot     = colorMap[item.id] ?? '#6366f1'
                          return (
                            <div key={item.id}>
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="flex items-center gap-1.5 text-[11px] text-gray-700 dark:text-gray-300 min-w-0">
                                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                                  <span className="truncate">{item.name}</span>
                                </span>
                                <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
                                  {hasTxns && actual > 0 ? (
                                    <Fragment>
                                      <span className={ratio >= 1 ? 'text-red-500 dark:text-red-400 font-medium' : ratio >= 0.8 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}>
                                        {fmtFull(actual)}
                                      </span>
                                      {' / '}
                                      <span>{fmtFull(plan)}</span>
                                    </Fragment>
                                  ) : (
                                    <span>{fmtFull(plan)}</span>
                                  )}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${barPct}%`, background: barColor }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

      </div>{/* end 2-col grid */}

      {/* ── 3. FOUR STAT TILES ── */}
      {(() => {
        const tiles = [
          {
            label: 'Net Income',
            value: fmtFull(periodInc),
            sub: selLbl,
            color: 'text-violet-600 dark:text-violet-400',
            bg: 'bg-violet-50 dark:bg-violet-900/20',
            dot: '#8b5cf6',
          },
          {
            label: `Planned · ${selLbl}`,
            value: fmtFull(periodExp),
            sub: 'spending',
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            dot: '#f59e0b',
          },
          {
            label: 'Remaining',
            value: (periodCf < 0 ? '−' : '') + fmtFull(Math.abs(periodCf)),
            sub: selLbl,
            color: periodCf >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            bg: periodCf >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20',
            dot: periodCf >= 0 ? '#10b981' : '#ef4444',
          },
          {
            label: 'Savings Rate',
            value: pct(savingsRate),
            sub: 'of net income',
            color: 'text-indigo-600 dark:text-indigo-400',
            bg: 'bg-indigo-50 dark:bg-indigo-900/20',
            dot: '#6366f1',
          },
        ]
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {tiles.map(t => (
              <div key={t.label} className={`rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex flex-col gap-1 ${t.bg}`} style={{boxShadow:'0 1px 3px 0 rgb(0 0 0/0.04),0 1px 2px -1px rgb(0 0 0/0.04)'}}>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.dot }} />
                  {t.label}
                </span>
                <p className={`text-xl font-bold tabular-nums ${t.color}`}>{t.value}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{t.sub}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── 4. CASH FLOW CHART ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Cash Flow</h3>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">Planned</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Year navigator */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setChartYear(y => y - 1)}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-[11px]"
              >‹</button>
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 w-10 text-center tabular-nums">{chartYear}</span>
              <button
                onClick={() => setChartYear(y => y + 1)}
                className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-[11px]"
              >›</button>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3">
              {[['#10b981', 'Income'], ['#ef4444', 'Expenses'], ['#6366f1', 'Net']].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                  {label === 'Net'
                    ? <span className="inline-block w-3 h-0.5 rounded" style={{ background: color }} />
                    : <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                  }
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={cashflowChartData} barSize={24} barGap={-24} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f2937' : '#f3f4f6'} />
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={v => yFmt(Math.abs(v))} width={46} />
            <ReTooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                const labels = { income: 'Income', expense: 'Expenses', net: 'Net' }
                const prefix = name === 'net' ? (value >= 0 ? '+' : '') : ''
                return [`${prefix}$${fmtNum(Math.round(Math.abs(value)))}`, labels[name] ?? name]
              }}
            />
            <ReferenceLine y={0} stroke={darkMode ? '#4b5563' : '#d1d5db'} strokeWidth={1.5} />
            <Bar dataKey="income" name="income" radius={[3, 3, 0, 0]} fill="#10b981" fillOpacity={0.85} />
            <Bar dataKey="expense" name="expense" radius={[0, 0, 3, 3]} fill="#ef4444" fillOpacity={0.85} />
            <Line dataKey="net" name="net" type="monotone" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366f1', strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── 6. RECENT TRANSACTIONS ── */}
      {recentTxns.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Recent Transactions</h3>
          </div>
          <div className="space-y-0">
            {recentTxns.map((t, i) => {
              const d     = new Date(t.date + 'T00:00:00')
              const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
              const name  = t.categoryId ? (catName(t.categoryId) ?? 'Unassigned') : 'Unassigned'
              const amt   = t.amount ?? 0
              const isPos = amt >= 0
              return (
                <div key={t.id ?? i} className={`flex items-center gap-3 py-2 text-[11px] ${i < recentTxns.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}>
                  <span className="tabular-nums text-gray-400 dark:text-gray-500 flex-shrink-0 w-9">{dateStr}</span>
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 w-24 truncate">{name}</span>
                  <span className="flex-1 min-w-0 text-gray-600 dark:text-gray-400 truncate">{t.description ?? t.memo ?? ''}</span>
                  <span className={`tabular-nums font-medium flex-shrink-0 ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {isPos ? '+' : ''}{fmtFull(amt)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3 italic">View all in the Expense Tracker tab</p>
        </div>
      )}

    </div>
  )
}

// ─── Main BudgetApp ───────────────────────────────────────────────────────────

export default function BudgetApp({ budget, onChange, darkMode, tab = 'dashboard', onTabChange, lifeExpectancy = 90, currentAge = 40, retirementInputs = {}, onOpenAccounts, demoMode = false }) {
  const { incomes, expenseSections = [], capex = [], province = 'ON', cashAccounts = [], investmentAccounts = [], goals = [], debtAccounts = [], transactions = [], otherAssets = [], properties = [], reserveAccountId = null } = budget

  const [planYear, setPlanYear] = useState(new Date().getFullYear())

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
  const reorderSections  = (fromId, toId) => upd('expenseSections', p => {
    const arr = [...p]
    const fi = arr.findIndex(s => s.id === fromId)
    const ti = arr.findIndex(s => s.id === toId)
    if (fi === -1 || ti === -1 || fi === ti) return p
    const [moved] = arr.splice(fi, 1)
    arr.splice(ti, 0, moved)
    return arr
  })
  const reorderItems     = (sid, fromId, toId) => upd('expenseSections', p => p.map(s => {
    if (s.id !== sid) return s
    const arr = [...s.items]
    const fi = arr.findIndex(i => i.id === fromId)
    const ti = arr.findIndex(i => i.id === toId)
    if (fi === -1 || ti === -1 || fi === ti) return s
    const [moved] = arr.splice(fi, 1)
    arr.splice(ti, 0, moved)
    return { ...s, items: arr }
  }))
  const addItem          = sid         => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, items: [...s.items, { id: nextId('e'), name: 'New Item', months: Array(12).fill(0), subItems: [] }] } : s))
  const removeItem       = (sid,iid)   => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s))
  const updateItem       = (sid,iid,f,v) => upd('expenseSections', p => p.map(s => s.id === sid ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, [f]: v } : i) } : s))
  const updateItemMonth  = (sid,iid,mi,val) => upd('expenseSections', p => p.map(s => s.id === sid
    ? { ...s, items: s.items.map(i => {
        if (i.id !== iid) return i
        const m = [...itemMonths(i, planYear)]; m[mi] = val
        return { ...i, monthsByYear: { ...(i.monthsByYear ?? {}), [planYear]: m } }
      })} : s))

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
          const m = [...itemMonths(si, planYear)]; m[mi] = val
          return { ...si, monthsByYear: { ...(si.monthsByYear ?? {}), [planYear]: m } }
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
  const optimizeCapexContribs = (apply = true) => upd('capex', p => p.map(g => ({
    ...g,
    items: (g.items ?? []).map(item => {
      if (!apply) {
        // Reset: remove monthlyContrib from item and all sub-items
        const { monthlyContrib: _mc, ...rest } = item
        return { ...rest, subItems: (item.subItems ?? []).map(si => { const { monthlyContrib: _smc, ...sr } = si; return sr }) }
      }
      if (item.subItems?.length > 0) {
        return { ...item, subItems: item.subItems.map(si => ({
          ...si, monthlyContrib: si.intervalYears > 0
            ? Math.round(sinkingFundPMT(si.cost, si.intervalYears, item.returnRate ?? 3) * 100) / 100 : 0
        }))}
      }
      return item.enabled !== false && item.intervalYears > 0
        ? { ...item, monthlyContrib: Math.round(sinkingFundPMT(item.cost, item.intervalYears, item.returnRate ?? 3) * 100) / 100 }
        : item
    })
  })))
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

  const reserveAccount = reserveAccountId ? cashAccounts.find(a => a.id === reserveAccountId) : null
  const reserveBal    = reserveAccount
    ? (reserveAccount.balance ?? 0) + (reserveAccount.subAccounts ?? []).reduce((s, sa) => s + (sa.balance ?? 0), 0)
    : cashAccounts.reduce((s, a) => {
        if (a.subAccounts?.length > 0) return s + a.subAccounts.filter(sa => sa.name === 'Reserve').reduce((ss, sa) => ss + (sa.balance ?? 0), 0)
        return s
      }, 0)
  const leafItems     = allLeafItems(expenseSections)
  const totalExpenses = expenseSections.flatMap(s => s.items).reduce((s, i) => s + avgMonthly(i, planYear), 0)
  const totalCapexMo  = flatCapexItems(capex).reduce((s, c) => s + capexMonthly(c), 0)
  const totalOutflow  = totalExpenses + totalCapexMo
  const netCashflow   = totalNet - totalOutflow
  const savingsRate   = totalNet > 0 ? netCashflow / totalNet : 0

  // Color map (leaf items only)
  const itemColorMap = {}
  leafItems.forEach((item, idx) => { itemColorMap[item.id] = idx % COLORS.length })

  const pieData = [
    ...leafItems.filter(e => leafAvg(e, planYear) > 0).map(e => ({ name: e.name, value: leafAvg(e, planYear), color: COLORS[itemColorMap[e.id] ?? 0] })),
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

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
        {tab === 'dashboard' && (
          <DashboardTab
            totalGross={totalGross} totalNet={totalNet} totalExpenses={totalExpenses}
            totalCapexMo={totalCapexMo} totalOutflow={totalOutflow} netCashflow={netCashflow}
            savingsRate={savingsRate} expenseSections={expenseSections} planYear={planYear}
            incomes={incomes} province={province}
            transactions={transactions} debtAccounts={debtAccounts}
            capex={capex} pieData={pieData} barData={barData} darkMode={darkMode}
            lifeExpectancy={lifeExpectancy} currentAge={currentAge}
            cashAccounts={cashAccounts} investmentAccounts={investmentAccounts}
            onAddCashAccount={addCashAccount} onRemoveCashAccount={removeCashAccount} onUpdateCashAccount={updateCashAccount}
            onAddCashSubAccount={addCashSubAccount} onRemoveCashSubAccount={removeCashSubAccount} onUpdateCashSubAccount={updateCashSubAccount}
            onAddInvestmentAccount={addInvestmentAccount} onRemoveInvestmentAccount={removeInvestmentAccount} onUpdateInvestmentAccount={updateInvestmentAccount}
            onAddInvestmentSubAccount={addInvestmentSubAccount} onRemoveInvestmentSubAccount={removeInvestmentSubAccount} onUpdateInvestmentSubAccount={updateInvestmentSubAccount}
            retirementInputs={retirementInputs}
            onOpenAccounts={onOpenAccounts}
            dashDemo={demoMode}
            otherAssets={otherAssets}
            properties={properties}
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
        {tab === 'plan' && (
          <ExpensesTab
            expenseSections={expenseSections} capex={capex} totalNet={totalNet}
            totalExpenses={totalExpenses} totalCapexMo={totalCapexMo} totalOutflow={totalOutflow}
            itemColorMap={itemColorMap} planYear={planYear} onPlanYearChange={setPlanYear}
            onAddSection={addSection} onRemoveSection={removeSection} onUpdateSection={updateSection} onReorderSections={reorderSections}
            onAddItem={addItem} onRemoveItem={removeItem} onUpdateItem={updateItem} onUpdateItemMonth={updateItemMonth} onReorderItems={reorderItems}
            onAddSubItem={addSubItem} onRemoveSubItem={removeSubItem}
            onUpdateSubItem={updateSubItem} onUpdateSubItemMonth={updateSubItemMonth}
          />
        )}
        {tab === 'capex' && (
          <CapExTab
            capex={capex}
            onAddCapexItem={addCapexItem} onRemoveCapexItem={removeCapexItem} onUpdateCapexItem={updateCapexItem}
            onAddCapexSubItem={addCapexSubItem} onRemoveCapexSubItem={removeCapexSubItem} onUpdateCapexSubItem={updateCapexSubItem}
            onOptimize={optimizeCapexContribs}
            reserveBal={reserveBal} darkMode={darkMode}
            lifeExpectancy={lifeExpectancy} currentAge={currentAge}
            cashAccounts={cashAccounts}
            reserveAccountId={reserveAccountId}
            onSetReserveAccountId={id => upd('reserveAccountId', () => id)}
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
