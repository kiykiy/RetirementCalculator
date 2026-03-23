import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PROVINCES } from '../lib/tax.js'
import { calcCPP, calcOAS, calcTfsaLimit, getMixStats, ASSET_CLASSES } from '../lib/simulate.js'
import { CppOasContent } from './CppOasOptimizer.jsx'

// ─── Shared primitives ────────────────────────────────────────────────────────

function Field({ label, id, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

function NumberInput({ id, value, onChange, min, max, step = 1, prefix, suffix, className = '' }) {
  const isPct = suffix === '%'

  function fmt(v) {
    const n = parseFloat(String(v).replace(/,/g, ''))
    if (isNaN(n)) return String(v)
    return isPct ? String(n) : Math.round(n).toLocaleString('en-CA')
  }

  const [local, setLocal] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setLocal(fmt(value)) }, [value])

  function handleFocus() {
    setFocused(true)
    const n = parseFloat(local.replace(/,/g, ''))
    setLocal(isNaN(n) ? '' : String(n))
  }
  function handleChange(e) {
    const raw = e.target.value
    setLocal(raw)
    const n = parseFloat(raw.replace(/,/g, ''))
    if (!isNaN(n)) onChange(n)
  }
  function handleBlur() {
    setFocused(false)
    const n = parseFloat(local.replace(/,/g, ''))
    if (isNaN(n)) { setLocal(fmt(value)) }
    else { const v = isPct ? n : Math.round(n); onChange(v); setLocal(fmt(v)) }
  }

  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2.5 text-gray-400 text-xs select-none">{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode={isPct ? 'decimal' : 'numeric'}
        className={`input-field text-xs py-1.5 ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''} ${className}`}
        value={local}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {suffix && <span className="absolute right-2.5 text-gray-400 text-xs select-none">{suffix}</span>}
    </div>
  )
}

// ─── Tooltip icon (portal-based) ─────────────────────────────────────────────

function TipIcon({ text }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  function handleEnter() {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.top - 4, left: Math.min(r.right + 8, window.innerWidth - 220) })
    setShow(true)
  }
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        className="text-gray-300 hover:text-brand-500 cursor-default text-xs leading-none select-none dark:text-gray-600 dark:hover:text-brand-400"
      >ⓘ</span>
      {show && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-52 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none leading-relaxed dark:bg-gray-800"
        >
          {text}
        </div>,
        document.body
      )}
    </>
  )
}

// ─── Slider field ─────────────────────────────────────────────────────────────

function SliderField({ label, value, onChange, min, max, step = 1, suffix = '', tip = '' }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
          {tip && <TipIcon text={tip} />}
        </div>
        <span className="text-xs font-semibold text-gray-900 tabular-nums dark:text-gray-200">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-gray-900 dark:accent-white cursor-pointer rounded-full"
      />
      <div className="flex justify-between text-[10px] text-gray-300 dark:text-gray-600">
        <span>{min}{suffix}</span><span>{max}{suffix}</span>
      </div>
    </div>
  )
}

// ─── Portfolio mix sliders ────────────────────────────────────────────────────

const MIX_CLASSES = [
  { key: 'canadianEquity', label: 'CA Equity',  color: '#2563eb' },
  { key: 'usEquity',       label: 'US Equity',  color: '#7c3aed' },
  { key: 'intlEquity',     label: 'Intl Equity', color: '#0891b2' },
  { key: 'fixedIncome',    label: 'Fixed Inc.',  color: '#16a34a' },
  { key: 'cash',           label: 'Cash/GIC',    color: '#d97706' },
]

export const DEFAULT_MIX = { canadianEquity: 25, usEquity: 25, intlEquity: 10, fixedIncome: 35, cash: 5 }

function PortfolioMixSliders({ mix, onUpdate }) {
  const m     = { ...DEFAULT_MIX, ...mix }
  const total = Object.values(m).reduce((s, v) => s + v, 0)
  const stats = getMixStats(m)

  return (
    <div className="space-y-1.5">
      {MIX_CLASSES.map(cls => {
        const ac = ASSET_CLASSES[cls.key]
        return (
          <div key={cls.key}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-600 dark:text-gray-400">{cls.label}</span>
                <TipIcon text={`${ac.ret}% avg return · ${ac.std}% std dev`} />
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-300">{m[cls.key]}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={m[cls.key]}
              onChange={e => onUpdate({ ...m, [cls.key]: parseInt(e.target.value) })}
              className="w-full h-1 cursor-pointer rounded-full"
              style={{ accentColor: cls.color }}
            />
          </div>
        )
      })}
      <div className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] mt-1 ${
        Math.abs(total - 100) > 1
          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
          : 'bg-gray-50 dark:bg-gray-800/60'
      }`}>
        <span className={Math.abs(total - 100) > 1 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
          {Math.abs(total - 100) > 1 ? `Total: ${total}% ≠ 100%` : `Total: ${total}%`}
        </span>
        <span className="font-semibold text-gray-700 dark:text-gray-300">
          ~{stats.ret.toFixed(1)}% · σ {stats.std.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

// ─── Account card ─────────────────────────────────────────────────────────────

const TAX_TYPES = [
  { value: 'rrif',   label: 'RRSP / RRIF (taxable on withdrawal)' },
  { value: 'tfsa',   label: 'TFSA (tax-free)' },
  { value: 'nonreg', label: 'Non-Registered (capital gains)' },
]

const BUILT_IN_IDS = ['rrif', 'tfsa', 'nonreg']

function AccountCard({ account, onUpdate, onRemove, tfsaLimit = null, tfsaIndexed = false, onTfsaIndexedChange = null, inflationRate = 2.5 }) {
  const isBuiltIn = BUILT_IN_IDS.includes(account.id)
  const isTfsa    = account.taxType === 'tfsa' && tfsaLimit !== null
  const [showTip, setShowTip] = useState(false)
  const [tipPos, setTipPos]   = useState({ top: 0, left: 0 })
  const tipRef = useRef(null)

  function handleTipEnter() {
    if (tipRef.current) {
      const r = tipRef.current.getBoundingClientRect()
      setTipPos({ top: r.top - 4, left: Math.min(r.right + 8, window.innerWidth - 252) })
    }
    setShowTip(true)
  }

  const upd = (key) => (val) => {
    if (key === 'annualContribution' && isTfsa) {
      onUpdate({ ...account, [key]: Math.min(val, tfsaLimit) })
    } else {
      onUpdate({ ...account, [key]: val })
    }
  }

  return (
    <div className="border border-gray-100 rounded-xl p-2.5 space-y-2 bg-white dark:bg-gray-800/50 dark:border-gray-800">
      <div className="flex items-center gap-1.5">
        {isBuiltIn ? (
          <p className="text-xs font-semibold text-gray-700 flex-1 dark:text-gray-300">{account.name}</p>
        ) : (
          <input
            type="text"
            value={account.name}
            onChange={e => onUpdate({ ...account, name: e.target.value })}
            placeholder="Account name"
            className="input-field text-xs font-medium flex-1 py-1"
          />
        )}
        {!isBuiltIn && (
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 transition-colors dark:text-gray-600"
            title="Remove account"
          >✕</button>
        )}
      </div>

      {!isBuiltIn && (
        <select
          value={account.taxType}
          onChange={e => onUpdate({ ...account, taxType: e.target.value })}
          className="input-field text-xs py-1"
        >
          {TAX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      )}

      <Field label="Balance" id={`${account.id}-bal`}>
        <NumberInput id={`${account.id}-bal`} value={account.balance} onChange={upd('balance')} min={0} step={1000} prefix="$" />
      </Field>

      {/* Advanced portfolio mix toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Portfolio Mix</span>
          <TipIcon text="Model this account's return using asset-class weights instead of a single rate. Enables Monte Carlo projections." />
        </div>
        <button
          type="button"
          onClick={() => onUpdate({ ...account, advancedMode: !account.advancedMode, mix: account.mix ?? { ...DEFAULT_MIX } })}
          className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors focus:outline-none ${
            account.advancedMode ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
          title={account.advancedMode ? 'Disable portfolio mix' : 'Enable portfolio mix'}
        >
          <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
            account.advancedMode ? 'translate-x-3.5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {account.advancedMode ? (
        <div className="space-y-2">
          <PortfolioMixSliders mix={account.mix ?? DEFAULT_MIX} onUpdate={mix => onUpdate({ ...account, mix })} />
          <Field label="Contribution" id={`${account.id}-contrib`}>
            <div className="space-y-0.5">
              <NumberInput id={`${account.id}-contrib`} value={account.annualContribution} onChange={upd('annualContribution')} min={0} step={500} prefix="$" />
              {isTfsa && tfsaLimit != null && (
                account.annualContribution >= tfsaLimit
                  ? <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ At limit</p>
                  : <button
                      type="button"
                      onClick={() => upd('annualContribution')(tfsaLimit)}
                      className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      → Set to max (${tfsaLimit.toLocaleString()})
                    </button>
              )}
            </div>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Return" id={`${account.id}-ret`}>
            <NumberInput id={`${account.id}-ret`} value={account.returnRate} onChange={upd('returnRate')} min={0} max={20} step={0.1} suffix="%" className="no-spinner" />
          </Field>
          <Field label="Contribution" id={`${account.id}-contrib`}>
            <div className="space-y-0.5">
              <NumberInput id={`${account.id}-contrib`} value={account.annualContribution} onChange={upd('annualContribution')} min={0} step={500} prefix="$" />
              {isTfsa && tfsaLimit != null && (
                account.annualContribution >= tfsaLimit
                  ? <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ At limit</p>
                  : <button
                      type="button"
                      onClick={() => upd('annualContribution')(tfsaLimit)}
                      className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      → Set to max (${tfsaLimit.toLocaleString()})
                    </button>
              )}
            </div>
          </Field>
        </div>
      )}

      {isTfsa && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tfsaIndexed}
                onChange={e => onTfsaIndexedChange?.(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-gray-600 dark:text-gray-400">Index limit to CPI</span>
            </label>
            <span
              ref={tipRef}
              className="text-gray-300 hover:text-brand-600 cursor-help text-sm leading-none dark:text-gray-600"
              onMouseEnter={handleTipEnter}
              onMouseLeave={() => setShowTip(false)}
            >ⓘ</span>
            {showTip && createPortal(
              <div
                style={{ position: 'fixed', top: tipPos.top, left: tipPos.left, zIndex: 9999 }}
                className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-60 text-xs pointer-events-none dark:bg-gray-800 dark:border-gray-700"
              >
                <p className="font-semibold text-gray-700 mb-1.5 dark:text-gray-200">TFSA Annual Contribution Limit</p>
                <p className="text-gray-500 dark:text-gray-400">The 2026 base limit is <span className="font-medium text-gray-700 dark:text-gray-200">$7,000</span>.</p>
                <p className="text-gray-500 mt-1.5 dark:text-gray-400">
                  When <span className="font-medium">indexed to CPI</span>, the limit grows each year at your inflation rate ({inflationRate}%), rounded to the nearest $500.
                </p>
                <p className="text-gray-400 mt-1.5 italic">
                  e.g. at {inflationRate}%: $7,000 → $7,500 in ~{Math.ceil(Math.log(7500 / 7000) / Math.log(1 + inflationRate / 100))} yrs
                </p>
                <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-gray-500 dark:border-gray-700">
                  Current limit: <span className="font-semibold text-brand-600 dark:text-brand-400">${tfsaLimit.toLocaleString()}/yr</span>
                </div>
              </div>,
              document.body
            )}
          </div>
          <p className="text-xs text-brand-600 dark:text-brand-400">
            Limit: <span className="font-medium">${tfsaLimit.toLocaleString()}/yr</span>
            {tfsaIndexed && <span className="text-gray-400 ml-1">· indexed at {inflationRate}% CPI</span>}
            {account.annualContribution > tfsaLimit && (
              <span className="text-amber-600 ml-1">(will be capped)</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Nav section items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { key: 'profile',    label: 'Profile'                          },
  { key: 'accounts',   label: 'Accounts',  cardWidth: 622       },
  { key: 'inflation',  label: 'Inflation'                        },
  { key: 'cpp',        label: 'CPP'                              },
  { key: 'oas',        label: 'OAS'                              },
  { key: 'pension',    label: 'DB Pension'                       },
  { key: 'other',      label: 'Other Income'                     },
  { key: 'retincome',  label: 'Ret. Income'                      },
  { key: 'tax',        label: 'Tax'                              },
  { key: 'estate',     label: 'Estate'                           },
  { divider: true,     label: 'Tools'                            },
  { key: 'cppoas',     label: 'CPP/OAS Timing', cardWidth: 520  },
]

// ─── Person toggle (Primary / Spouse) ─────────────────────────────────────────

function PersonToggle({ primaryName, spouseName, active, onChange }) {
  return (
    <div className="flex items-center gap-1 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800">
      {[{ id: 'primary', label: primaryName }, { id: 'spouse', label: spouseName }].map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`px-2.5 py-0.5 text-[10px] rounded-md font-medium transition-all ${
            active === p.id
              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >{p.label}</button>
      ))}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

let nextCustomId    = 1
let nextRetIncomeId = 1

export default function InputPanel({ inputs, onChange }) {
  const [active, setActive] = useState(null)
  const [sectionPerson, setSectionPerson] = useState({ accounts: 'primary', cpp: 'primary', oas: 'primary', pension: 'primary', other: 'primary', retincome: 'primary', tax: 'primary', cppoas: 'primary' })
  const set      = (key) => (val) => onChange({ ...inputs, [key]: val })
  const setSpouse = (key) => (val) => onChange({ ...inputs, spouse: { ...(inputs.spouse ?? {}), [key]: val } })
  const sp        = inputs.spouse ?? {}
  const spouseEnabled = !!sp.enabled
  const primaryName   = inputs.userName  || 'You'
  const spouseName    = inputs.spouseName || 'Spouse'
  const whoFor  = (section) => spouseEnabled ? sectionPerson[section] : 'primary'
  const setPerson = (section) => (who) => setSectionPerson(p => ({ ...p, [section]: who }))

  const currentYear          = new Date().getFullYear()
  const currentYearTfsaLimit = calcTfsaLimit(currentYear, inputs.inflation ?? 2.5, inputs.tfsaIndexedToInflation ?? false)
  const yearsToRet           = Math.max(0, (inputs.retirementAge ?? 65) - (inputs.currentAge ?? 45))
  const _dbGrowthRate        = inputs.dbSalaryGrowthRate ?? 2
  const projectedDbSalary    = (inputs.dbSalaryGrowthEnabled && _dbGrowthRate > 0)
    ? Math.round((inputs.dbBestAvgSalary ?? 0) * Math.pow(1 + _dbGrowthRate / 100, yearsToRet))
    : (inputs.dbBestAvgSalary ?? 0)
  // Spouse computed vars for pension section
  const yearsToRetSpouse      = Math.max(0, (sp.retirementAge ?? 63) - (sp.currentAge ?? 43))
  const _spDbGrowthRate       = sp.dbSalaryGrowthRate ?? _dbGrowthRate
  const projectedDbSalarySpouse = (sp.dbSalaryGrowthEnabled && _spDbGrowthRate > 0)
    ? Math.round((sp.dbBestAvgSalary ?? 0) * Math.pow(1 + _spDbGrowthRate / 100, yearsToRetSpouse))
    : (sp.dbBestAvgSalary ?? 0)

  function updateAccount(updated) {
    onChange({ ...inputs, accounts: inputs.accounts.map(a => a.id === updated.id ? updated : a) })
  }
  function removeAccount(id) {
    onChange({ ...inputs, accounts: inputs.accounts.filter(a => a.id !== id) })
  }
  function addAccount() {
    const id = `custom_${nextCustomId++}`
    onChange({
      ...inputs,
      accounts: [...inputs.accounts, { id, name: 'New Account', balance: 0, annualContribution: 0, returnRate: 6, taxType: 'nonreg', advancedMode: false, mix: { ...DEFAULT_MIX } }],
    })
  }
  // Spouse account helpers
  const spouseAccounts = sp.accounts ?? []
  function updateSpouseAccount(updated) {
    onChange({ ...inputs, spouse: { ...sp, accounts: spouseAccounts.map(a => a.id === updated.id ? updated : a) } })
  }
  function removeSpouseAccount(id) {
    onChange({ ...inputs, spouse: { ...sp, accounts: spouseAccounts.filter(a => a.id !== id) } })
  }
  function addSpouseAccount() {
    const id = `sp_${nextCustomId++}`
    onChange({
      ...inputs,
      spouse: { ...sp, accounts: [...spouseAccounts, { id, name: 'New Account', balance: 0, annualContribution: 0, returnRate: 6, taxType: 'nonreg', advancedMode: false, mix: { ...DEFAULT_MIX } }] },
    })
  }
  function addRetIncome() {
    const id = `ri_${nextRetIncomeId++}`
    onChange({
      ...inputs,
      retirementIncomes: [...(inputs.retirementIncomes ?? []), {
        id, name: 'Rental Income', amount: 12000,
        startAge: inputs.retirementAge ?? 65,
        endAge:   inputs.lifeExpectancy ?? 90,
      }],
    })
  }
  function removeRetIncome(id) {
    onChange({ ...inputs, retirementIncomes: (inputs.retirementIncomes ?? []).filter(r => r.id !== id) })
  }
  function updateRetIncome(updated) {
    onChange({ ...inputs, retirementIncomes: (inputs.retirementIncomes ?? []).map(r => r.id === updated.id ? updated : r) })
  }
  // Spouse retincome helpers
  const spouseRetIncomes = sp.retirementIncomes ?? []
  function addSpouseRetIncome() {
    const id = `sri_${nextRetIncomeId++}`
    onChange({ ...inputs, spouse: { ...sp, retirementIncomes: [...spouseRetIncomes, { id, name: 'Rental Income', amount: 12000, startAge: sp.retirementAge ?? 63, endAge: sp.lifeExpectancy ?? 88 }] } })
  }
  function removeSpouseRetIncome(id) {
    onChange({ ...inputs, spouse: { ...sp, retirementIncomes: spouseRetIncomes.filter(r => r.id !== id) } })
  }
  function updateSpouseRetIncome(updated) {
    onChange({ ...inputs, spouse: { ...sp, retirementIncomes: spouseRetIncomes.map(r => r.id === updated.id ? updated : r) } })
  }

  // ── Section content map ──────────────────────────────────────────────────────

  const sectionContent = {

    profile: (
      <div className="space-y-3">
        {/* Your name */}
        <Field label="Your Name" id="userName">
          <input id="userName" type="text" value={inputs.userName ?? ''} onChange={e => onChange({ ...inputs, userName: e.target.value })} placeholder="e.g. Alex" className="input-field" />
        </Field>

        {/* Primary ages */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{primaryName}</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Current Age" id="currentAge">
            <NumberInput id="currentAge" value={inputs.currentAge} onChange={set('currentAge')} min={18} max={80} />
          </Field>
          <Field label="Retire Age" id="retirementAge">
            <NumberInput id="retirementAge" value={inputs.retirementAge} onChange={set('retirementAge')} min={50} max={80} />
          </Field>
          <Field label="Life Expect." id="lifeExpectancy">
            <NumberInput id="lifeExpectancy" value={inputs.lifeExpectancy} onChange={set('lifeExpectancy')} min={65} max={110} />
          </Field>
        </div>
        <Field label="Province / Territory" id="province">
          <select id="province" className="input-field" value={inputs.province} onChange={e => onChange({ ...inputs, province: e.target.value })}>
            {PROVINCES.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </Field>

        {/* Spouse toggle + ages */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{spouseName}</p>
          <button
            type="button"
            onClick={() => onChange({ ...inputs, spouse: { ...sp, enabled: !sp.enabled } })}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${sp.enabled ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${sp.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {sp.enabled && (
          <div className="space-y-2 pl-2 border-l-2 border-brand-100 dark:border-brand-900">
            <Field label="Spouse Name" id="spouseName">
              <input id="spouseName" type="text" value={inputs.spouseName ?? ''} onChange={e => onChange({ ...inputs, spouseName: e.target.value })} placeholder="e.g. Jordan" className="input-field" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Current Age" id="spouseAge">
                <NumberInput id="spouseAge" value={sp.currentAge ?? 43} onChange={setSpouse('currentAge')} min={18} max={80} />
              </Field>
              <Field label="Retire Age" id="spouseRetAge">
                <NumberInput id="spouseRetAge" value={sp.retirementAge ?? 63} onChange={setSpouse('retirementAge')} min={50} max={80} />
              </Field>
              <Field label="Life Expect." id="spouseLE">
                <NumberInput id="spouseLE" value={sp.lifeExpectancy ?? 88} onChange={setSpouse('lifeExpectancy')} min={65} max={110} />
              </Field>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              CPP, OAS, pension and other income for {spouseName} can be entered in each respective section below.
            </p>
            {/* Pension income splitting toggle */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Pension Income Splitting</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Transfer up to 50% of eligible income to minimize household tax</p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...inputs, spouse: { ...sp, pensionSplittingEnabled: !(sp.pensionSplittingEnabled ?? false) } })}
                className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors ${sp.pensionSplittingEnabled ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${sp.pensionSplittingEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        )}
      </div>
    ),

    accounts: (() => {
      const accWho = whoFor('accounts')
      const isSpouseAccounts = accWho === 'spouse'
      const accList   = isSpouseAccounts ? spouseAccounts : inputs.accounts
      const accUpdate = isSpouseAccounts ? updateSpouseAccount : updateAccount
      const accRemove = isSpouseAccounts ? removeSpouseAccount : removeAccount
      const accAdd    = isSpouseAccounts ? addSpouseAccount    : addAccount
      return (
        <div className="space-y-2">
          {spouseEnabled && (
            <PersonToggle
              primaryName={primaryName}
              spouseName={spouseName}
              active={accWho}
              onChange={setPerson('accounts')}
            />
          )}
          <div className="flex flex-wrap gap-2 items-start">
            {accList.map(acc => (
              <div key={acc.id} className="w-48 flex-shrink-0">
                <AccountCard
                  account={acc}
                  onUpdate={accUpdate}
                  onRemove={() => accRemove(acc.id)}
                  tfsaLimit={acc.taxType === 'tfsa' ? currentYearTfsaLimit : null}
                  tfsaIndexed={acc.taxType === 'tfsa' ? (inputs.tfsaIndexedToInflation ?? false) : false}
                  onTfsaIndexedChange={acc.taxType === 'tfsa' ? (v) => onChange({ ...inputs, tfsaIndexedToInflation: v }) : null}
                  inflationRate={inputs.inflation ?? 2.5}
                />
              </div>
            ))}
            {accList.length === 0 && isSpouseAccounts && (
              <p className="text-[11px] text-gray-400 w-full pb-1">
                No accounts added for {spouseName} yet.
              </p>
            )}
          </div>
          <button
            onClick={accAdd}
            className="w-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 rounded-xl py-2 transition-colors dark:border-gray-700 dark:hover:border-gray-600 dark:hover:text-gray-300"
          >
            + Add Account{isSpouseAccounts ? ` for ${spouseName}` : ''}
          </button>
        </div>
      )
    })(),

    inflation: (
      <Field label="Inflation Rate" id="inflation">
        <NumberInput id="inflation" value={inputs.inflation} onChange={set('inflation')} min={0} max={10} step={0.1} suffix="%" />
      </Field>
    ),

    cpp: (() => {
      const cppWho = whoFor('cpp')
      const cppVal = cppWho === 'spouse' ? sp : inputs
      const cppSet = cppWho === 'spouse' ? setSpouse : set
      return (
        <div className="space-y-3">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={cppWho} onChange={setPerson('cpp')} />}
          <Field label="Avg. Pensionable Earnings" id="cppAvgEarnings">
            <NumberInput id="cppAvgEarnings" value={cppVal.cppAvgEarnings ?? 55000} onChange={cppSet('cppAvgEarnings')} min={0} max={200000} step={1000} prefix="$" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Years Contributed" id="cppYearsContributed">
              <NumberInput id="cppYearsContributed" value={cppVal.cppYearsContributed ?? 30} onChange={cppSet('cppYearsContributed')} min={1} max={39} />
            </Field>
            <Field label="Start Age" id="cppStartAge">
              <NumberInput id="cppStartAge" value={cppVal.cppStartAge ?? 65} onChange={cppSet('cppStartAge')} min={60} max={70} />
            </Field>
          </div>
          <div className="bg-brand-50 rounded-lg px-3 py-2 text-xs text-brand-700 flex justify-between dark:bg-brand-900/20 dark:text-brand-300">
            <span>Est. Annual CPP</span>
            <span className="font-bold">
              ${calcCPP({ avgEarnings: cppVal.cppAvgEarnings ?? 55000, yearsContributed: cppVal.cppYearsContributed ?? 30, startAge: cppVal.cppStartAge ?? 65 }).toLocaleString()}
            </span>
          </div>
          {(cppVal.cppStartAge ?? 65) !== 65 && (
            <p className="text-[11px] text-gray-400 italic">
              {(cppVal.cppStartAge ?? 65) < 65
                ? `Taking CPP early reduces benefit by ${((65 - (cppVal.cppStartAge ?? 65)) * 12 * 0.6).toFixed(1)}%`
                : `Deferring CPP increases benefit by ${(((cppVal.cppStartAge ?? 65) - 65) * 12 * 0.7).toFixed(1)}%`}
            </p>
          )}
        </div>
      )
    })(),

    oas: (() => {
      const oasWho = whoFor('oas')
      const oasVal = oasWho === 'spouse' ? sp : inputs
      const oasSet = oasWho === 'spouse' ? setSpouse : set
      return (
        <div className="space-y-3">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={oasWho} onChange={setPerson('oas')} />}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Yrs. in Canada" id="oasYearsResident">
              <NumberInput id="oasYearsResident" value={oasVal.oasYearsResident ?? 40} onChange={oasSet('oasYearsResident')} min={10} max={40} />
            </Field>
            <Field label="Start Age" id="oasStartAge">
              <NumberInput id="oasStartAge" value={oasVal.oasStartAge ?? 65} onChange={oasSet('oasStartAge')} min={65} max={70} />
            </Field>
          </div>
          <div className="bg-brand-50 rounded-lg px-3 py-2 text-xs text-brand-700 flex justify-between dark:bg-brand-900/20 dark:text-brand-300">
            <span>Est. Annual OAS</span>
            <span className="font-bold">
              ${calcOAS({ yearsResident: oasVal.oasYearsResident ?? 40, startAge: oasVal.oasStartAge ?? 65 }).toLocaleString()}
            </span>
          </div>
          {(oasVal.oasYearsResident ?? 40) < 40 && (
            <p className="text-[11px] text-gray-400 italic">
              Partial OAS: {oasVal.oasYearsResident}/40 yrs = {((oasVal.oasYearsResident ?? 40) / 40 * 100).toFixed(0)}% of full benefit
            </p>
          )}
          {(oasVal.oasStartAge ?? 65) > 65 && (
            <p className="text-[11px] text-gray-400 italic">
              Deferring OAS increases benefit by {(((oasVal.oasStartAge ?? 65) - 65) * 12 * 0.6).toFixed(1)}%
            </p>
          )}
        </div>
      )
    })(),

    pension: (() => {
      const penWho = whoFor('pension')
      const penVal = penWho === 'spouse' ? sp : inputs
      const penSet = penWho === 'spouse' ? setSpouse : set
      const penChange = penWho === 'spouse'
        ? (patch) => onChange({ ...inputs, spouse: { ...sp, ...patch } })
        : (patch) => onChange({ ...inputs, ...patch })
      const ytr    = penWho === 'spouse' ? yearsToRetSpouse : yearsToRet
      const projSal = penWho === 'spouse' ? projectedDbSalarySpouse : projectedDbSalary
      const growRate = penWho === 'spouse' ? _spDbGrowthRate : _dbGrowthRate
      return (
        <div className="space-y-3">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={penWho} onChange={setPerson('pension')} />}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={penVal.dbEnabled ?? false}
              onChange={e => penChange({ dbEnabled: e.target.checked })}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">I have a defined benefit pension</span>
          </label>
          {penVal.dbEnabled && (
            <>
              <Field label="Best Average Salary (current)" id="dbBestAvgSalary">
                <NumberInput id="dbBestAvgSalary" value={penVal.dbBestAvgSalary ?? 70000} onChange={penSet('dbBestAvgSalary')} min={0} max={500000} step={1000} prefix="$" />
              </Field>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={penVal.dbSalaryGrowthEnabled ?? false}
                  onChange={e => penChange({ dbSalaryGrowthEnabled: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-gray-600 dark:text-gray-400">Adjust for salary growth</span>
              </label>
              {penVal.dbSalaryGrowthEnabled && (
                <Field label="Annual Salary Growth" id="dbSalaryGrowthRate">
                  <NumberInput id="dbSalaryGrowthRate" value={penVal.dbSalaryGrowthRate ?? 2} onChange={penSet('dbSalaryGrowthRate')} min={0} max={20} step={0.1} suffix="%" />
                </Field>
              )}
              {penVal.dbSalaryGrowthEnabled && ytr > 0 && (
                <p className="text-xs text-brand-600 bg-brand-50 rounded-lg px-2 py-1.5 dark:text-brand-300 dark:bg-brand-900/20">
                  Projected salary: <span className="font-semibold">${projSal.toLocaleString()}</span>
                  <span className="text-gray-400 ml-1">({ytr} yrs @ {growRate}%)</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Years of Service" id="dbYearsService">
                  <NumberInput id="dbYearsService" value={penVal.dbYearsService ?? 20} onChange={penSet('dbYearsService')} min={1} max={50} />
                </Field>
                <Field label="Accrual Rate" id="dbAccrualRate">
                  <NumberInput id="dbAccrualRate" value={penVal.dbAccrualRate ?? 1.5} onChange={penSet('dbAccrualRate')} min={0.5} max={3} step={0.1} suffix="%" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start Age" id="dbStartAge">
                  <NumberInput id="dbStartAge" value={penVal.dbStartAge ?? 65} onChange={penSet('dbStartAge')} min={50} max={75} />
                </Field>
                <Field label="Annual Indexing" id="dbIndexingRate">
                  <NumberInput id="dbIndexingRate" value={penVal.dbIndexingRate ?? 0} onChange={penSet('dbIndexingRate')} min={0} max={5} step={0.1} suffix="%" />
                </Field>
              </div>
              <div className="bg-brand-50 rounded-lg px-3 py-2 text-xs text-brand-700 flex justify-between dark:bg-brand-900/20 dark:text-brand-300">
                <span>Est. Annual DB Pension</span>
                <span className="font-bold">
                  ${Math.round(projSal * ((penVal.dbAccrualRate ?? 1.5) / 100) * (penVal.dbYearsService ?? 20)).toLocaleString()}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 italic">
                {penVal.dbYearsService ?? 20} yrs × {penVal.dbAccrualRate ?? 1.5}% × ${projSal.toLocaleString()}
                {(penVal.dbIndexingRate ?? 0) > 0 ? `, indexed ${penVal.dbIndexingRate}%/yr` : ', not indexed'}
              </p>
            </>
          )}
        </div>
      )
    })(),

    other: (() => {
      const othWho = whoFor('other')
      const othVal = othWho === 'spouse' ? sp : inputs
      const othSet = othWho === 'spouse' ? setSpouse : set
      return (
        <div className="space-y-3">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={othWho} onChange={setPerson('other')} />}
          <Field label="Other Pension / Annuity" id="otherPension">
            <NumberInput id="otherPension" value={othVal.otherPension ?? 0} onChange={othSet('otherPension')} min={0} step={100} prefix="$" />
          </Field>
          <p className="text-[11px] text-gray-400">Annual amount from any fixed pension, annuity, or other guaranteed income not covered above.</p>
        </div>
      )
    })(),

    retincome: (() => {
      const riWho      = whoFor('retincome')
      const isSpouseRi = riWho === 'spouse'
      const riList     = isSpouseRi ? spouseRetIncomes : (inputs.retirementIncomes ?? [])
      const riAdd      = isSpouseRi ? addSpouseRetIncome    : addRetIncome
      const riRemove   = isSpouseRi ? removeSpouseRetIncome : removeRetIncome
      const riUpdate   = isSpouseRi ? updateSpouseRetIncome : updateRetIncome
      const riRetAge   = isSpouseRi ? (sp.retirementAge ?? 63) : (inputs.retirementAge ?? 55)
      return (
        <div className="space-y-2">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={riWho} onChange={setPerson('retincome')} />}
          <p className="text-[11px] text-gray-400">Taxable income streams active during retirement (rental, part-time, etc.).</p>
          {riList.map(ri => (
            <div key={ri.id} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-white dark:bg-gray-800/50 dark:border-gray-800">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={ri.name}
                  onChange={e => riUpdate({ ...ri, name: e.target.value })}
                  placeholder="Income name"
                  className="input-field text-xs font-medium flex-1 py-1"
                />
                <button
                  onClick={() => riRemove(ri.id)}
                  className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 transition-colors dark:text-gray-600"
                >✕</button>
              </div>
              <Field label="Annual Amount" id={`${ri.id}-amt`}>
                <NumberInput id={`${ri.id}-amt`} value={ri.amount} onChange={v => riUpdate({ ...ri, amount: v })} min={0} step={500} prefix="$" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start Age" id={`${ri.id}-start`}>
                  <NumberInput id={`${ri.id}-start`} value={ri.startAge} onChange={v => riUpdate({ ...ri, startAge: v })} min={riRetAge} max={110} />
                </Field>
                <Field label="End Age" id={`${ri.id}-end`}>
                  <NumberInput id={`${ri.id}-end`} value={ri.endAge} onChange={v => riUpdate({ ...ri, endAge: v })} min={ri.startAge} max={110} />
                </Field>
              </div>
            </div>
          ))}
          <button
            onClick={riAdd}
            className="w-full text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 hover:border-gray-300 rounded-xl py-2 transition-colors dark:border-gray-700 dark:hover:border-gray-600 dark:hover:text-gray-300"
          >
            + Add Income Source
          </button>
        </div>
      )
    })(),

    tax: (() => {
      const taxWho = whoFor('tax')
      const taxVal = taxWho === 'spouse' ? sp : inputs
      const taxSet = taxWho === 'spouse' ? setSpouse : set
      return (
        <div className="space-y-4">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={taxWho} onChange={setPerson('tax')} />}
          <SliderField
            label="Marginal Rate (working)"
            value={taxVal.workingMarginalRate ?? 40}
            onChange={taxSet('workingMarginalRate')}
            min={0} max={60} step={1} suffix="%"
            tip="Your combined federal + provincial marginal tax rate while working. Applied as a tax drag on non-registered investment income during the accumulation phase."
          />
          <SliderField
            label="Non-Reg: Ordinary Income %"
            value={taxVal.nonRegOrdinaryPct ?? 0}
            onChange={taxSet('nonRegOrdinaryPct')}
            min={0} max={100} step={5} suffix="%"
            tip="Split of non-registered returns between ordinary income (interest, rent) and capital gains. 0% = all capital gains. 100% = all ordinary income."
          />
          <div className="flex justify-between text-[11px] text-gray-400">
            <span>Capital Gains: {100 - (taxVal.nonRegOrdinaryPct ?? 0)}%</span>
            <span>Ordinary: {taxVal.nonRegOrdinaryPct ?? 0}%</span>
          </div>
        </div>
      )
    })(),

    estate: (
      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={inputs.estateGoalEnabled ?? false}
            onChange={e => set('estateGoalEnabled')(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs text-gray-700 dark:text-gray-300">Set an estate goal</span>
        </label>
        {(inputs.estateGoalEnabled) && (
          <Field label="Estate Goal" id="estateGoal">
            <NumberInput
              id="estateGoal"
              value={inputs.estateGoal ?? 0}
              onChange={set('estateGoal')}
              min={0}
              step={10000}
              prefix="$"
            />
          </Field>
        )}
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Target amount to leave to heirs after tax. Shown as a progress bar on the Estate tab.
        </p>
        <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={inputs.spousalRollover ?? false}
              onChange={e => set('spousalRollover')(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">Spousal Rollover</span>
          </label>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
            RRIF/RRSP transfers to spouse tax-free at death. Defers RRIF tax — affects estate and "Net Estate to Heirs".
          </p>
        </div>
      </div>
    ),

    cppoas: (() => {
      const cpWho = whoFor('cppoas')
      const cpInputs = cpWho === 'spouse'
        ? {
            cppAvgEarnings:      sp.cppAvgEarnings      ?? 45000,
            cppYearsContributed: sp.cppYearsContributed ?? 35,
            cppStartAge:         sp.cppStartAge         ?? 65,
            oasYearsResident:    sp.oasYearsResident    ?? 40,
            oasStartAge:         sp.oasStartAge         ?? 65,
            lifeExpectancy:      inputs.lifeExpectancy  ?? 90,
          }
        : inputs
      const cpApply = ({ cppStartAge, oasStartAge }) => {
        if (cpWho === 'spouse') {
          onChange({ ...inputs, spouse: { ...sp, cppStartAge, oasStartAge } })
        } else {
          onChange({ ...inputs, cppStartAge, oasStartAge })
        }
      }
      return (
        <div className="space-y-3">
          {spouseEnabled && <PersonToggle primaryName={primaryName} spouseName={spouseName} active={cpWho} onChange={setPerson('cppoas')} />}
          <CppOasContent inputs={cpInputs} onApply={cpApply} />
        </div>
      )
    })(),

  }

  const [cardPos, setCardPos] = useState({ top: 64, left: 152, maxH: 'calc(100vh - 80px)' })

  function handleNavClick(key, btnEl) {
    if (active === key) { setActive(null); return }
    if (btnEl) {
      const r        = btnEl.getBoundingClientRect()
      const MARGIN   = 16
      const top      = Math.max(MARGIN, Math.min(r.top, window.innerHeight - 440))
      const maxH     = window.innerHeight - top - MARGIN
      setCardPos({ top, left: r.right + 8, maxH })
    }
    setActive(key)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Nav column ─────────────────────────────────────────────────────────── */}
      <nav className="w-36 flex-shrink-0 flex flex-col border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 h-full">
        <div className="flex-1 overflow-y-auto py-1 sidebar-scroll">
          {NAV_ITEMS.map((item, i) => item.divider ? (
            <div key={`divider-${i}`} className="px-4 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-300 dark:text-gray-600 select-none">{item.label}</span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              </div>
            </div>
          ) : (
            <button
              key={item.key}
              onClick={e => handleNavClick(item.key, e.currentTarget)}
              className={`w-full text-left px-4 py-2.5 text-xs font-medium flex items-center justify-between transition-colors duration-150
                ${active === item.key
                  ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                }`}
            >
              <span>{item.label}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-3 h-3 flex-shrink-0 transition-all duration-150 ${active === item.key ? 'opacity-100' : 'opacity-0'}`}
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Floating card (portal) ──────────────────────────────────────────────── */}
      {active && createPortal(
        <div
          className="overlay-panel"
          style={{
            position:  'fixed',
            top:       cardPos.top,
            left:      cardPos.left,
            width:     NAV_ITEMS.find(i => i.key === active)?.cardWidth ?? 280,
            maxHeight: cardPos.maxH,
            zIndex:    40,
          }}
        >
          <div className="card !p-3 shadow-xl flex flex-col" style={{ maxHeight: cardPos.maxH, overflow: 'hidden' }}>
            {/* Card header */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              {active !== 'cppoas' && (
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {NAV_ITEMS.find(i => i.key === active)?.label}
                </p>
              )}
              {active === 'cppoas' && <span />}
              <div className="flex items-center gap-1">
                {active === 'accounts' && (
                  <button
                    onClick={addAccount}
                    className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors text-sm font-medium leading-none"
                    title="Add account"
                  >+</button>
                )}
                <button
                  onClick={() => setActive(null)}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                  title="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Card content */}
            <div className="overflow-y-auto sidebar-scroll space-y-2">
              {sectionContent[active]}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
