import { useState } from 'react'

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

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_PROPERTIES = [
  {
    id: 'demo_re1', name: 'Primary Residence', type: 'primary',
    purchaseDate: '2018-06-15', purchasePrice: 550000, currentValue: 750000, appreciation: 3.5,
    propertyTax: 6200, maintenancePct: 1.0, insurance: 1800,
    isRental: false, rentalIncome: 0, vacancyRate: 5,
    mortgage: { enabled: true, lender: 'TD Canada Trust', originalAmount: 480000, balance: 412500, rate: 5.09, amortizationMonths: 252, renewalDate: '2027-06', type: 'fixed' },
  },
  {
    id: 'demo_re2', name: 'Rental Condo', type: 'rental',
    purchaseDate: '2021-03-01', purchasePrice: 420000, currentValue: 480000, appreciation: 3.0,
    propertyTax: 3800, maintenancePct: 0.8, insurance: 900,
    isRental: true, rentalIncome: 2200, vacancyRate: 5,
    mortgage: { enabled: true, lender: 'Scotiabank', originalAmount: 350000, balance: 322000, rate: 5.44, amortizationMonths: 288, renewalDate: '2026-03', type: 'variable' },
  },
]

// ─── Primitives ───────────────────────────────────────────────────────────────

function NumInput({ value, onChange, prefix, suffix, min = 0, step = 1000, className = '' }) {
  const [local, setLocal] = useState('')
  const [focused, setFocused] = useState(false)
  const fmt = v => (typeof v === 'number' && !isNaN(v)) ? v.toLocaleString('en-CA') : '0'
  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2.5 text-gray-400 text-xs select-none">{prefix}</span>}
      <input type="text" inputMode="numeric"
        value={focused ? local : fmt(value)}
        onFocus={() => { setFocused(true); setLocal(String(value ?? 0)) }}
        onChange={e => { setLocal(e.target.value); const n = parseFloat(e.target.value.replace(/,/g, '')); if (!isNaN(n)) onChange(n) }}
        onBlur={() => { setFocused(false); const n = parseFloat(local.replace(/,/g, '')); if (!isNaN(n)) onChange(Math.max(min, n)) }}
        className={`input-field text-xs py-1.5 ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''} ${className}`}
      />
      {suffix && <span className="absolute right-2.5 text-gray-400 text-xs select-none">{suffix}</span>}
    </div>
  )
}

function PctInput({ value, onChange, min = -20, max = 30 }) {
  const [local, setLocal] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative flex items-center">
      <input type="text" inputMode="decimal"
        value={focused ? local : String(value ?? 0)}
        onFocus={() => { setFocused(true); setLocal(String(value ?? 0)) }}
        onChange={e => { setLocal(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n))) }}
        onBlur={() => { setFocused(false); const n = parseFloat(local); onChange(!isNaN(n) ? Math.min(max, Math.max(min, n)) : (value ?? 0)) }}
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

// ─── Mortgage Section ─────────────────────────────────────────────────────────
function MortgageSection({ mortgage, onUpdate, readOnly }) {
  const mort = mortgage ?? { enabled: false }
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
        </>
      )}
    </div>
  )
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ property, onUpdate, onRemove, readOnly = false }) {
  const [showDetails, setShowDetails] = useState(true)
  const [showCosts,   setShowCosts]   = useState(false)

  const upd = (f, v) => !readOnly && onUpdate(f, v)
  const updMort = (f, v) => !readOnly && onUpdate('mortgage', { ...(property.mortgage ?? {}), [f]: v })

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
                      <label className="label">Annual Appreciation</label>
                      <PctInput value={property.appreciation ?? 0} onChange={v => upd('appreciation', v)} />
                    </div>
                  </div>
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
        <MortgageSection mortgage={property.mortgage ?? { enabled: false }} onUpdate={updMort} readOnly={readOnly} />

      </div>
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
    mortgage: { enabled: false, lender: '', originalAmount: 0, balance: 0, rate: 5.25, amortizationMonths: 300, renewalDate: '', type: 'fixed' },
  }
}

export default function RealEstateApp({ budget, onChange, darkMode, demoMode = false }) {
  const properties = budget.properties ?? []
  const displayProperties = demoMode && properties.length === 0 ? DEMO_PROPERTIES : properties
  const isDemo = demoMode && properties.length === 0

  const {
    totalPropertyValue, totalMortgageDebt, totalRealEstateEquity,
    monthlyRentalIncome, totalMonthlyMortgagePayment, totalMonthlyPropertyCosts,
  } = calcRealEstateSummary(displayProperties)

  const upd = updated => onChange({ ...budget, properties: updated })
  const addProperty    = () => upd([...properties, defaultProperty()])
  const removeProperty = id => upd(properties.filter(p => p.id !== id))
  const updateProperty = (id, f, v) => upd(properties.map(p => p.id === id ? { ...p, [f]: v } : p))

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
              onUpdate={(f, v) => updateProperty(property.id, f, v)}
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
