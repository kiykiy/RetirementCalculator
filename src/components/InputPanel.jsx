import { useState, useEffect } from 'react'
import { PROVINCES } from '../lib/tax.js'
import { calcCPP, calcOAS } from '../lib/simulate.js'

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
      {prefix && <span className="absolute left-2.5 text-slate-400 text-xs select-none">{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode={isPct ? 'decimal' : 'numeric'}
        className={`input-field text-xs py-1 ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''} ${className}`}
        value={local}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {suffix && <span className="absolute right-2.5 text-slate-400 text-xs select-none">{suffix}</span>}
    </div>
  )
}

// ─── Controlled collapsible section ──────────────────────────────────────────

function Section({ title, open, onToggle, children }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 py-3 space-y-2 bg-white">
          {children}
        </div>
      )}
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

function AccountCard({ account, onUpdate, onRemove }) {
  const isBuiltIn = BUILT_IN_IDS.includes(account.id)
  const upd = (key) => (val) => onUpdate({ ...account, [key]: val })

  return (
    <div className="border border-slate-200 rounded-lg p-2.5 space-y-2 bg-white">
      <div className="flex items-center gap-1.5">
        {isBuiltIn ? (
          <p className="text-xs font-semibold text-slate-700 flex-1">{account.name}</p>
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
            className="text-slate-400 hover:text-red-500 text-sm leading-none px-1 transition-colors"
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

      <div className="grid grid-cols-5 gap-1.5">
        <Field label="Balance" id={`${account.id}-bal`} className="col-span-3">
          <NumberInput id={`${account.id}-bal`} value={account.balance} onChange={upd('balance')} min={0} step={1000} prefix="$" />
        </Field>
        <Field label="Return" id={`${account.id}-ret`} className="col-span-2">
          <NumberInput id={`${account.id}-ret`} value={account.returnRate} onChange={upd('returnRate')} min={0} max={20} step={0.1} suffix="%" className="no-spinner" />
        </Field>
      </div>

      <Field label="Annual Contribution (stops at retirement)" id={`${account.id}-contrib`}>
        <NumberInput id={`${account.id}-contrib`} value={account.annualContribution} onChange={upd('annualContribution')} min={0} step={500} prefix="$" />
      </Field>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const SECTION_KEYS = ['profile','province','accounts','inflation','cpp','oas','db','other','tax']

let nextCustomId = 1

export default function InputPanel({ inputs, onChange }) {
  const set = (key) => (val) => onChange({ ...inputs, [key]: val })

  const [open, setOpen] = useState({
    profile:  true,
    province: true,
    accounts: false,
    inflation: false,
    cpp:      false,
    oas:      false,
    db:       false,
    other:    false,
    tax:      false,
  })

  const toggle    = k  => setOpen(o => ({ ...o, [k]: !o[k] }))
  const allOpen   = SECTION_KEYS.every(k => open[k])
  const toggleAll = () => {
    const v = !allOpen
    setOpen(Object.fromEntries(SECTION_KEYS.map(k => [k, v])))
  }

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
      accounts: [...inputs.accounts, { id, name: 'New Account', balance: 0, annualContribution: 0, returnRate: 6, taxType: 'nonreg' }],
    })
  }

  return (
    <div className="space-y-2">

      {/* Header row with collapse/expand all */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-700">Inputs</h2>
        <button
          type="button"
          onClick={toggleAll}
          title={allOpen ? 'Collapse all' : 'Expand all'}
          className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 text-slate-500 hover:border-brand-500 hover:text-brand-600 transition-colors text-sm leading-none"
        >
          {allOpen ? '−' : '+'}
        </button>
      </div>

      <Section title="Profile" open={open.profile} onToggle={() => toggle('profile')}>
        <div className="grid grid-cols-3 gap-2 items-end">
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
      </Section>

      <Section title="Province" open={open.province} onToggle={() => toggle('province')}>
        <Field label="Province / Territory" id="province">
          <select
            id="province"
            className="input-field"
            value={inputs.province}
            onChange={e => onChange({ ...inputs, province: e.target.value })}
          >
            {PROVINCES.map(p => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Accounts & Accumulation" open={open.accounts} onToggle={() => toggle('accounts')}>
        <p className="text-xs text-slate-400">Each account has its own balance, return rate, and contribution.</p>
        <div className="space-y-2">
          {inputs.accounts.map(acc => (
            <AccountCard
              key={acc.id}
              account={acc}
              onUpdate={updateAccount}
              onRemove={() => removeAccount(acc.id)}
            />
          ))}
          <button
            onClick={addAccount}
            className="w-full text-xs text-brand-600 hover:text-brand-800 border border-dashed border-brand-300 hover:border-brand-500 rounded-lg py-2 transition-colors"
          >
            + Add Account
          </button>
        </div>
      </Section>

      <Section title="Inflation" open={open.inflation} onToggle={() => toggle('inflation')}>
        <Field label="Inflation Rate" id="inflation">
          <NumberInput id="inflation" value={inputs.inflation} onChange={set('inflation')} min={0} max={10} step={0.1} suffix="%" />
        </Field>
      </Section>

      <Section title="Canada Pension Plan (CPP)" open={open.cpp} onToggle={() => toggle('cpp')}>
        <div className="grid grid-cols-1 gap-2">
          <Field label="Avg. Pensionable Earnings" id="cppAvgEarnings">
            <NumberInput id="cppAvgEarnings" value={inputs.cppAvgEarnings} onChange={set('cppAvgEarnings')} min={0} max={200000} step={1000} prefix="$" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Years Contributed" id="cppYearsContributed">
              <NumberInput id="cppYearsContributed" value={inputs.cppYearsContributed} onChange={set('cppYearsContributed')} min={1} max={39} step={1} />
            </Field>
            <Field label="CPP Start Age" id="cppStartAge">
              <NumberInput id="cppStartAge" value={inputs.cppStartAge} onChange={set('cppStartAge')} min={60} max={70} step={1} />
            </Field>
          </div>
          <div className="bg-brand-50 border border-brand-100 rounded-md px-3 py-1.5 text-xs text-brand-700 flex justify-between">
            <span>Estimated Annual CPP</span>
            <span className="font-bold">
              ${calcCPP({ avgEarnings: inputs.cppAvgEarnings, yearsContributed: inputs.cppYearsContributed, startAge: inputs.cppStartAge }).toLocaleString()}
            </span>
          </div>
          {inputs.cppStartAge !== 65 && (
            <p className="text-xs text-slate-400 italic">
              {inputs.cppStartAge < 65
                ? `Taking CPP early reduces benefit by ${((65 - inputs.cppStartAge) * 12 * 0.6).toFixed(1)}%`
                : `Deferring CPP increases benefit by ${((inputs.cppStartAge - 65) * 12 * 0.7).toFixed(1)}%`}
            </p>
          )}
        </div>
      </Section>

      <Section title="Old Age Security (OAS)" open={open.oas} onToggle={() => toggle('oas')}>
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Yrs. in Canada" id="oasYearsResident">
              <NumberInput id="oasYearsResident" value={inputs.oasYearsResident} onChange={set('oasYearsResident')} min={10} max={40} step={1} />
            </Field>
            <Field label="OAS Start Age" id="oasStartAge">
              <NumberInput id="oasStartAge" value={inputs.oasStartAge} onChange={set('oasStartAge')} min={65} max={70} step={1} />
            </Field>
          </div>
          <div className="bg-brand-50 border border-brand-100 rounded-md px-3 py-1.5 text-xs text-brand-700 flex justify-between">
            <span>Estimated Annual OAS</span>
            <span className="font-bold">
              ${calcOAS({ yearsResident: inputs.oasYearsResident, startAge: inputs.oasStartAge }).toLocaleString()}
            </span>
          </div>
          {inputs.oasYearsResident < 40 && (
            <p className="text-xs text-slate-400 italic">
              Partial OAS: {inputs.oasYearsResident}/40 years = {(inputs.oasYearsResident / 40 * 100).toFixed(0)}% of full benefit
            </p>
          )}
          {inputs.oasStartAge > 65 && (
            <p className="text-xs text-slate-400 italic">
              Deferring OAS increases benefit by {((inputs.oasStartAge - 65) * 12 * 0.6).toFixed(1)}%
            </p>
          )}
        </div>
      </Section>

      <Section title="Defined Benefit Pension" open={open.db} onToggle={() => toggle('db')}>
        <div className="grid grid-cols-1 gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={inputs.dbEnabled}
              onChange={e => onChange({ ...inputs, dbEnabled: e.target.checked })}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-slate-600">I have a defined benefit pension</span>
          </label>

          {inputs.dbEnabled && (
            <>
              <Field label="Best Average Salary" id="dbBestAvgSalary">
                <NumberInput id="dbBestAvgSalary" value={inputs.dbBestAvgSalary} onChange={set('dbBestAvgSalary')} min={0} max={500000} step={1000} prefix="$" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Years of Service" id="dbYearsService">
                  <NumberInput id="dbYearsService" value={inputs.dbYearsService} onChange={set('dbYearsService')} min={1} max={50} step={1} />
                </Field>
                <Field label="Accrual Rate" id="dbAccrualRate">
                  <NumberInput id="dbAccrualRate" value={inputs.dbAccrualRate} onChange={set('dbAccrualRate')} min={0.5} max={3} step={0.1} suffix="%" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pension Start Age" id="dbStartAge">
                  <NumberInput id="dbStartAge" value={inputs.dbStartAge} onChange={set('dbStartAge')} min={50} max={75} step={1} />
                </Field>
                <Field label="Annual Indexing" id="dbIndexingRate">
                  <NumberInput id="dbIndexingRate" value={inputs.dbIndexingRate} onChange={set('dbIndexingRate')} min={0} max={5} step={0.1} suffix="%" />
                </Field>
              </div>
              <div className="bg-brand-50 border border-brand-100 rounded-md px-3 py-1.5 text-xs text-brand-700 flex justify-between">
                <span>Estimated Annual DB Pension</span>
                <span className="font-bold">
                  ${Math.round(inputs.dbBestAvgSalary * (inputs.dbAccrualRate / 100) * inputs.dbYearsService).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-400 italic">
                {inputs.dbYearsService} yrs × {inputs.dbAccrualRate}% × ${inputs.dbBestAvgSalary.toLocaleString()} salary
                {inputs.dbIndexingRate > 0 ? `, indexed ${inputs.dbIndexingRate}%/yr` : ', not indexed'}
              </p>
            </>
          )}
        </div>
      </Section>

      <Section title="Other Annual Income" open={open.other} onToggle={() => toggle('other')}>
        <Field label="Other Pension / Annuity" id="otherPension">
          <NumberInput id="otherPension" value={inputs.otherPension} onChange={set('otherPension')} min={0} step={100} prefix="$" />
        </Field>
      </Section>

      <Section title="Tax Assumptions" open={open.tax} onToggle={() => toggle('tax')}>
        <div className="grid grid-cols-1 gap-2">
          <Field label="Marginal Tax Rate (working years)" id="workingMarginalRate">
            <NumberInput id="workingMarginalRate" value={inputs.workingMarginalRate ?? 40} onChange={set('workingMarginalRate')} min={0} max={60} step={1} suffix="%" />
          </Field>
          <p className="text-xs text-slate-400 -mt-1">
            Applied as tax drag on non-registered investment income during accumulation.
          </p>

          <Field label="Non-Reg Income: Ordinary Income %" id="nonRegOrdinaryPct">
            <NumberInput id="nonRegOrdinaryPct" value={inputs.nonRegOrdinaryPct ?? 0} onChange={set('nonRegOrdinaryPct')} min={0} max={100} step={5} suffix="%" />
          </Field>
          <div className="flex justify-between text-xs text-slate-400 -mt-1">
            <span>Capital Gains: {100 - (inputs.nonRegOrdinaryPct ?? 0)}%</span>
            <span>Ordinary Income: {inputs.nonRegOrdinaryPct ?? 0}%</span>
          </div>
          <p className="text-xs text-slate-400">
            0% = all capital gains (lowest tax). 100% = all interest/ordinary income (highest tax).
          </p>
        </div>
      </Section>

    </div>
  )
}
