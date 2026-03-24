import { useState, useMemo, useRef, useEffect } from 'react'

// ─── Exported Calculation Utilities ──────────────────────────────────────────
// (imported by BudgetApp DashboardTab and AccountsApp for net worth totals)

export function calcMortgagePayment(mortgage) {
  if (!mortgage?.enabled || !mortgage.balance || mortgage.balance <= 0) return 0
  const r = (mortgage.rate ?? 0) / 100 / 12
  const n = mortgage.amortizationMonths ?? 0
  if (n <= 0) return 0
  if (r === 0) return mortgage.balance / n
  return mortgage.balance * r / (1 - Math.pow(1 + r, -n))
}

export function calcNetRentalIncome(property) {
  if (!property.isRental) return 0
  return (property.rentalIncome ?? 0) * (1 - (property.vacancyRate ?? 0) / 100)
}

export function calcMonthlyPropertyCosts(property) {
  const taxMo   = (property.propertyTax ?? 0) / 12
  const insMo   = (property.insurance ?? 0) / 12
  const maintMo = (property.maintenancePct ?? 0) / 100 * (property.currentValue ?? 0) / 12
  return taxMo + insMo + maintMo
}

export function calcRealEstateSummary(properties = []) {
  const totalPropertyValue          = properties.reduce((s, p) => s + (p.currentValue ?? 0), 0)
  const totalMortgageDebt           = properties.reduce((s, p) => s + (p.mortgage?.enabled ? (p.mortgage.balance ?? 0) : 0), 0)
  const totalRealEstateEquity       = totalPropertyValue - totalMortgageDebt
  const monthlyRentalIncome         = properties.reduce((s, p) => s + calcNetRentalIncome(p), 0)
  const totalMonthlyMortgagePayment = properties.reduce((s, p) => s + calcMortgagePayment(p.mortgage), 0)
  const totalMonthlyPropertyCosts   = properties.reduce((s, p) => s + calcMonthlyPropertyCosts(p), 0)
  return { totalPropertyValue, totalMortgageDebt, totalRealEstateEquity, monthlyRentalIncome, totalMonthlyMortgagePayment, totalMonthlyPropertyCosts }
}

// ─── City Benchmarks (Canadian Markets) ──────────────────────────────────────
const CITY_BENCHMARKS = [
  { city: 'Vancouver, BC',      appreciation: 7.5, capRate: 3.0, grossYield: 3.5 },
  { city: 'Toronto, ON',        appreciation: 7.0, capRate: 3.5, grossYield: 4.0 },
  { city: 'Victoria, BC',       appreciation: 5.5, capRate: 3.8, grossYield: 4.2 },
  { city: 'Ottawa, ON',         appreciation: 5.0, capRate: 4.2, grossYield: 4.8 },
  { city: 'Hamilton, ON',       appreciation: 5.5, capRate: 4.0, grossYield: 4.5 },
  { city: 'Kelowna, BC',        appreciation: 5.0, capRate: 4.0, grossYield: 4.5 },
  { city: 'Calgary, AB',        appreciation: 4.0, capRate: 5.0, grossYield: 5.5 },
  { city: 'Edmonton, AB',       appreciation: 3.0, capRate: 5.5, grossYield: 6.2 },
  { city: 'Montreal, QC',       appreciation: 5.0, capRate: 4.2, grossYield: 5.0 },
  { city: 'Quebec City, QC',    appreciation: 3.5, capRate: 5.0, grossYield: 5.8 },
  { city: 'Halifax, NS',        appreciation: 5.5, capRate: 4.5, grossYield: 5.2 },
  { city: 'London, ON',         appreciation: 4.5, capRate: 4.8, grossYield: 5.5 },
  { city: 'Kitchener-Waterloo', appreciation: 5.0, capRate: 4.5, grossYield: 5.0 },
  { city: 'Windsor, ON',        appreciation: 4.0, capRate: 6.0, grossYield: 6.8 },
  { city: 'Winnipeg, MB',       appreciation: 3.0, capRate: 5.5, grossYield: 6.2 },
  { city: 'Regina, SK',         appreciation: 2.0, capRate: 6.0, grossYield: 7.0 },
  { city: 'Saskatoon, SK',      appreciation: 2.5, capRate: 5.8, grossYield: 6.5 },
  { city: 'Barrie, ON',         appreciation: 5.0, capRate: 4.5, grossYield: 5.0 },
  { city: 'St. John\'s, NL',   appreciation: 2.5, capRate: 6.5, grossYield: 7.2 },
  { city: 'National Average',   appreciation: 4.5, capRate: 4.5, grossYield: 5.2 },
]

// ─── DCF / IRR Engine ─────────────────────────────────────────────────────────
function calcIRR(cashflows, guess = 0.1) {
  // Newton-Raphson IRR solver; cashflows[0] is typically negative (investment)
  let r = guess
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0, dnpv = 0
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + r, t)
      npv  += cashflows[t] / denom
      dnpv -= t * cashflows[t] / Math.pow(1 + r, t + 1)
    }
    if (Math.abs(dnpv) < 1e-12) break
    const rNew = r - npv / dnpv
    if (Math.abs(rNew - r) < 1e-8) { r = rNew; break }
    r = rNew
  }
  return isFinite(r) ? r : null
}

function runDCF(inputs) {
  const {
    currentValue = 0,
    grossYield   = 5,
    vacancyRate  = 5,
    opexRatio    = 40,
    rentGrowth   = 2,
    holdingYears = 10,
    discountRate = 8,
    termCapRate  = 4.5,
    sellingCosts = 5,
    mortgageBalance = 0,
  } = inputs

  const noi0 = currentValue * (grossYield / 100) * (1 - vacancyRate / 100) * (1 - opexRatio / 100)
  const dr   = discountRate / 100
  const rg   = rentGrowth / 100

  const rows = []
  let cumPV = 0
  const cashflows = [-currentValue] // initial outflow

  for (let yr = 1; yr <= holdingYears; yr++) {
    const noi     = noi0 * Math.pow(1 + rg, yr - 1)
    const pv      = noi / Math.pow(1 + dr, yr)
    cumPV        += pv
    cashflows.push(noi)
    rows.push({ yr, noi: Math.round(noi), pv: Math.round(pv), cumPV: Math.round(cumPV) })
  }

  const terminalNOI   = noi0 * Math.pow(1 + rg, holdingYears)
  const terminalValue = termCapRate > 0 ? terminalNOI / (termCapRate / 100) : 0
  const grossProceeds = terminalValue * (1 - sellingCosts / 100)
  const netProceeds   = Math.max(0, grossProceeds - mortgageBalance)

  const pvTerminal  = terminalValue / Math.pow(1 + dr, holdingYears)
  const npv         = cumPV + pvTerminal - currentValue

  // Append terminal to cashflows for IRR
  cashflows[holdingYears] = (cashflows[holdingYears] ?? 0) + grossProceeds
  const irr = calcIRR(cashflows)

  const impliedAppreciationPct =
    currentValue > 0 && terminalValue > 0
      ? (Math.pow(terminalValue / currentValue, 1 / holdingYears) - 1) * 100
      : 0

  return { rows, terminalValue: Math.round(terminalValue), netProceeds: Math.round(netProceeds), npv: Math.round(npv), irr, impliedAppreciationPct, pvTerminal: Math.round(pvTerminal) }
}

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_PROPERTIES = [
  {
    id: 'demo_re1', name: '42 Maple Ridge Dr', type: 'primary',
    city: 'Toronto, ON',
    purchaseDate: '2017-09-01', purchasePrice: 820000, currentValue: 1175000, appreciation: 7.0,
    propertyTax: 8400, maintenancePct: 0.9, insurance: 2200,
    isRental: false, rentalIncome: 0, vacancyRate: 5,
    appreciationBeforeDcf: null, dcfInputs: null,
    mortgage: {
      enabled: true, lender: 'RBC Royal Bank', originalAmount: 656000,
      balance: 541200, rate: 5.34, amortizationMonths: 228,
      renewalDate: '2027-09', type: 'fixed',
    },
  },
  {
    id: 'demo_re2', name: 'Lakeview Condo #804', type: 'rental',
    city: 'Hamilton, ON',
    purchaseDate: '2020-05-15', purchasePrice: 465000, currentValue: 545000, appreciation: 5.5,
    propertyTax: 4200, maintenancePct: 0.7, insurance: 1050,
    isRental: true, rentalIncome: 2450, vacancyRate: 4,
    appreciationBeforeDcf: null, dcfInputs: null,
    mortgage: {
      enabled: true, lender: 'Scotiabank', originalAmount: 372000,
      balance: 341800, rate: 5.69, amortizationMonths: 276,
      renewalDate: '2025-11', type: 'variable',
    },
  },
  {
    id: 'demo_re3', name: 'Blue Mountain Chalet', type: 'vacation',
    city: 'Barrie, ON',
    purchaseDate: '2022-02-28', purchasePrice: 680000, currentValue: 720000, appreciation: 5.0,
    propertyTax: 5600, maintenancePct: 1.2, insurance: 3100,
    isRental: true, rentalIncome: 3800, vacancyRate: 30,
    appreciationBeforeDcf: null, dcfInputs: null,
    mortgage: {
      enabled: true, lender: 'TD Canada Trust', originalAmount: 510000,
      balance: 493000, rate: 5.89, amortizationMonths: 300,
      renewalDate: '2027-02', type: 'fixed',
    },
  },
]

// ─── Primitives ───────────────────────────────────────────────────────────────

function NumInput({ value, onChange, prefix, suffix, min = 0, step = 1000, className = '' }) {
  const [local, setLocal] = useState('')
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])
  const fmt = v => (typeof v === 'number' && !isNaN(v)) ? v.toLocaleString('en-CA') : '0'
  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2.5 text-gray-400 text-xs select-none">{prefix}</span>}
      <input type="text" inputMode="numeric"
        value={focused ? local : fmt(value)}
        onFocus={() => { setFocused(true); setLocal(String(value ?? 0)) }}
        onChange={e => { setLocal(e.target.value); const n = parseFloat(e.target.value.replace(/,/g, '')); if (!isNaN(n)) { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onChange(n), 250) } }}
        onBlur={() => { clearTimeout(timerRef.current); setFocused(false); const n = parseFloat(local.replace(/,/g, '')); if (!isNaN(n)) onChange(Math.max(min, n)) }}
        className={`input-field text-xs py-1.5 ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''} ${className}`}
      />
      {suffix && <span className="absolute right-2.5 text-gray-400 text-xs select-none">{suffix}</span>}
    </div>
  )
}

function PctInput({ value, onChange, min = -20, max = 30 }) {
  const [local, setLocal] = useState('')
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)
  useEffect(() => () => clearTimeout(timerRef.current), [])
  return (
    <div className="relative flex items-center">
      <input type="text" inputMode="decimal"
        value={focused ? local : String(value ?? 0)}
        onFocus={() => { setFocused(true); setLocal(String(value ?? 0)) }}
        onChange={e => { setLocal(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onChange(Math.min(max, Math.max(min, n))), 250) } }}
        onBlur={() => { clearTimeout(timerRef.current); setFocused(false); const n = parseFloat(local); onChange(!isNaN(n) ? Math.min(max, Math.max(min, n)) : (value ?? 0)) }}
        className="input-field text-xs py-1.5 pr-7 no-spinner"
      />
      <span className="absolute right-2.5 text-gray-400 text-xs select-none">%</span>
    </div>
  )
}

// ─── Property Types ───────────────────────────────────────────────────────────
const PROPERTY_TYPES = [
  { value: 'primary',    label: 'Primary Residence', icon: '🏠' },
  { value: 'rental',     label: 'Rental Property',   icon: '🏘' },
  { value: 'vacation',   label: 'Vacation Home',     icon: '🏖' },
  { value: 'commercial', label: 'Commercial',         icon: '🏢' },
  { value: 'land',       label: 'Land / Lot',         icon: '🌿' },
]
const propIcon  = t => PROPERTY_TYPES.find(x => x.value === t)?.icon  ?? '🏠'

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = 'blue', negate = false }) {
  const bg = {
    blue:  'bg-blue-50  dark:bg-blue-900/20  border-blue-100  dark:border-blue-800/30',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30',
    red:   'bg-rose-50   dark:bg-rose-900/20   border-rose-100   dark:border-rose-800/30',
    amber: 'bg-amber-50  dark:bg-amber-900/20  border-amber-100  dark:border-amber-800/30',
  }
  const txt = {
    blue:  'text-blue-700  dark:text-blue-300',
    green: 'text-emerald-700 dark:text-emerald-300',
    red:   'text-rose-700   dark:text-rose-300',
    amber: 'text-amber-700  dark:text-amber-300',
  }
  const fmt = v => '$' + Math.abs(Math.round(v)).toLocaleString('en-CA')
  return (
    <div className={`rounded-xl border p-3.5 ${bg[color]}`}>
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${txt[color]}`}>{negate ? '−' : ''}{fmt(value)}</p>
      {sub && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Amortization Schedule Builder ───────────────────────────────────────────
function buildAmortSchedule(mortgage, propertyValue = 0, appreciation = 0) {
  const bal0  = mortgage?.balance ?? 0
  const rate  = mortgage?.rate ?? 0
  const n     = mortgage?.amortizationMonths ?? 0
  if (!bal0 || !n || !mortgage?.enabled) return []

  const r       = rate / 100 / 12
  const payment = calcMortgagePayment(mortgage)
  const baseYear = new Date().getFullYear()
  const rows = []
  let bal = bal0

  for (let yr = 1; bal > 0.5 && yr <= Math.ceil(n / 12); yr++) {
    const openBal = bal
    let annInt = 0, annPrin = 0
    for (let m = 0; m < 12 && bal > 0.01; m++) {
      const interest  = r === 0 ? 0 : bal * r
      const principal = Math.min(payment - interest, bal)
      annInt  += interest
      annPrin += principal
      bal      = Math.max(0, bal - principal)
    }
    const projVal = propertyValue * Math.pow(1 + appreciation / 100, yr)
    rows.push({
      yr, calYear: baseYear + yr,
      openBal: Math.round(openBal), closeBal: Math.round(bal),
      interest: Math.round(annInt), principal: Math.round(annPrin),
      projVal: Math.round(projVal), equity: Math.round(projVal - bal),
    })
  }
  return rows
}

// ─── Amortization Table ───────────────────────────────────────────────────────
function AmortizationTable({ mortgage, propertyValue = 0, appreciation = 0 }) {
  const [expanded, setExpanded] = useState(false)
  const rows = buildAmortSchedule(mortgage, propertyValue, appreciation)
  if (!rows.length) return null

  const totalInterest  = rows.reduce((s, r) => s + r.interest, 0)
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0)
  const totalPayments  = totalInterest + totalPrincipal
  const payoffYear     = rows.at(-1)?.calYear
  const fmtK = v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(2)}M` : `$${Math.round(v/1000)}k`
  const fmt  = v => '$' + Math.round(v).toLocaleString('en-CA')

  // Max interest for bar scaling
  const maxInt = Math.max(...rows.map(r => r.interest))

  const displayRows = expanded ? rows : rows.slice(0, 5)

  return (
    <div className="mt-3 space-y-3">
      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg px-2 py-2">
          <p className="text-[9px] text-rose-500 dark:text-rose-400 uppercase tracking-wider font-semibold">Total Interest</p>
          <p className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmtK(totalInterest)}</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2 py-2">
          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-semibold">Total Paid</p>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmtK(totalPayments)}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2 py-2">
          <p className="text-[9px] text-blue-500 dark:text-blue-400 uppercase tracking-wider font-semibold">Payoff Year</p>
          <p className="text-xs font-bold text-blue-600 dark:text-blue-300">{payoffYear}</p>
        </div>
      </div>

      {/* Interest cost ratio */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
          <span>Interest cost</span>
          <span>{Math.round(totalInterest / totalPayments * 100)}% of total payments</span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: `${totalPrincipal / totalPayments * 100}%` }} />
          <div className="h-full bg-rose-400" style={{ width: `${totalInterest / totalPayments * 100}%` }} />
        </div>
        <div className="flex justify-between text-[9px] mt-0.5">
          <span className="text-emerald-600 dark:text-emerald-400">■ Principal {fmtK(totalPrincipal)}</span>
          <span className="text-rose-500 dark:text-rose-400">■ Interest {fmtK(totalInterest)}</span>
        </div>
      </div>

      {/* Year-by-year table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
              <th className="px-2 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Year</th>
              <th className="px-2 py-2 text-right font-semibold text-gray-500 dark:text-gray-400">Balance</th>
              <th className="px-2 py-2 text-right font-semibold text-rose-500 dark:text-rose-400">Interest</th>
              <th className="px-2 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">Principal</th>
              {propertyValue > 0 && <th className="px-2 py-2 text-right font-semibold text-blue-500 dark:text-blue-400">Equity</th>}
              <th className="px-2 py-2 text-left font-semibold text-gray-400">I vs P</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {displayRows.map(row => {
              const intBarW = maxInt > 0 ? row.interest / maxInt * 100 : 0
              const prinBarW = maxInt > 0 ? row.principal / maxInt * 100 : 0
              const totalBarW = Math.max(intBarW, prinBarW)
              return (
                <tr key={row.yr} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-2 py-1.5 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {row.calYear}
                    {row.closeBal === 0 && <span className="ml-1 text-emerald-500">✓</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmt(row.closeBal)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-rose-500 dark:text-rose-400">{fmt(row.interest)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(row.principal)}</td>
                  {propertyValue > 0 && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-blue-600 dark:text-blue-400 font-medium">{fmt(row.equity)}</td>
                  )}
                  <td className="px-2 py-1.5 min-w-[60px]">
                    <div className="space-y-0.5">
                      <div className="h-1 bg-rose-200 dark:bg-rose-900/50 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-400" style={{ width: `${intBarW}%` }} />
                      </div>
                      <div className="h-1 bg-emerald-100 dark:bg-emerald-900/50 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${prinBarW}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > 5 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline py-1"
        >
          {expanded ? `Show less ▲` : `Show all ${rows.length} years ▼`}
        </button>
      )}
    </div>
  )
}

// ─── Mortgage Section ─────────────────────────────────────────────────────────
function MortgageSection({ mortgage, onUpdate, readOnly, propertyValue = 0, appreciation = 0 }) {
  const mort = mortgage ?? { enabled: false }
  const [showSchedule, setShowSchedule] = useState(false)
  const payment = calcMortgagePayment(mort)
  const paidPct = mort.originalAmount > 0 && mort.balance <= mort.originalAmount
    ? Math.round((1 - mort.balance / mort.originalAmount) * 100) : 0

  return (
    <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Mortgage</span>
        {!readOnly && (
          <button type="button" onClick={() => onUpdate('enabled', !mort.enabled)}
            className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${mort.enabled ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform mt-0.5 ${mort.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </button>
        )}
        {readOnly && mort.enabled && <span className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold">Active</span>}
      </div>

      {mort.enabled && (
        <>
          {/* Paydown bar */}
          {mort.originalAmount > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                <span>{paidPct}% paid off</span>
                <span>${(mort.balance ?? 0).toLocaleString()} remaining</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
          )}

          {!readOnly && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Lender</label>
                  <input type="text" value={mort.lender ?? ''} onChange={e => onUpdate('lender', e.target.value)}
                    className="input-field text-xs py-1 w-full" placeholder="e.g. TD Bank" />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select value={mort.type ?? 'fixed'} onChange={e => onUpdate('type', e.target.value)}
                    className="input-field text-xs py-1 w-full">
                    <option value="fixed">Fixed</option>
                    <option value="variable">Variable</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Original Amount</label>
                  <NumInput value={mort.originalAmount ?? 0} onChange={v => onUpdate('originalAmount', v)} prefix="$" step={10000} />
                </div>
                <div>
                  <label className="label">Current Balance</label>
                  <NumInput value={mort.balance ?? 0} onChange={v => onUpdate('balance', v)} prefix="$" step={5000} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Rate</label>
                  <PctInput value={mort.rate ?? 0} onChange={v => onUpdate('rate', v)} min={0} max={25} />
                </div>
                <div>
                  <label className="label">Amortization Left</label>
                  <NumInput value={mort.amortizationMonths ?? 0} onChange={v => onUpdate('amortizationMonths', v)} suffix=" mo" min={1} step={12} />
                </div>
              </div>
              <div>
                <label className="label">Renewal Date</label>
                <input type="month" value={mort.renewalDate ?? ''} onChange={e => onUpdate('renewalDate', e.target.value)}
                  className="input-field text-xs py-1 w-full" />
              </div>
            </>
          )}

          {readOnly && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              {mort.lender && <><span className="text-gray-400">Lender</span><span className="font-medium text-gray-700 dark:text-gray-300">{mort.lender}</span></>}
              <span className="text-gray-400">Rate</span><span className="font-medium text-gray-700 dark:text-gray-300">{mort.rate}% {mort.type}</span>
              {mort.renewalDate && <><span className="text-gray-400">Renews</span><span className="font-medium text-gray-700 dark:text-gray-300">{mort.renewalDate}</span></>}
            </div>
          )}

          {payment > 0 && (
            <div className="flex items-center justify-between bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">
              <span className="text-[11px] text-rose-700 dark:text-rose-300">Monthly P&amp;I</span>
              <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">${Math.round(payment).toLocaleString()}/mo</span>
            </div>
          )}

          {/* Amortization Schedule toggle */}
          {mort.balance > 0 && mort.amortizationMonths > 0 && (
            <button
              type="button"
              onClick={() => setShowSchedule(v => !v)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors py-1"
            >
              <span>📅 Amortization Schedule</span>
              <span className="text-gray-400">{showSchedule ? '▲ Hide' : '▼ Show'}</span>
            </button>
          )}

          {showSchedule && (
            <AmortizationTable
              mortgage={mort}
              propertyValue={propertyValue}
              appreciation={appreciation}
            />
          )}
        </>
      )}
    </div>
  )
}

// ─── DCF Modal ────────────────────────────────────────────────────────────────
function DCFModal({ property, onClose, onCommit }) {
  const cityBench = CITY_BENCHMARKS.find(c => c.city === property.city) ?? null

  const [inputs, setInputs] = useState(() => {
    const saved = property.dcfInputs ?? {}
    return {
      holdingYears:    saved.holdingYears    ?? 10,
      discountRate:    saved.discountRate    ?? 8,
      grossYield:      saved.grossYield      ?? (cityBench?.grossYield  ?? 5),
      vacancyRate:     saved.vacancyRate     ?? (property.vacancyRate   ?? 5),
      opexRatio:       saved.opexRatio       ?? 40,
      rentGrowth:      saved.rentGrowth      ?? 2,
      termCapRate:     saved.termCapRate     ?? (cityBench?.capRate     ?? 4.5),
      sellingCosts:    saved.sellingCosts    ?? 5,
    }
  })

  const set = (k, v) => setInputs(prev => ({ ...prev, [k]: v }))

  const results = useMemo(() => runDCF({
    ...inputs,
    currentValue:    property.currentValue ?? 0,
    mortgageBalance: property.mortgage?.enabled ? (property.mortgage?.balance ?? 0) : 0,
  }), [inputs, property.currentValue, property.mortgage])

  const { rows, terminalValue, netProceeds, npv, irr, impliedAppreciationPct } = results

  const fmt  = v => '$' + Math.abs(Math.round(v)).toLocaleString('en-CA')
  const fmtK = v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(2)}M` : `$${Math.round(v/1000)}k`
  const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
  const irrPct = irr !== null ? (irr * 100).toFixed(1) + '%' : 'N/A'

  const hasRevert = property.appreciationBeforeDcf !== null && property.appreciationBeforeDcf !== undefined

  const SliderInput = ({ label, k, min, max, step = 0.5, suffix = '%', hint }) => (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</label>
        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 tabular-nums">{inputs[k]}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={inputs[k]}
        onChange={e => set(k, parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-brand-600 cursor-pointer" />
      {hint && <p className="text-[9px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">📊 DCF Analysis — {property.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Discounted cash flow model to estimate implied annual appreciation</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Body: 2-col */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left panel — inputs */}
          <div className="w-64 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 p-4 overflow-y-auto space-y-4">

            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Holding Period</p>
              <SliderInput label="Years" k="holdingYears" min={3} max={30} step={1} suffix=" yrs" />
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Returns & Discount</p>
              <div className="space-y-3">
                <SliderInput label="Discount Rate" k="discountRate" min={3} max={20} step={0.25} hint="Your required rate of return" />
                <SliderInput label="Gross Yield" k="grossYield" min={1} max={15} step={0.25} hint="Annual gross rent ÷ property value" />
                <SliderInput label="Rent Growth /yr" k="rentGrowth" min={-2} max={8} step={0.25} />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Operating Costs</p>
              <div className="space-y-3">
                <SliderInput label="Vacancy Rate" k="vacancyRate" min={0} max={30} step={0.5} />
                <SliderInput label="OpEx Ratio" k="opexRatio" min={10} max={70} step={1} hint="Management, maintenance, taxes etc." />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Exit Assumptions</p>
              <div className="space-y-3">
                <SliderInput label="Terminal Cap Rate" k="termCapRate" min={2} max={12} step={0.25} hint="Cap rate at exit" />
                <SliderInput label="Selling Costs" k="sellingCosts" min={1} max={10} step={0.25} hint="Agent fees, legal, closing" />
              </div>
            </div>

            {cityBench && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 p-3 space-y-1">
                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">📍 {property.city}</p>
                <p className="text-[10px] text-blue-700 dark:text-blue-300">Hist. appreciation: <strong>{cityBench.appreciation}%/yr</strong></p>
                <p className="text-[10px] text-blue-700 dark:text-blue-300">Market cap rate: <strong>{cityBench.capRate}%</strong></p>
                <button onClick={() => { set('grossYield', cityBench.grossYield); set('termCapRate', cityBench.capRate) }}
                  className="mt-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Apply market benchmarks →
                </button>
              </div>
            )}
          </div>

          {/* Right panel — results + table */}
          <div className="flex-1 min-w-0 p-4 overflow-y-auto space-y-4">

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Terminal Value',  val: fmtK(terminalValue),                                             cls: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30' },
                { label: 'Net Proceeds',    val: fmtK(netProceeds),                                               cls: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30' },
                { label: 'NPV',             val: (npv >= 0 ? '+' : '−') + fmtK(Math.abs(npv)),                    cls: npv >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300', bg: npv >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/30' },
                { label: 'IRR',             val: irrPct,                                                           cls: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30' },
              ].map(({ label, val, cls, bg }) => (
                <div key={label} className={`rounded-xl border p-3 ${bg}`}>
                  <p className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-sm font-bold tabular-nums ${cls}`}>{val}</p>
                </div>
              ))}
            </div>

            {/* Implied appreciation highlight */}
            <div className="rounded-xl border-2 border-brand-500 dark:border-brand-600 bg-brand-50 dark:bg-brand-900/20 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wider">Implied Annual Appreciation</p>
                <p className="text-[10px] text-brand-500 dark:text-brand-400 mt-0.5">Based on terminal value ÷ current value over {inputs.holdingYears} years</p>
              </div>
              <p className="text-3xl font-black text-brand-600 dark:text-brand-400 tabular-nums">
                {impliedAppreciationPct >= 0 ? '+' : ''}{impliedAppreciationPct.toFixed(2)}%<span className="text-base font-semibold">/yr</span>
              </p>
            </div>

            {/* Year-by-year table */}
            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Year</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400">NOI</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400">PV of NOI</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400">Cumulative PV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {rows.map(row => (
                    <tr key={row.yr} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">{new Date().getFullYear() + row.yr}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(row.noi)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-blue-600 dark:text-blue-400">{fmt(row.pv)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmt(row.cumPV)}</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50 dark:bg-blue-900/20 font-semibold border-t-2 border-blue-200 dark:border-blue-800/50">
                    <td className="px-3 py-2 text-blue-700 dark:text-blue-300">Terminal Value</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-300">{fmt(terminalValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-300">{fmt(results.pvTerminal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-300">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex-shrink-0 gap-3">
          <div className="flex items-center gap-2">
            {hasRevert && (
              <button
                onClick={() => onCommit(property.appreciationBeforeDcf, null, true)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                ↩ Revert to {property.appreciationBeforeDcf?.toFixed(2)}%/yr
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => onCommit(impliedAppreciationPct, inputs, false)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Commit {impliedAppreciationPct >= 0 ? '+' : ''}{impliedAppreciationPct.toFixed(2)}%/yr to Property
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ property, onUpdate, onRemove, readOnly = false }) {
  const [showDetails, setShowDetails] = useState(true)
  const [showCosts,   setShowCosts]   = useState(false)
  const [showDCF,     setShowDCF]     = useState(false)

  const upd = (f, v) => !readOnly && onUpdate(f, v)
  const updMort = (f, v) => !readOnly && onUpdate('mortgage', { ...(property.mortgage ?? {}), [f]: v })

  const handleDCFCommit = (rate, dcfInputs, isRevert) => {
    if (isRevert) {
      onUpdate({
        appreciation: rate,
        appreciationBeforeDcf: null,
        dcfInputs: null,
      })
    } else {
      onUpdate({
        appreciation: parseFloat(rate.toFixed(2)),
        dcfInputs,
        appreciationBeforeDcf: property.appreciationBeforeDcf ?? (property.appreciation ?? 3.5),
      })
    }
    setShowDCF(false)
  }

  const cityBench = CITY_BENCHMARKS.find(c => c.city === property.city) ?? null

  const equity     = (property.currentValue ?? 0) - (property.mortgage?.enabled ? (property.mortgage?.balance ?? 0) : 0)
  const gain       = (property.currentValue ?? 0) - (property.purchasePrice ?? 0)
  const gainPct    = property.purchasePrice > 0 ? (gain / property.purchasePrice * 100) : 0
  const monthlyCosts = calcMonthlyPropertyCosts(property)
  const netRental  = calcNetRentalIncome(property)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700/50">
        <span className="text-2xl leading-none flex-shrink-0">{propIcon(property.type)}</span>
        <div className="flex-1 min-w-0">
          {readOnly
            ? <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{property.name}</p>
            : <input type="text" value={property.name} onChange={e => upd('name', e.target.value)}
                className="input-field text-sm font-semibold py-0.5 bg-transparent border-0 shadow-none focus:border focus:bg-white dark:focus:bg-gray-800 w-full" placeholder="Property name" />
          }
        </div>
        {readOnly
          ? <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg">{PROPERTY_TYPES.find(t => t.value === property.type)?.label}</span>
          : <select value={property.type} onChange={e => upd('type', e.target.value)}
              className="input-field text-xs py-1 w-28 flex-shrink-0">
              {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
        }
        {!readOnly && <button onClick={onRemove} className="text-gray-300 hover:text-red-500 dark:text-gray-600 transition-colors p-1 flex-shrink-0">✕</button>}
      </div>

      {/* Equity summary row */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700/50 border-b border-gray-100 dark:border-gray-700/50">
        {[
          { label: 'Value',    val: property.currentValue ?? 0,                                         cls: 'text-gray-900 dark:text-gray-100' },
          { label: 'Mortgage', val: property.mortgage?.enabled ? (property.mortgage?.balance ?? 0) : 0, cls: 'text-rose-600 dark:text-rose-400', dash: !property.mortgage?.enabled },
          { label: 'Equity',   val: equity,                                                              cls: equity >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' },
        ].map(({ label, val, cls, dash }) => (
          <div key={label} className="px-3 py-2.5 text-center">
            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`text-sm font-bold tabular-nums ${cls}`}>{dash ? '—' : `$${val.toLocaleString()}`}</p>
          </div>
        ))}
      </div>

      <div className="p-4 space-y-4">

        {/* Property Details */}
        <div>
          <button type="button" onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full text-left">
            <span className={`inline-block transition-transform ${showDetails ? 'rotate-90' : ''}`}>›</span>
            Property Details
          </button>
          {showDetails && (
            <div className="space-y-2.5">
              {readOnly ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  {property.purchaseDate && <><span className="text-gray-400">Purchased</span><span className="font-medium text-gray-700 dark:text-gray-300">{property.purchaseDate}</span></>}
                  {property.purchasePrice > 0 && <><span className="text-gray-400">Purchase Price</span><span className="font-medium text-gray-700 dark:text-gray-300">${(property.purchasePrice ?? 0).toLocaleString()}</span></>}
                  <span className="text-gray-400">Appreciation</span><span className="font-medium text-gray-700 dark:text-gray-300">{property.appreciation ?? 0}%/yr</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Purchase Date</label>
                      <input type="date" value={property.purchaseDate ?? ''} onChange={e => upd('purchaseDate', e.target.value)}
                        className="input-field text-xs py-1 w-full" />
                    </div>
                    <div>
                      <label className="label">Purchase Price</label>
                      <NumInput value={property.purchasePrice ?? 0} onChange={v => upd('purchasePrice', v)} prefix="$" step={10000} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Current Value</label>
                      <NumInput value={property.currentValue ?? 0} onChange={v => upd('currentValue', v)} prefix="$" step={5000} />
                    </div>
                    <div>
                      <label className="label">
                        Annual Appreciation
                        {property.appreciationBeforeDcf !== null && property.appreciationBeforeDcf !== undefined && (
                          <span className="ml-1 text-[9px] font-semibold text-brand-500 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1 py-0.5 rounded">DCF</span>
                        )}
                      </label>
                      <PctInput value={property.appreciation ?? 0} onChange={v => upd('appreciation', v)} />
                    </div>
                  </div>

                  {/* City / Market picker */}
                  <div>
                    <label className="label">Market / City (for DCF benchmarks)</label>
                    <select value={property.city ?? ''} onChange={e => {
                        const city = e.target.value
                        upd('city', city)
                        const bench = CITY_BENCHMARKS.find(c => c.city === city)
                        if (bench && !property.appreciation) upd('appreciation', bench.appreciation)
                      }}
                      className="input-field text-xs py-1 w-full">
                      <option value="">— Select a market —</option>
                      {CITY_BENCHMARKS.map(c => (
                        <option key={c.city} value={c.city}>{c.city} ({c.appreciation}%/yr hist.)</option>
                      ))}
                    </select>
                    {cityBench && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">Historical: <strong className="text-gray-600 dark:text-gray-300">{cityBench.appreciation}%/yr</strong></span>
                        {Math.abs((property.appreciation ?? 0) - cityBench.appreciation) > 0.05 && (
                          <button onClick={() => upd('appreciation', cityBench.appreciation)}
                            className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                            Apply {cityBench.appreciation}% →
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* DCF button */}
                  {(property.currentValue ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowDCF(true)}
                      className="w-full flex items-center justify-center gap-2 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:text-white hover:bg-brand-600 dark:hover:bg-brand-700 border border-brand-300 dark:border-brand-700 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span>📊</span>
                      <span>DCF Analysis — model implied appreciation</span>
                      {property.dcfInputs && <span className="ml-auto text-[9px] bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 px-1.5 py-0.5 rounded-full">Last run saved</span>}
                    </button>
                  )}
                </>
              )}
              {gain !== 0 && (
                <div className={`text-[10px] px-2.5 py-1.5 rounded-lg ${gain >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}>
                  {gain >= 0 ? '↑ +' : '↓ −'}${Math.abs(Math.round(gain)).toLocaleString()} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%) since purchase
                </div>
              )}
            </div>
          )}
        </div>

        {/* Costs */}
        <div>
          <button type="button" onClick={() => setShowCosts(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full text-left">
            <span className={`inline-block transition-transform ${showCosts ? 'rotate-90' : ''}`}>›</span>
            Costs &amp; Carrying
            {monthlyCosts > 0 && <span className="ml-auto font-normal normal-case text-gray-400">${Math.round(monthlyCosts).toLocaleString()}/mo</span>}
          </button>
          {showCosts && !readOnly && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Property Tax (annual)</label>
                  <NumInput value={property.propertyTax ?? 0} onChange={v => upd('propertyTax', v)} prefix="$" step={100} />
                </div>
                <div>
                  <label className="label">Insurance (annual)</label>
                  <NumInput value={property.insurance ?? 0} onChange={v => upd('insurance', v)} prefix="$" step={100} />
                </div>
              </div>
              <div>
                <label className="label">Maintenance (% of value / year)</label>
                <PctInput value={property.maintenancePct ?? 0} onChange={v => upd('maintenancePct', v)} min={0} max={5} />
              </div>
              {monthlyCosts > 0 && (
                <div className="flex justify-between text-xs bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  <span className="text-amber-700 dark:text-amber-300 font-medium">Monthly carrying costs</span>
                  <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">${Math.round(monthlyCosts).toLocaleString()}/mo</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rental Income */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rental Income</span>
            {!readOnly && (
              <button type="button" onClick={() => upd('isRental', !property.isRental)}
                className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${property.isRental ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform mt-0.5 ${property.isRental ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            )}
          </div>
          {property.isRental && (
            <div className="space-y-2">
              {!readOnly && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Gross Monthly Rent</label>
                    <NumInput value={property.rentalIncome ?? 0} onChange={v => upd('rentalIncome', v)} prefix="$" step={50} />
                  </div>
                  <div>
                    <label className="label">Vacancy Rate</label>
                    <PctInput value={property.vacancyRate ?? 0} onChange={v => upd('vacancyRate', v)} min={0} max={50} />
                  </div>
                </div>
              )}
              {netRental > 0 && (
                <div className="flex justify-between text-xs bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">Net monthly rental income</span>
                  <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">${Math.round(netRental).toLocaleString()}/mo</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mortgage */}
        <MortgageSection
          mortgage={property.mortgage ?? { enabled: false }}
          onUpdate={updMort}
          readOnly={readOnly}
          propertyValue={property.currentValue ?? 0}
          appreciation={property.appreciation ?? 0}
        />

      </div>

      {/* DCF Modal (portal-like, rendered inside card but covers screen) */}
      {showDCF && (
        <DCFModal
          property={property}
          onClose={() => setShowDCF(false)}
          onCommit={handleDCFCommit}
        />
      )}
    </div>
  )
}

// ─── Main RealEstateApp ───────────────────────────────────────────────────────
let _nextId = Date.now()
function nextId() { return `re_${_nextId++}` }

function defaultProperty() {
  return {
    id: nextId(), name: 'New Property', type: 'primary',
    purchaseDate: '', purchasePrice: 0, currentValue: 0, appreciation: 3.5,
    propertyTax: 0, maintenancePct: 1.0, insurance: 0,
    isRental: false, rentalIncome: 0, vacancyRate: 5,
    city: '', dcfInputs: null, appreciationBeforeDcf: null,
    mortgage: { enabled: false, lender: '', originalAmount: 0, balance: 0, rate: 5.25, amortizationMonths: 300, renewalDate: '', type: 'fixed' },
  }
}

export default function RealEstateApp({ budget, onChange, darkMode, demoMode = false }) {
  const properties = budget.properties ?? []
  const displayProperties = demoMode ? DEMO_PROPERTIES : properties
  const isDemo = demoMode

  const {
    totalPropertyValue, totalMortgageDebt, totalRealEstateEquity,
    monthlyRentalIncome, totalMonthlyMortgagePayment, totalMonthlyPropertyCosts,
  } = calcRealEstateSummary(displayProperties)

  const upd = updated => onChange({ ...budget, properties: updated })
  const addProperty    = () => upd([...properties, defaultProperty()])
  const removeProperty = id => upd(properties.filter(p => p.id !== id))
  // Supports both (id, field, value) and (id, patchObject) forms
  const updateProperty = (id, f, v) =>
    upd(properties.map(p => p.id === id
      ? (typeof f === 'object' && f !== null ? { ...p, ...f } : { ...p, [f]: v })
      : p
    ))

  const netMonthly = monthlyRentalIncome - totalMonthlyMortgagePayment - totalMonthlyPropertyCosts
  const ltv = totalPropertyValue > 0 ? Math.round(totalMortgageDebt / totalPropertyValue * 100) : 0

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Summary metrics */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Portfolio Summary
            {displayProperties.length > 0 && (
              <span className="ml-2 text-[11px] font-normal text-gray-400">
                {displayProperties.length} propert{displayProperties.length === 1 ? 'y' : 'ies'}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Value" value={totalPropertyValue} color="blue"
              sub={ltv > 0 ? `${100 - ltv}% equity ratio` : 'No mortgage'} />
            <MetricCard label="Mortgage Debt" value={totalMortgageDebt} color="red" negate
              sub={totalMonthlyMortgagePayment > 0 ? `$${Math.round(totalMonthlyMortgagePayment).toLocaleString()}/mo P&I` : 'No mortgage'} />
            <MetricCard label="Net Equity" value={totalRealEstateEquity} color={totalRealEstateEquity >= 0 ? 'green' : 'red'}
              sub={ltv > 0 ? `${100 - ltv}% owned, ${ltv}% mortgaged` : 'Fully owned'} />
            <MetricCard label="Net Rental Income" value={monthlyRentalIncome} color="amber"
              sub={monthlyRentalIncome > 0 ? 'after vacancy /mo' : 'No rental properties'} />
          </div>
        </div>

        {/* Demo notice */}
        {isDemo && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl text-[11px] text-amber-700 dark:text-amber-300">
            <span>🎭</span>
            <span><strong>Demo mode</strong> — showing sample properties. Add a real property to get started.</span>
          </div>
        )}

        {/* Properties grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayProperties.map(property => (
            <PropertyCard
              key={property.id}
              property={property}
              readOnly={isDemo}
              onUpdate={(f, v) => updateProperty(property.id, f, v)}  /* also accepts (patchObj) */
              onRemove={() => removeProperty(property.id)}
            />
          ))}

          {/* Add property button */}
          <button onClick={addProperty}
            className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2 p-10 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[220px]">
            <span className="text-3xl leading-none">🏠</span>
            <span className="text-sm font-medium">Add Property</span>
            <span className="text-xs opacity-70">Track value, mortgage &amp; rental income</span>
          </button>
        </div>

        {/* Monthly cash flow summary — only when rental properties exist */}
        {monthlyRentalIncome > 0 && (
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Monthly Real Estate Cash Flow</h3>
            <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100 dark:divide-gray-700">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Rental Income</p>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">${Math.round(monthlyRentalIncome).toLocaleString()}</p>
                <p className="text-[10px] text-gray-400">net of vacancy</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Costs &amp; P&amp;I</p>
                <p className="text-base font-bold text-rose-600 dark:text-rose-400">
                  ${Math.round(totalMonthlyMortgagePayment + totalMonthlyPropertyCosts).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400">all rental properties</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Net Cash Flow</p>
                <p className={`text-base font-bold ${netMonthly >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {netMonthly >= 0 ? '+' : '−'}${Math.abs(Math.round(netMonthly)).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400">after all costs</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
