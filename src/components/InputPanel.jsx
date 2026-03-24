import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PROVINCES } from '../lib/tax.js'
import { calcCPP, calcOAS, calcTfsaLimit, getMixStats, ASSET_CLASSES } from '../lib/simulate.js'
import { CppOasContent } from './CppOasOptimizer.jsx'
import RrifMeltdownOptimizer from './RrifMeltdownOptimizer.jsx'
import { runSimulation } from '../lib/simulate.js'
import { calcTax } from '../lib/tax.js'
import { formatWhileEditing, parseFormatted, handleArrowKeys, flashCommit } from '../lib/inputHelpers.js'

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
  const showSteppers = !isPct && !prefix && min !== undefined && max !== undefined && (max - min) <= 80 && step >= 1

  function fmt(v) {
    const n = parseFloat(String(v).replace(/,/g, ''))
    if (isNaN(n)) return String(v)
    return isPct ? String(n) : Math.round(n).toLocaleString('en-CA')
  }

  const [local, setLocal] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  const timerRef = useRef(null)
  const inputRef = useRef(null)
  const prevValue = useRef(value)
  useEffect(() => { if (!focused) setLocal(fmt(value)) }, [value])
  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleFocus() {
    setFocused(true)
    prevValue.current = value
    // Keep commas while editing for currency fields
    setLocal(isPct ? String(value ?? 0) : fmt(value))
  }
  function handleChange(e) {
    const raw = e.target.value
    const formatted = isPct ? raw : formatWhileEditing(raw)
    setLocal(formatted)
    const n = parseFormatted(formatted)
    if (!isNaN(n)) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(n), 250)
    }
  }
  function handleBlur() {
    clearTimeout(timerRef.current)
    setFocused(false)
    const n = parseFormatted(local)
    if (isNaN(n)) { setLocal(fmt(value)) }
    else {
      const v = isPct ? n : Math.round(n)
      onChange(v)
      setLocal(fmt(v))
      if (v !== prevValue.current) flashCommit(inputRef.current)
    }
  }
  function onKeyDown(e) {
    handleArrowKeys(e, { value: parseFormatted(local) || value, step, min, max, onChange: v => { onChange(v); setLocal(fmt(v)) } })
  }
  function stepBy(delta) {
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, (value ?? 0) + delta))
    onChange(next)
  }

  return (
    <div className="relative flex items-center">
      {showSteppers && (
        <button type="button" tabIndex={-1} onClick={() => stepBy(-step)}
          className="absolute left-0.5 z-10 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-sm font-medium select-none"
          aria-label="Decrease">−</button>
      )}
      {prefix && !showSteppers && <span className="absolute left-2.5 text-gray-400 text-xs select-none">{prefix}</span>}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={isPct ? 'decimal' : 'numeric'}
        className={`input-field text-xs py-1.5 ${showSteppers ? 'px-6 text-center tabular-nums' : prefix ? 'pl-6' : ''} ${suffix && !showSteppers ? 'pr-8' : ''} ${className}`}
        value={local}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
      />
      {suffix && !showSteppers && <span className="absolute right-2.5 text-gray-400 text-xs select-none">{suffix}</span>}
      {showSteppers && (
        <button type="button" tabIndex={-1} onClick={() => stepBy(step)}
          className="absolute right-0.5 z-10 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-sm font-medium select-none"
          aria-label="Increase">+</button>
      )}
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
        className="w-full accent-gray-900 dark:accent-white cursor-pointer"
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
  { key: 'accounts',   label: 'Accounts',  cardWidth: 240       },
  { key: 'inflation',  label: 'Inflation'                        },
  { key: 'cpp',        label: 'CPP'                              },
  { key: 'oas',        label: 'OAS'                              },
  { key: 'pension',    label: 'Workplace Pension'                 },
  { key: 'other',      label: 'Other Income'                     },
  { key: 'retincome',  label: 'Ret. Income'                      },
  { key: 'tax',        label: 'Tax'                              },
  { key: 'estate',     label: 'Estate'                           },
  { divider: true,     label: 'Tools'                            },
  { key: 'cppoas',     label: 'CPP/OAS Timing', cardWidth: 520  },
  { key: 'meltdown',   label: 'RRSP Tax Optimizer', cardWidth: 480 },
  { key: 'gis',        label: 'Low-Income Benefits', cardWidth: 340 },
  { key: 'sensitivity',label: 'Sensitivity',     cardWidth: 420  },
  { key: 'survivor',   label: 'Survivor',        cardWidth: 400  },
  { key: 'helocTool',  label: 'Home Equity',     cardWidth: 520  },
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

export default function InputPanel({ inputs, onChange, onOpenAccounts, reProperties = [], simRows = [] }) {
  const [active, setActive] = useState(null)
  const [sectionPerson, setSectionPerson] = useState({ accounts: 'primary', cpp: 'primary', oas: 'primary', pension: 'primary', other: 'primary', retincome: 'primary', tax: 'primary', cppoas: 'primary', meltdown: 'primary' })
  // HELOC tool local state
  const [helocRate,     setHelocRate]     = useState(7.2)
  const [helocLimitPct, setHelocLimitPct] = useState(65)
  const [helocDrawType, setHelocDrawType] = useState('auto') // 'auto' | 'fixed'
  const [helocFixedDraw,setHelocFixedDraw]= useState(20000)
  const [helocStartAge, setHelocStartAge] = useState(inputs.retirementAge ?? 65)
  const [helocType,     setHelocType]     = useState('heloc') // 'heloc' | 'reverse'
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
      if (onOpenAccounts) {
        // Summary view with link to Accounts app
        const allAccounts = [
          ...(inputs.accounts ?? []),
          ...(inputs.spouse?.accounts ?? []),
        ]
        const totalBal = allAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
        const fmt = v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toLocaleString('en-CA')}`
        return (
          <div className="space-y-1.5">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {allAccounts.length} account{allAccounts.length !== 1 ? 's' : ''}
              {totalBal > 0 && <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">· {fmt(totalBal)}</span>}
            </span>
            {allAccounts.length > 0 && (
              <div className="space-y-0.5">
                {allAccounts.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{a.name || a.taxType}</span>
                    <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 ml-2 tabular-nums">{fmt(a.balance ?? 0)}</span>
                  </div>
                ))}
                {allAccounts.length > 5 && (
                  <p className="text-[10px] text-gray-400">+{allAccounts.length - 5} more…</p>
                )}
              </div>
            )}
            <button
              onClick={onOpenAccounts}
              className="w-full text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 border border-brand-200 dark:border-brand-800 hover:border-brand-300 rounded-lg py-1 transition-colors font-medium mt-0.5"
            >
              → Open Accounts Module
            </button>
          </div>
        )
      }

      // Inline editor (fallback when no onOpenAccounts)
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
          <Field label="Annual Salary" id="annualSalary">
            <NumberInput
              id="annualSalary"
              value={inputs.annualSalary ?? 0}
              onChange={set('annualSalary')}
              min={0} step={1000} prefix="$"
            />
          </Field>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-2">
            Used to calculate your savings rate % on the Accumulation chart.
          </p>
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

    // ── RRSP Meltdown Optimizer ──────────────────────────────────────────────
    meltdown: (
      <RrifMeltdownOptimizer
        inputs={inputs}
        rrspDrawdown={inputs.rrspDrawdown}
        onApply={(data) => onChange({ ...inputs, ...data })}
      />
    ),

    // ── GIS Eligibility Check ────────────────────────────────────────────────
    gis: (() => {
      const retAge = inputs.retirementAge ?? 65
      const cAge   = inputs.currentAge ?? 45
      const lifeE  = inputs.lifeExpectancy ?? 90
      const prov   = inputs.province ?? 'ON'
      // Estimate retirement income
      const cppAnn = calcCPP({ avgEarnings: inputs.cppAvgEarnings ?? 0, yearsContributed: inputs.cppYearsContributed ?? 0, startAge: inputs.cppStartAge ?? 65, currentAge: cAge })
      const oasAnn = calcOAS({ yearsResident: inputs.oasYearsResident ?? 40, startAge: inputs.oasStartAge ?? 65, currentAge: cAge })
      const dbAnn  = inputs.dbEnabled ? Math.round((inputs.dbBestAvgSalary ?? 0) * (inputs.dbYearsService ?? 0) * (inputs.dbAccrualRate ?? 1.5) / 100) : 0
      const otherAnn = inputs.otherPension ?? 0
      // RRIF income estimate (4% of projected balance)
      const rrifBal = (inputs.accounts ?? []).filter(a => a.taxType === 'rrif').reduce((s, a) => s + (a.balance ?? 0), 0)
      const yearsToRet = Math.max(0, retAge - cAge)
      const rrifReturn = (inputs.accounts ?? []).find(a => a.taxType === 'rrif')?.returnRate ?? 6
      const projRrif = rrifBal * Math.pow(1 + rrifReturn / 100, yearsToRet)
      const rrifInc = Math.round(projRrif * 0.04)
      const totalIncome = cppAnn + oasAnn + dbAnn + otherAnn + rrifInc

      // GIS thresholds 2025 (single) — max ~$11,679/yr, income threshold ~$21,624
      const GIS_MAX = 11679
      const GIS_THRESHOLD = 21624
      const GIS_REDUCTION = 0.50 // $1 reduction per $2 of income
      const eligibleIncome = totalIncome - oasAnn // GIS uses income excluding OAS
      const gisAmount = Math.max(0, Math.round(GIS_MAX - eligibleIncome * GIS_REDUCTION))
      const qualifies = eligibleIncome < GIS_THRESHOLD && gisAmount > 0

      const fmtD = n => `$${Math.round(n).toLocaleString()}`

      return (
        <div className="space-y-3 text-xs">
          <p className="text-gray-500 dark:text-gray-400">
            Checks if your projected retirement income qualifies for the Guaranteed Income Supplement (65+, single rates).
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between"><span className="text-gray-500">CPP</span><span className="font-semibold tabular-nums">{fmtD(cppAnn)}/yr</span></div>
            <div className="flex justify-between"><span className="text-gray-500">OAS</span><span className="font-semibold tabular-nums">{fmtD(oasAnn)}/yr</span></div>
            {dbAnn > 0 && <div className="flex justify-between"><span className="text-gray-500">DB Pension</span><span className="font-semibold tabular-nums">{fmtD(dbAnn)}/yr</span></div>}
            {otherAnn > 0 && <div className="flex justify-between"><span className="text-gray-500">Other Pension</span><span className="font-semibold tabular-nums">{fmtD(otherAnn)}/yr</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Est. RRIF draw (4%)</span><span className="font-semibold tabular-nums">{fmtD(rrifInc)}/yr</span></div>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-1.5 flex justify-between">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Total Income</span>
              <span className="font-bold tabular-nums">{fmtD(totalIncome)}/yr</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">GIS-eligible income</span>
              <span className="font-semibold tabular-nums">{fmtD(eligibleIncome)}/yr</span>
            </div>
          </div>

          <div className={`rounded-xl p-3 ${qualifies ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700'}`}>
            {qualifies ? (
              <>
                <p className="font-bold text-emerald-700 dark:text-emerald-400 mb-1">✓ May qualify for GIS</p>
                <p className="text-emerald-600 dark:text-emerald-400">Estimated: <span className="font-bold">{fmtD(gisAmount)}/yr</span> ({fmtD(gisAmount / 12)}/mo)</p>
                <p className="text-[10px] text-emerald-500 dark:text-emerald-500 mt-1">⚠ RRSP withdrawals reduce GIS. Consider TFSA instead.</p>
              </>
            ) : (
              <>
                <p className="font-bold text-gray-600 dark:text-gray-300 mb-1">Not GIS eligible</p>
                <p className="text-gray-500 dark:text-gray-400">Income of {fmtD(eligibleIncome)} exceeds the ~{fmtD(GIS_THRESHOLD)} threshold.</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">This is positive — your retirement income is well above the minimum.</p>
              </>
            )}
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            Based on 2025 single rates. Couples have different thresholds. GIS amounts are approximate.
          </p>
        </div>
      )
    })(),

    // ── Sensitivity Analysis ─────────────────────────────────────────────────
    sensitivity: (() => {
      const baseReturn = (inputs.accounts ?? []).reduce((s, a) => s + (a.balance ?? 0) * (a.returnRate ?? 6), 0) / Math.max(1, (inputs.accounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0))
      const baseInflation = inputs.inflation ?? 2.5
      const baseLife = inputs.lifeExpectancy ?? 90

      // Run 5 scenarios: base, low return, high inflation, longer life, worst case
      const scenarios = [
        { label: 'Base Case',       returnDelta: 0,    inflDelta: 0,    lifeDelta: 0  },
        { label: 'Low Returns (−2%)', returnDelta: -2,  inflDelta: 0,    lifeDelta: 0  },
        { label: 'High Inflation (+2%)', returnDelta: 0, inflDelta: 2,   lifeDelta: 0  },
        { label: 'Live to 95',      returnDelta: 0,    inflDelta: 0,    lifeDelta: 5  },
        { label: 'Stress Test',     returnDelta: -2,   inflDelta: 1.5,  lifeDelta: 5  },
      ]

      const results = scenarios.map(s => {
        try {
          const adjAccounts = (inputs.accounts ?? []).map(a => ({
            ...a,
            returnRate: Math.max(0, (a.returnRate ?? 6) + s.returnDelta),
          }))
          const sim = runSimulation({
            ...inputs,
            accounts: adjAccounts,
            inflation: baseInflation + s.inflDelta,
            lifeExpectancy: baseLife + s.lifeDelta,
            scenarioShock: null,
          })
          return {
            label: s.label,
            finalBalance: sim.summary.finalBalance,
            exhaustedAge: sim.summary.portfolioExhaustedAge,
            totalNet: sim.summary.totalNetIncome,
            yearsInRet: sim.summary.yearsInRetirement,
          }
        } catch {
          return { label: s.label, finalBalance: 0, exhaustedAge: null, totalNet: 0, yearsInRet: 0 }
        }
      })

      const baseFinal = results[0]?.finalBalance ?? 0
      const fmtD = n => {
        if (n == null || isNaN(n)) return '—'
        const a = Math.abs(n)
        if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
        if (a >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
        return `$${Math.round(n)}`
      }

      return (
        <div className="space-y-3 text-xs">
          <p className="text-gray-500 dark:text-gray-400">
            How sensitive is your plan to changes in returns, inflation, and longevity?
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-1.5 font-semibold text-gray-500 dark:text-gray-400">Scenario</th>
                <th className="text-right py-1.5 font-semibold text-gray-500 dark:text-gray-400">Final Bal.</th>
                <th className="text-right py-1.5 font-semibold text-gray-500 dark:text-gray-400">Δ</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const delta = r.finalBalance - baseFinal
                const pct = baseFinal > 0 ? (delta / baseFinal * 100) : 0
                return (
                  <tr key={r.label} className={i < results.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}>
                    <td className={`py-1.5 ${i === 0 ? 'font-semibold text-gray-800 dark:text-gray-200' : 'text-gray-600 dark:text-gray-300'}`}>{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{fmtD(r.finalBalance)}</td>
                    <td className={`py-1.5 text-right tabular-nums font-semibold ${i === 0 ? 'text-gray-400' : delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {i === 0 ? '—' : `${delta >= 0 ? '+' : ''}${pct.toFixed(0)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {results.some(r => r.exhaustedAge) && (
            <div className="rounded-xl p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="font-bold text-red-600 dark:text-red-400 mb-1">⚠ Portfolio Exhaustion Risk</p>
              {results.filter(r => r.exhaustedAge).map(r => (
                <p key={r.label} className="text-red-500 dark:text-red-400">{r.label}: runs out at age {r.exhaustedAge}</p>
              ))}
            </div>
          )}

          {!results.some(r => r.exhaustedAge) && (
            <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <p className="font-bold text-emerald-700 dark:text-emerald-400">✓ Plan survives all scenarios</p>
              <p className="text-emerald-600 dark:text-emerald-400 text-[10px] mt-0.5">Portfolio lasts through all stress tests including live-to-95 with low returns.</p>
            </div>
          )}
        </div>
      )
    })(),

    // ── Survivor Scenario (Second Death) ─────────────────────────────────────
    survivor: (() => {
      if (!spouseEnabled) {
        return (
          <div className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
            <p className="mb-2">Enable spouse in the Profile section to use this tool.</p>
            <p className="text-[10px] text-gray-400">This models the tax impact when the surviving spouse inherits the full RRIF and has stacked income.</p>
          </div>
        )
      }

      const primAge = inputs.currentAge ?? 45
      const spAge   = sp.currentAge ?? 43
      const primLife = inputs.lifeExpectancy ?? 90
      const spLife   = sp.lifeExpectancy ?? 88
      const prov = inputs.province ?? 'ON'

      // Estimate RRIF balance at first death (primary dies at lifeExpectancy)
      const rrifBal = (inputs.accounts ?? []).filter(a => a.taxType === 'rrif').reduce((s, a) => s + (a.balance ?? 0), 0)
      const spRrifBal = (sp.accounts ?? []).filter(a => a.taxType === 'rrif').reduce((s, a) => s + (a.balance ?? 0), 0)
      const rrifReturn = (inputs.accounts ?? []).find(a => a.taxType === 'rrif')?.returnRate ?? 6
      const r = rrifReturn / 100
      const yearsToRetP = Math.max(0, (inputs.retirementAge ?? 65) - primAge)

      // Project primary RRIF to retirement, then draw down 4%/yr through retirement
      let projP = rrifBal * Math.pow(1 + r, yearsToRetP)
      for (let y = 0; y < primLife - (inputs.retirementAge ?? 65); y++) {
        projP = projP * (1 + r) - projP * 0.04
      }
      projP = Math.max(0, Math.round(projP))

      // Project spouse RRIF similarly
      const yearsToRetS = Math.max(0, (sp.retirementAge ?? 63) - spAge)
      let projS = spRrifBal * Math.pow(1 + r, yearsToRetS)
      for (let y = 0; y < (sp.lifeExpectancy ?? 88) - (sp.retirementAge ?? 63); y++) {
        projS = projS * (1 + r) - projS * 0.04
      }
      projS = Math.max(0, Math.round(projS))

      // Scenario A: Primary dies first → spouse inherits
      const combinedRrifA = projP + projS
      const spCpp = calcCPP({ avgEarnings: sp.cppAvgEarnings ?? 45000, yearsContributed: sp.cppYearsContributed ?? 30, startAge: sp.cppStartAge ?? 65, currentAge: spAge })
      const spOas = calcOAS({ yearsResident: sp.oasYearsResident ?? 40, startAge: sp.oasStartAge ?? 65, currentAge: spAge })
      const survivorDrawA = Math.round(combinedRrifA * 0.05) // forced higher RRIF min
      const taxA = calcTax({ rrif: survivorDrawA, cpp: spCpp, oas: spOas, province: prov })

      // Scenario B: Spouse dies first → primary inherits
      const primCpp = calcCPP({ avgEarnings: inputs.cppAvgEarnings ?? 0, yearsContributed: inputs.cppYearsContributed ?? 0, startAge: inputs.cppStartAge ?? 65, currentAge: primAge })
      const primOas = calcOAS({ yearsResident: inputs.oasYearsResident ?? 40, startAge: inputs.oasStartAge ?? 65, currentAge: primAge })
      const combinedRrifB = projP + projS
      const survivorDrawB = Math.round(combinedRrifB * 0.05)
      const taxB = calcTax({ rrif: survivorDrawB, cpp: primCpp, oas: primOas, province: prov })

      const fmtD = n => `$${Math.round(n).toLocaleString()}`

      return (
        <div className="space-y-3 text-xs">
          <p className="text-gray-500 dark:text-gray-400">
            When one spouse dies, the RRIF rolls tax-free — but the survivor now has double the forced withdrawals stacked on their own income.
          </p>

          {/* Scenario A: Primary dies first */}
          <div className="rounded-xl p-3 border border-gray-200 dark:border-gray-700 space-y-1.5">
            <p className="font-semibold text-gray-700 dark:text-gray-300">{inputs.userName || 'Primary'} dies first (age {primLife})</p>
            <div className="flex justify-between"><span className="text-gray-500">Inherited RRIF</span><span className="font-semibold tabular-nums">{fmtD(projP)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{sp.name || inputs.spouseName || 'Spouse'}'s own RRIF</span><span className="font-semibold tabular-nums">{fmtD(projS)}</span></div>
            <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1"><span className="font-semibold">Combined RRIF</span><span className="font-bold tabular-nums">{fmtD(combinedRrifA)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Est. annual draw (5%)</span><span className="tabular-nums">{fmtD(survivorDrawA)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax on draw + CPP + OAS</span><span className="tabular-nums text-red-500">{fmtD(taxA.total)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Effective rate</span><span className="tabular-nums text-red-500">{(taxA.effectiveRate * 100).toFixed(1)}%</span></div>
            {taxA.oasClawback > 0 && <div className="flex justify-between"><span className="text-amber-600 dark:text-amber-400">⚠ OAS clawback</span><span className="tabular-nums text-amber-600">{fmtD(taxA.oasClawback)}</span></div>}
          </div>

          {/* Scenario B: Spouse dies first */}
          <div className="rounded-xl p-3 border border-gray-200 dark:border-gray-700 space-y-1.5">
            <p className="font-semibold text-gray-700 dark:text-gray-300">{sp.name || inputs.spouseName || 'Spouse'} dies first (age {spLife})</p>
            <div className="flex justify-between"><span className="text-gray-500">Inherited RRIF</span><span className="font-semibold tabular-nums">{fmtD(projS)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">{inputs.userName || 'Primary'}'s own RRIF</span><span className="font-semibold tabular-nums">{fmtD(projP)}</span></div>
            <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1"><span className="font-semibold">Combined RRIF</span><span className="font-bold tabular-nums">{fmtD(combinedRrifB)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Est. annual draw (5%)</span><span className="tabular-nums">{fmtD(survivorDrawB)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax on draw + CPP + OAS</span><span className="tabular-nums text-red-500">{fmtD(taxB.total)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Effective rate</span><span className="tabular-nums text-red-500">{(taxB.effectiveRate * 100).toFixed(1)}%</span></div>
            {taxB.oasClawback > 0 && <div className="flex justify-between"><span className="text-amber-600 dark:text-amber-400">⚠ OAS clawback</span><span className="tabular-nums text-amber-600">{fmtD(taxB.oasClawback)}</span></div>}
          </div>

          <div className="rounded-xl p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Planning Insight</p>
            <p className="text-blue-600 dark:text-blue-400">RRSP meltdown before death can reduce the survivor's tax bracket. Consider the RRSP Meltdown tool to optimize pre-death draws.</p>
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            Simplified estimate — assumes 4% draw during retirement, 5% survivor draw. Actual RRIF minimums vary by age.
          </p>
        </div>
      )
    })(),

    // ── Home Equity / HELOC Tool ─────────────────────────────────────────────
    helocTool: (() => {
      const retAge  = inputs.retirementAge  ?? 65
      const lifeExp = inputs.lifeExpectancy ?? 90
      const retYears = lifeExp - retAge

      // Property equity snapshot
      const propEquity = reProperties.map(p => {
        const yearsToRet = Math.max(0, retAge - (inputs.currentAge ?? 45))
        const projVal    = (p.currentValue ?? 0) * Math.pow(1 + (p.appreciation ?? 3) / 100, yearsToRet)
        const mort       = p.mortgage?.enabled ? p.mortgage : null
        let   mortBal    = mort ? (mort.balance ?? 0) : 0
        if (mort && mort.amortizationMonths > 0) {
          const r   = (mort.rate ?? 0) / 100 / 12
          const pmt = r === 0 ? mortBal / mort.amortizationMonths : mortBal * r / (1 - Math.pow(1 + r, -mort.amortizationMonths))
          for (let m = 0; m < yearsToRet * 12 && mortBal > 0.01; m++) mortBal = Math.max(0, mortBal - (pmt - mortBal * r))
        }
        const equity = Math.max(0, projVal - mortBal)
        const creditLimit = helocType === 'reverse'
          ? Math.round(projVal * 0.55)
          : Math.round(equity * (helocLimitPct / 100))
        return { name: p.name || 'Property', projVal: Math.round(projVal), mortBal: Math.round(mortBal), equity: Math.round(equity), creditLimit }
      })
      const totalEquity      = propEquity.reduce((s, p) => s + p.equity,      0)
      const totalCreditLimit = propEquity.reduce((s, p) => s + p.creditLimit,  0)

      // Identify retirement shortfall years from sim rows
      const shortfallRows = simRows.filter(r => r.portfolioTotal <= 0 && r.age >= retAge)
      const firstShortfall = shortfallRows[0]?.age ?? null

      // Model HELOC drawdown schedule
      const rMonthly = helocRate / 100 / 12
      let   helocBal = 0
      const drawSchedule = []
      for (let yr = 0; yr < retYears; yr++) {
        const age = retAge + yr
        const inShortfall = simRows.find(r => r.age === age)?.portfolioTotal <= 0
        let annualDraw = 0
        if (age >= helocStartAge) {
          if (helocDrawType === 'auto') {
            // Draw only what the portfolio is short
            const portTotal = simRows.find(r => r.age === age)?.portfolioTotal ?? 0
            const target    = simRows.find(r => r.age === age)?.grossWithdrawal ?? 0
            if (portTotal <= 0 && target > 0) annualDraw = Math.min(target, totalCreditLimit - helocBal)
          } else {
            if (helocBal < totalCreditLimit) annualDraw = Math.min(helocFixedDraw, totalCreditLimit - helocBal)
          }
        }
        const interest = helocBal * (helocRate / 100)
        helocBal = helocBal + annualDraw + interest
        drawSchedule.push({ age, annualDraw: Math.round(annualDraw), balance: Math.round(helocBal), interest: Math.round(interest), inShortfall })
      }
      const totalDrawn    = drawSchedule.reduce((s, r) => s + r.annualDraw, 0)
      const finalBalance  = drawSchedule[drawSchedule.length - 1]?.balance ?? 0
      const equityRemaining = Math.max(0, totalEquity - finalBalance)

      const fmtD = n => n == null ? '—' : n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}K` : `$${Math.round(n).toLocaleString()}`

      return (
        <div className="space-y-4 text-xs">
          {/* Intro */}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed border-l-2 border-amber-300 dark:border-amber-700 pl-2.5 py-0.5">
            Model using your home equity to cover portfolio shortfalls in retirement via a <strong className="text-gray-700 dark:text-gray-300">HELOC</strong> or <strong className="text-gray-700 dark:text-gray-300">Reverse Mortgage</strong>.
          </p>

          {reProperties.length === 0 ? (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-[11px] text-amber-700 dark:text-amber-400">
              No properties found. Add properties in the Real Estate module first.
            </div>
          ) : (<>

            {/* Product type */}
            <div className="flex items-center gap-2">
              {[{ id: 'heloc', label: 'HELOC' }, { id: 'reverse', label: 'Reverse Mortgage' }].map(t => (
                <button key={t.id} onClick={() => setHelocType(t.id)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors border ${helocType === t.id ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-300 hover:text-amber-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Property equity summary */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Property Equity at Retirement (age {retAge})</p>
              {propEquity.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800/60 px-2.5 py-2 gap-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{p.name}</span>
                  <div className="flex items-center gap-3 flex-shrink-0 text-[11px]">
                    <span className="text-gray-400">Value <span className="text-gray-700 dark:text-gray-300 font-medium">{fmtD(p.projVal)}</span></span>
                    {p.mortBal > 0 && <span className="text-gray-400">Mortgage <span className="text-red-500 font-medium">−{fmtD(p.mortBal)}</span></span>}
                    <span className="text-gray-400">Equity <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{fmtD(p.equity)}</span></span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-gray-100 dark:border-gray-800">
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                  {helocType === 'reverse' ? 'Max draw (55% of value)' : `Credit limit (${helocLimitPct}% of equity)`}
                </span>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{fmtD(totalCreditLimit)}</span>
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Parameters</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <label className="text-[10px] text-gray-400 dark:text-gray-500">Interest rate %</label>
                  <input type="number" min={1} max={20} step={0.1} value={helocRate} onChange={e => setHelocRate(parseFloat(e.target.value) || 7.2)}
                    className="input-field !text-xs !py-1 w-full mt-0.5" />
                </div>
                {helocType === 'heloc' && (
                  <div>
                    <label className="text-[10px] text-gray-400 dark:text-gray-500">Credit limit % of equity</label>
                    <input type="number" min={10} max={80} step={5} value={helocLimitPct} onChange={e => setHelocLimitPct(parseInt(e.target.value) || 65)}
                      className="input-field !text-xs !py-1 w-full mt-0.5" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-gray-400 dark:text-gray-500">Draw start age</label>
                  <input type="number" min={retAge} max={lifeExp} value={helocStartAge} onChange={e => setHelocStartAge(parseInt(e.target.value) || retAge)}
                    className="input-field !text-xs !py-1 w-full mt-0.5" />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">Draw strategy:</span>
                {[{ id: 'auto', label: 'Cover shortfalls only' }, { id: 'fixed', label: 'Fixed annual draw' }].map(t => (
                  <button key={t.id} onClick={() => setHelocDrawType(t.id)}
                    className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${helocDrawType === t.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {helocDrawType === 'fixed' && (
                <div>
                  <label className="text-[10px] text-gray-400 dark:text-gray-500">Annual draw amount</label>
                  <input type="number" min={0} step={1000} value={helocFixedDraw} onChange={e => setHelocFixedDraw(parseInt(e.target.value) || 0)}
                    className="input-field !text-xs !py-1 w-full mt-0.5" />
                </div>
              )}
            </div>

            {/* Shortfall analysis */}
            {firstShortfall && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-400">
                ⚠ Portfolio projected to run out at age <strong>{firstShortfall}</strong>. Home equity draw could bridge this gap.
              </div>
            )}
            {!firstShortfall && simRows.length > 0 && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                ✓ No portfolio shortfall detected. Home equity remains a reserve for unexpected needs or estate goals.
              </div>
            )}

            {/* Draw schedule summary */}
            {totalDrawn > 0 && (
              <div className="space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Draw Schedule</p>
                <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
                  {drawSchedule.filter(r => r.annualDraw > 0 || r.balance > 0).map(r => (
                    <div key={r.age} className={`flex items-center justify-between text-[10px] px-2 py-0.5 rounded ${r.inShortfall ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800/40'}`}>
                      <span className="text-gray-500">Age {r.age}</span>
                      {r.annualDraw > 0 && <span className="text-amber-600 dark:text-amber-400">Draw {fmtD(r.annualDraw)}</span>}
                      {r.interest > 0  && <span className="text-red-400">Interest {fmtD(r.interest)}</span>}
                      <span className="font-medium text-gray-700 dark:text-gray-300">Bal {fmtD(r.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Impact Summary</p>
              <div className="flex justify-between"><span className="text-gray-500">Total equity drawn</span><span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{fmtD(totalDrawn)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total interest accrued</span><span className="font-semibold tabular-nums text-red-500">{fmtD(drawSchedule.reduce((s,r) => s+r.interest,0))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Outstanding balance at death</span><span className="font-semibold tabular-nums text-red-500">{fmtD(finalBalance)}</span></div>
              <div className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-1"><span className="font-semibold text-gray-700 dark:text-gray-300">Equity remaining for estate</span><span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{fmtD(equityRemaining)}</span></div>
            </div>

            <p className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-relaxed">
              {helocType === 'reverse' ? 'Reverse mortgage: no payments required — balance compounds until sale or death. Max 55% of appraised value (Canadian rules).' : 'HELOC: interest compounds on outstanding balance. Lender approval required — typically 65–80% of home equity.'}
            </p>

          </>)}
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
              className={`w-full text-left py-2.5 text-xs font-medium flex items-center justify-between transition-colors duration-150 border-l-2
                ${active === item.key
                  ? 'pl-3.5 pr-4 bg-brand-50 text-brand-700 border-brand-500 dark:bg-brand-900/20 dark:text-brand-400 dark:border-brand-400'
                  : 'pl-4 pr-4 text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 border-transparent'
                }`}
            >
              <span>{item.label}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-3 h-3 flex-shrink-0 transition-all duration-150 ${active === item.key ? 'opacity-100 text-brand-500' : 'opacity-0'}`}
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Submenu panel (portal) ───────────────────────────────────────────────── */}
      {active && createPortal(
        (() => {
          const isMobile = window.innerWidth < 640
          const label    = NAV_ITEMS.find(i => i.key === active)?.label

          /* ── Shared header ── */
          const header = (
            <div className="flex items-center justify-between mb-2">
              {isMobile ? (
                /* Mobile: ← back button on the left */
                <button
                  onClick={() => setActive(null)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Back
                </button>
              ) : (
                active !== 'cppoas'
                  ? <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                  : <span />
              )}
              <div className="flex items-center gap-1">
                {active === 'accounts' && (
                  <button
                    onClick={addAccount}
                    className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors text-sm font-medium leading-none"
                    title="Add account"
                  >+</button>
                )}
                {!isMobile && (
                  <button
                    onClick={() => setActive(null)}
                    className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                    title="Close"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )

          if (isMobile) {
            /* ── Mobile: full-screen left-anchored drawer ── */
            return (
              <div
                className="overlay-panel"
                style={{ position: 'fixed', inset: 0, zIndex: 50 }}
              >
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
                  onClick={() => setActive(null)}
                />
                {/* Panel slides in from left */}
                <div
                  className="absolute top-0 left-0 h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
                  style={{ width: 'min(88vw, 360px)' }}
                >
                  {/* Title bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <button
                      onClick={() => setActive(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</p>
                    {active === 'accounts' && (
                      <button
                        onClick={addAccount}
                        className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors text-sm font-medium"
                        title="Add account"
                      >+</button>
                    )}
                  </div>
                  {/* Scrollable content */}
                  <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-3">
                    {sectionContent[active]}
                  </div>
                </div>
              </div>
            )
          }

          /* ── Desktop: original floating card ── */
          return (
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
              <div className="card !p-3 shadow-xl">
                {header}
                <div className="overflow-y-auto sidebar-scroll space-y-2"
                  style={{ maxHeight: typeof cardPos.maxH === 'number' ? cardPos.maxH - 52 : 'calc(100vh - 132px)' }}>
                  {sectionContent[active]}
                </div>
              </div>
            </div>
          )
        })(),
        document.body
      )}
    </>
  )
}
