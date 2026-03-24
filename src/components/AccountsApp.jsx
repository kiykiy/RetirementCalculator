import { useState, useEffect, useRef } from 'react'
import { calcTfsaLimit, getMixStats, ASSET_CLASSES } from '../lib/simulate.js'
import { classifyPlaidAccount, debtTypeFromPlaid } from './PlaidConnect.jsx'

// ─── Primitives ───────────────────────────────────────────────────────────────

function NumInput({ value, onChange, prefix, suffix, min = 0, step = 1000, className = '' }) {
  const [local, setLocal] = useState('')
  const [focused, setFocused] = useState(false)
  const fmt = v => (typeof v === 'number' && !isNaN(v)) ? v.toLocaleString('en-CA') : '0'

  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2.5 text-gray-400 text-xs select-none">{prefix}</span>}
      <input
        type="text"
        inputMode="numeric"
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

function PctInput({ value, onChange, min = 0, max = 30 }) {
  const [local, setLocal] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="decimal"
        value={focused ? local : String(value ?? 0)}
        onFocus={() => { setFocused(true); setLocal(String(value ?? 0)) }}
        onChange={e => { setLocal(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n))) }}
        onBlur={() => { setFocused(false); const n = parseFloat(local); onChange(!isNaN(n) ? Math.min(max, Math.max(min, n)) : value) }}
        className="input-field text-xs py-1.5 pr-7 no-spinner"
      />
      <span className="absolute right-2.5 text-gray-400 text-xs select-none">%</span>
    </div>
  )
}

const TAX_TYPES = [
  { value: 'rrif',   label: 'RRSP / RRIF' },
  { value: 'tfsa',   label: 'TFSA' },
  { value: 'nonreg', label: 'Non-Registered' },
]

const BUILT_IN_IDS = ['rrif', 'tfsa', 'nonreg']

// ─── Demo Mode ────────────────────────────────────────────────────────────────
const DEMO_BANKS = [
  { name: 'TD Canada Trust',  mask: '4521' },
  { name: 'Scotiabank',       mask: '7832' },
  { name: 'RBC Royal Bank',   mask: '9201' },
  { name: 'BMO Bank',         mask: '3344' },
  { name: 'CIBC',             mask: '5521' },
  { name: 'Questrade',        mask: '8873' },
  { name: 'Wealthsimple',     mask: '2290' },
  { name: 'National Bank',    mask: '6612' },
]
const DEMO_SYNC_DATE = new Date().toISOString().slice(0, 10)
function demoBankFor(idx) { return DEMO_BANKS[idx % DEMO_BANKS.length] }

const DEMO_CASH_BALS = [3420, 18750, 5200, 1840, 9100, 2360, 14300, 6780]
const DEMO_DEBT_BALS = [2340, 14500, 8200, 342, 5600, 1200, 3900, 890]
const DEMO_RET_BALS  = { rrif: 112400, tfsa: 45200, nonreg: 23800 }
const DEMO_RET_DEF   = [68000, 34500, 19200, 52000]

const MIX_CLASSES = [
  { key: 'canadianEquity', label: 'CA Equity',   color: '#2563eb' },
  { key: 'usEquity',       label: 'US Equity',   color: '#7c3aed' },
  { key: 'intlEquity',     label: 'Intl Equity', color: '#0891b2' },
  { key: 'fixedIncome',    label: 'Fixed Inc.',  color: '#16a34a' },
  { key: 'cash',           label: 'Cash/GIC',    color: '#d97706' },
]
const DEFAULT_MIX = { canadianEquity: 25, usEquity: 25, intlEquity: 10, fixedIncome: 35, cash: 5 }

// ─── Retirement Account Card ──────────────────────────────────────────────────

function RetirementAccountCard({ account, onUpdate, onRemove, tfsaLimit, tfsaIndexed, onTfsaIndexedChange, inflation, demoMode = false, demoBankIdx = 0, demoBal = 0 }) {
  const isBuiltIn = BUILT_IN_IDS.includes(account.id)
  const isTfsa    = account.taxType === 'tfsa' && tfsaLimit != null
  const upd = (key, val) => onUpdate({ ...account, [key]: val })

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-2.5 bg-white dark:bg-gray-800/50">
      {/* Name row */}
      <div className="flex items-center gap-1.5">
        {isBuiltIn
          ? <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex-1">{account.name}</p>
          : <input
              type="text"
              value={account.name}
              onChange={e => upd('name', e.target.value)}
              className="input-field text-xs font-medium flex-1 py-1"
              placeholder="Account name"
            />
        }
        {!isBuiltIn && (
          <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 dark:text-gray-600" title="Remove">✕</button>
        )}
      </div>

      {/* Tax type (custom accounts only) */}
      {!isBuiltIn && (
        <select value={account.taxType} onChange={e => upd('taxType', e.target.value)} className="input-field text-xs py-1">
          {TAX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      )}

      {/* Balance */}
      <div>
        <label className="label flex items-center gap-1">
          Balance
          {demoMode && <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">● Plaid</span>}
        </label>
        {demoMode
          ? <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-2.5 py-1.5">${demoBal.toLocaleString()}</p>
          : <NumInput value={account.balance} onChange={v => upd('balance', v)} prefix="$" step={1000} />
        }
      </div>

      {/* Portfolio mix toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Portfolio Mix</span>
        <button
          type="button"
          onClick={() => upd('advancedMode', !account.advancedMode)}
          className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${account.advancedMode ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
          <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform mt-0.5 ${account.advancedMode ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Advanced mix or simple return */}
      {account.advancedMode ? (
        <div className="space-y-1.5">
          {MIX_CLASSES.map(cls => {
            const mix = { ...DEFAULT_MIX, ...(account.mix ?? {}) }
            const ac  = ASSET_CLASSES[cls.key]
            return (
              <div key={cls.key}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{cls.label}</span>
                  <span className="text-[11px] font-semibold tabular-nums">{mix[cls.key]}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={mix[cls.key]}
                  onChange={e => upd('mix', { ...mix, [cls.key]: parseInt(e.target.value) })}
                  className="w-full h-1 cursor-pointer rounded-full" style={{ accentColor: cls.color }}
                />
              </div>
            )
          })}
          {(() => {
            const mix   = { ...DEFAULT_MIX, ...(account.mix ?? {}) }
            const total = Object.values(mix).reduce((s, v) => s + v, 0)
            const stats = getMixStats(mix)
            return (
              <div className={`flex justify-between rounded px-2 py-1 text-[11px] ${Math.abs(total - 100) > 1 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : 'bg-gray-50 dark:bg-gray-800/60 text-gray-400'}`}>
                <span>{total}%</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">~{stats.ret.toFixed(1)}% · σ {stats.std.toFixed(1)}%</span>
              </div>
            )
          })()}
        </div>
      ) : (
        <div>
          <label className="label">Return Rate</label>
          <PctInput value={account.returnRate} onChange={v => upd('returnRate', v)} />
        </div>
      )}

      {/* Contribution */}
      <div>
        <label className="label">Annual Contribution</label>
        <NumInput value={account.annualContribution} onChange={v => upd('annualContribution', v)} prefix="$" step={500} />
        {isTfsa && tfsaLimit != null && (
          <div className="mt-1 space-y-0.5">
            {account.annualContribution >= tfsaLimit
              ? <p className="text-[10px] text-emerald-600 font-medium">✓ At limit (${tfsaLimit.toLocaleString()}/yr)</p>
              : <button type="button" onClick={() => upd('annualContribution', tfsaLimit)} className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline">
                  → Set to max (${tfsaLimit.toLocaleString()})
                </button>
            }
          </div>
        )}
      </div>

      {/* TFSA indexing */}
      {isTfsa && (
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={tfsaIndexed} onChange={e => onTfsaIndexedChange?.(e.target.checked)} className="rounded border-gray-300 text-brand-600" />
          <span className="text-gray-600 dark:text-gray-400">Index limit to CPI ({inflation}%)</span>
        </label>
      )}

      <PlaidAccountBadge
        acc={account}
        onUpdate={(f, v) => onUpdate({ ...account, [f]: v })}
        demoMode={demoMode} demoBankIdx={demoBankIdx}
      />
    </div>
  )
}

// ─── Plaid Account Badge ──────────────────────────────────────────────────────
// Shows connection state at the bottom of every account card.
// onConnect / onDisconnect / onSync are wired up when real Plaid is added.

function PlaidAccountBadge({ acc, onUpdate, demoMode = false, demoBankIdx = 0 }) {
  const demoBank  = demoMode ? demoBankFor(demoBankIdx) : null
  const connected = demoMode ? true : !!acc.plaidConnected
  const institution = demoMode ? demoBank.name : (acc.plaidInstitution ?? 'Connected')
  const mask        = demoMode ? demoBank.mask : acc.plaidMask
  const lastSync    = demoMode ? DEMO_SYNC_DATE : acc.plaidLastSync

  if (connected) {
    return (
      <div className="mt-1 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 px-2.5 py-2 space-y-1">
        {/* Connected header */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
              {institution}
            </span>
            {mask && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-500 flex-shrink-0">
                ••••{mask}
              </span>
            )}
          </div>
          {/* Sync + disconnect */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              title="Sync now"
              onClick={() => !demoMode && onUpdate('plaidLastSync', new Date().toISOString().slice(0, 10))}
              className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors text-xs leading-none"
            >
              ⟳
            </button>
            {!demoMode && (
              <button
                title="Disconnect"
                onClick={() => {
                  onUpdate('plaidConnected', false)
                  onUpdate('plaidInstitution', undefined)
                  onUpdate('plaidMask', undefined)
                  onUpdate('plaidLastSync', undefined)
                }}
                className="text-emerald-400 hover:text-rose-500 dark:text-emerald-600 dark:hover:text-rose-400 transition-colors text-[10px] leading-none"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {/* Last synced */}
        {lastSync && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-500">
            Synced {lastSync}
          </p>
        )}
      </div>
    )
  }

  // Not connected — link button
  return (
    <button
      type="button"
      onClick={() => {
        // Placeholder: wired to real Plaid Link later
        // onUpdate('plaidConnected', true) etc.
      }}
      className="w-full mt-1 flex items-center justify-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg py-1.5 hover:border-brand-300 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
    >
      🏦 <span>Link to bank</span>
    </button>
  )
}

// ─── Budget Account Card ──────────────────────────────────────────────────────

function BudgetAccountCard({ acc, rateLabel, defaultRate, onUpdate, onRemove, onAddSub, onRemoveSub, onUpdateSub, demoMode = false, demoBankIdx = 0, demoBal = 0 }) {
  const hasSub  = acc.subAccounts?.length > 0
  const totalBal = hasSub ? acc.subAccounts.reduce((s, sa) => s + (sa.balance ?? 0), 0) : (acc.balance ?? 0)

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-2.5 bg-white dark:bg-gray-800/50">
      <div className="flex items-center gap-1.5">
        <input type="text" value={acc.name} onChange={e => onUpdate('name', e.target.value)}
          className="input-field text-xs font-medium flex-1 py-1" placeholder="Account name" />
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 dark:text-gray-600" title="Remove">✕</button>
      </div>

      <div>
        <label className="label flex items-center gap-1">
          Balance
          {demoMode && <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">● Plaid</span>}
          {hasSub && <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full ml-0.5">auto</span>}
        </label>
        {hasSub
          ? <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-2.5 py-1.5">${totalBal.toLocaleString()}</p>
          : demoMode
            ? <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-2.5 py-1.5">${demoBal.toLocaleString()}</p>
            : <NumInput value={acc.balance ?? 0} onChange={v => onUpdate('balance', v)} prefix="$" step={500} />
        }
      </div>

      <div>
        <label className="label">{rateLabel}</label>
        <PctInput value={acc.rate ?? defaultRate} onChange={v => onUpdate('rate', v)} max={30} />
      </div>

      {/* Internal Splits */}
      {hasSub && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Internal Split</p>
          {acc.subAccounts.map(sa => (
            <div key={sa.id} className="flex items-center gap-1.5">
              <input type="text" value={sa.name} onChange={e => onUpdateSub(sa.id, 'name', e.target.value)}
                className="input-field text-xs py-0.5 flex-1" placeholder="Name" />
              <div className="relative flex items-center w-28 flex-shrink-0">
                <span className="absolute left-2 text-gray-400 text-xs">$</span>
                <input type="number" min={0} step={100} value={sa.balance ?? 0}
                  onChange={e => onUpdateSub(sa.id, 'balance', parseFloat(e.target.value) || 0)}
                  className="input-field text-xs py-0.5 pl-5 w-full" />
              </div>
              <button onClick={() => onRemoveSub(sa.id)} className="text-gray-300 hover:text-red-500 text-sm leading-none dark:text-gray-600">✕</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => onAddSub(acc.id)}
        className="w-full text-[10px] text-gray-400 hover:text-brand-600 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg py-1 transition-colors">
        + Add Split
      </button>

      <PlaidAccountBadge acc={acc} onUpdate={(f, v) => onUpdate(f, v)} demoMode={demoMode} demoBankIdx={demoBankIdx} />
    </div>
  )
}

// ─── Other Asset Card ─────────────────────────────────────────────────────────

const OTHER_ASSET_TYPES = [
  { value: 'vehicle',     label: 'Vehicle'       },
  { value: 'artwork',     label: 'Artwork'        },
  { value: 'collectible', label: 'Collectible'   },
  { value: 'business',    label: 'Business'      },
  { value: 'other',       label: 'Other'         },
]

const ASSET_TYPE_ICONS = {
  vehicle: '🚗', artwork: '🎨',
  collectible: '💎', business: '🏢', other: '📦',
}

function OtherAssetCard({ asset, onUpdate, onRemove }) {
  const upd = (f, v) => onUpdate(f, v)
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-2.5 bg-white dark:bg-gray-800/50">
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none flex-shrink-0">{ASSET_TYPE_ICONS[asset.assetType ?? 'other']}</span>
        <input type="text" value={asset.name} onChange={e => upd('name', e.target.value)}
          className="input-field text-xs font-medium flex-1 py-1" placeholder="Asset name" />
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 dark:text-gray-600" title="Remove">✕</button>
      </div>
      <select value={asset.assetType ?? 'other'} onChange={e => upd('assetType', e.target.value)}
        className="input-field text-xs py-1 w-full">
        {OTHER_ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <div>
        <label className="label">Estimated Value</label>
        <NumInput value={asset.value ?? 0} onChange={v => upd('value', v)} prefix="$" step={5000} />
      </div>
      <div>
        <label className="label">Annual Appreciation (%)</label>
        <PctInput value={asset.appreciation ?? 0} onChange={v => upd('appreciation', v)} min={-50} max={50} />
      </div>
    </div>
  )
}

// ─── Debt Account Card ────────────────────────────────────────────────────────

const DEBT_TYPES = [
  { value: 'credit_card', label: 'Credit Card'      },
  { value: 'loc',         label: 'Line of Credit'   },
  { value: 'loan',        label: 'Personal Loan'    },
  { value: 'mortgage',    label: 'Mortgage'         },
  { value: 'student',     label: 'Student Loan'     },
  { value: 'auto',        label: 'Auto Loan'        },
  { value: 'other',       label: 'Other'            },
]

const DEBT_DEFAULT_RATES = {
  credit_card: 19.99,
  loc:          7.00,
  loan:         8.00,
  mortgage:     5.50,
  student:      6.00,
  auto:         7.50,
  other:        10.0,
}

function DebtAccountCard({ acc, onUpdate, onRemove, demoMode = false, demoBankIdx = 0, demoBal = 0 }) {
  const upd = (f, v) => onUpdate(f, v)
  const typeLabel = DEBT_TYPES.find(t => t.value === (acc.debtType ?? 'credit_card'))?.label ?? 'Debt'

  return (
    <div className="border border-rose-100 dark:border-rose-900/40 rounded-xl p-3 space-y-2.5 bg-white dark:bg-gray-800/50">
      {/* Name + remove */}
      <div className="flex items-center gap-1.5">
        <input type="text" value={acc.name} onChange={e => upd('name', e.target.value)}
          className="input-field text-xs font-medium flex-1 py-1" placeholder="Account name" />
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 dark:text-gray-600" title="Remove">✕</button>
      </div>

      {/* Debt type */}
      <select value={acc.debtType ?? 'credit_card'} onChange={e => upd('debtType', e.target.value)}
        className="input-field text-xs py-1 w-full">
        {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {/* Balance owing */}
      <div>
        <label className="label flex items-center gap-1">
          Balance Owing
          {demoMode && <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">● Plaid</span>}
        </label>
        {demoMode
          ? <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 tabular-nums bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-2.5 py-1.5">${demoBal.toLocaleString()}</p>
          : <NumInput value={acc.balance ?? 0} onChange={v => upd('balance', v)} prefix="$" step={100} />
        }
      </div>

      {/* Interest rate */}
      <div>
        <label className="label">Interest Rate (APR)</label>
        <PctInput value={acc.rate ?? DEBT_DEFAULT_RATES[acc.debtType ?? 'credit_card']} onChange={v => upd('rate', v)} max={50} />
      </div>

      {/* Monthly minimum payment */}
      <div>
        <label className="label">Min. Monthly Payment</label>
        <NumInput value={acc.minPayment ?? 0} onChange={v => upd('minPayment', v)} prefix="$" step={25} />
      </div>

      {/* Interest cost indicator */}
      {(acc.balance > 0) && (acc.rate > 0) && (
        <p className="text-[10px] text-rose-500 dark:text-rose-400 font-medium tabular-nums">
          ~${Math.round(acc.balance * (acc.rate / 100) / 12).toLocaleString()}/mo in interest
        </p>
      )}

      <PlaidAccountBadge acc={acc} onUpdate={(f, v) => onUpdate(f, v)} demoMode={demoMode} demoBankIdx={demoBankIdx} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

let nextAccId = 1

// ─── Card wrapper with scroll-target + highlight ring ─────────────────────────
// Defined OUTSIDE the main component so its identity is stable across re-renders.
// If it were defined inside, every render would create a new component type and
// React would unmount/remount cards on every keystroke — killing input focus.
function CardWrap({ id, highlightId, children }) {
  return (
    <div data-account-id={id}
      className={`rounded-xl transition-shadow duration-300 ${
        highlightId === id
          ? 'ring-2 ring-brand-400 dark:ring-brand-500 shadow-lg shadow-brand-200/50 dark:shadow-brand-900/50'
          : ''
      }`}>
      {children}
    </div>
  )
}

export default function AccountsApp({ inputs, onInputsChange, budget, onBudgetChange, darkMode, focusAccountId, demoMode = false, onGoToRealEstate }) {
  const sp           = inputs.spouse ?? {}
  const spouseEnabled = !!sp.enabled
  const primaryName  = inputs.userName  || 'Primary'
  const spouseName   = inputs.spouseName || 'Spouse'
  const [activePerson, setActivePerson]         = useState('primary')
  const [activeCashPerson, setActiveCashPerson] = useState('primary')
  const [highlightId, setHighlightId]           = useState(null)
  const scrollRef = useRef(null)

  // Scroll-to + flash when focusAccountId changes
  useEffect(() => {
    if (!focusAccountId) return
    setHighlightId(focusAccountId)
    // Small delay lets the page finish mounting/scrolling into view
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-account-id="${focusAccountId}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const timer = setTimeout(() => setHighlightId(null), 2200)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [focusAccountId])

  const currentYear    = new Date().getFullYear()
  const tfsaLimit      = calcTfsaLimit(currentYear, inputs.inflation ?? 2.5, inputs.tfsaIndexedToInflation ?? false)
  const inflation      = inputs.inflation ?? 2.5

  // ── Retirement account helpers ──
  const retAccounts   = activePerson === 'spouse' ? (sp.accounts ?? []) : (inputs.accounts ?? [])

  function updateRetAccount(updated) {
    if (activePerson === 'spouse') {
      onInputsChange({ ...inputs, spouse: { ...sp, accounts: sp.accounts.map(a => a.id === updated.id ? updated : a) } })
    } else {
      onInputsChange({ ...inputs, accounts: inputs.accounts.map(a => a.id === updated.id ? updated : a) })
    }
  }

  function removeRetAccount(id) {
    if (activePerson === 'spouse') {
      onInputsChange({ ...inputs, spouse: { ...sp, accounts: sp.accounts.filter(a => a.id !== id) } })
    } else {
      onInputsChange({ ...inputs, accounts: inputs.accounts.filter(a => a.id !== id) })
    }
  }

  function addRetAccount() {
    const id  = `${activePerson === 'spouse' ? 'sp' : 'custom'}_acc_${nextAccId++}`
    const acc = { id, name: 'New Account', balance: 0, annualContribution: 0, returnRate: 6, taxType: 'nonreg', advancedMode: false, mix: { ...DEFAULT_MIX } }
    if (activePerson === 'spouse') {
      onInputsChange({ ...inputs, spouse: { ...sp, accounts: [...(sp.accounts ?? []), acc] } })
    } else {
      onInputsChange({ ...inputs, accounts: [...inputs.accounts, acc] })
    }
  }

  // ── Budget account helpers ──
  const cashKey            = activeCashPerson === 'spouse' ? 'spouseCashAccounts' : 'cashAccounts'
  const cashAccounts       = budget[cashKey] ?? []
  const investmentAccounts = budget.investmentAccounts ?? []

  const updBudget = (key, fn) => onBudgetChange({ ...budget, [key]: fn(budget[key] ?? []) })

  const addCash    = () => updBudget(cashKey,       p => [...p, { id: `ca_${nextAccId++}`, name: 'New Account', balance: 0, rate: 0, subAccounts: [] }])
  const removeCash = id => updBudget(cashKey,       p => p.filter(a => a.id !== id))
  const updateCash = (id, f, v) => updBudget(cashKey, p => p.map(a => a.id === id ? { ...a, [f]: v } : a))
  const addCashSub    = (accId) => updBudget(cashKey, p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: [...(a.subAccounts ?? []), { id: `cas_${nextAccId++}`, name: 'New', balance: 0 }] }))
  const removeCashSub = (accId, subId) => updBudget(cashKey, p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).filter(sa => sa.id !== subId) }))
  const updateCashSub = (accId, subId, f, v) => updBudget(cashKey, p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).map(sa => sa.id === subId ? { ...sa, [f]: v } : sa) }))

  // ── Other assets ──
  const otherAssets    = budget.otherAssets ?? []
  const addOtherAsset    = () => updBudget('otherAssets', p => [...(p ?? []), { id: `oa_${nextAccId++}`, name: 'New Asset', assetType: 'other', value: 0, appreciation: 0 }])
  const removeOtherAsset = id => updBudget('otherAssets', p => (p ?? []).filter(a => a.id !== id))
  const updateOtherAsset = (id, f, v) => updBudget('otherAssets', p => (p ?? []).map(a => a.id === id ? { ...a, [f]: v } : a))

  // ── Debt account helpers ──
  const debtAccounts = budget.debtAccounts ?? []
  const addDebt    = () => updBudget('debtAccounts', p => [...p, { id: `da_${nextAccId++}`, name: 'New Account', balance: 0, rate: 19.99, debtType: 'credit_card', minPayment: 0 }])
  const removeDebt = id => updBudget('debtAccounts', p => p.filter(a => a.id !== id))
  const updateDebt = (id, f, v) => updBudget('debtAccounts', p => p.map(a => a.id === id ? { ...a, [f]: v } : a))

  const addInv    = () => updBudget('investmentAccounts',   p => [...p, { id: `ia_${nextAccId++}`, name: 'New Account', balance: 0, rate: 6, subAccounts: [] }])
  const removeInv = id => updBudget('investmentAccounts',   p => p.filter(a => a.id !== id))
  const updateInv = (id, f, v) => updBudget('investmentAccounts', p => p.map(a => a.id === id ? { ...a, [f]: v } : a))
  const addInvSub    = (accId) => updBudget('investmentAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: [...(a.subAccounts ?? []), { id: `ias_${nextAccId++}`, name: 'New', balance: 0 }] }))
  const removeInvSub = (accId, subId) => updBudget('investmentAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).filter(sa => sa.id !== subId) }))
  const updateInvSub = (accId, subId, f, v) => updBudget('investmentAccounts', p => p.map(a => a.id !== accId ? a : { ...a, subAccounts: (a.subAccounts ?? []).map(sa => sa.id === subId ? { ...sa, [f]: v } : sa) }))

  // ── Plaid: import all accounts from a successful link ──
  function handlePlaidAccounts(plaidAccounts, institutionName) {
    const newCash = [], newDebt = [], newInv = []
    for (const pa of plaidAccounts) {
      const bucket = classifyPlaidAccount(pa)
      const bal    = pa.balances?.current ?? 0
      const id     = `plaid_${pa.account_id}`
      const name   = `${institutionName} – ${pa.name}`
      if (bucket === 'cash') {
        newCash.push({ id, name, balance: bal, rate: 0, subAccounts: [], plaidId: pa.account_id })
      } else if (bucket === 'debt') {
        newDebt.push({ id, name, balance: Math.abs(bal), rate: 19.99, debtType: debtTypeFromPlaid(pa), minPayment: 0, plaidId: pa.account_id })
      } else if (bucket === 'investment') {
        newInv.push({ id, name, balance: bal, rate: 6, subAccounts: [], plaidId: pa.account_id })
      }
    }
    onBudgetChange({
      ...budget,
      cashAccounts:       [...(budget.cashAccounts ?? []).filter(a => !newCash.find(n => n.plaidId === a.plaidId)), ...newCash],
      debtAccounts:       [...(budget.debtAccounts ?? []).filter(a => !newDebt.find(n => n.plaidId === a.plaidId)), ...newDebt],
      investmentAccounts: [...(budget.investmentAccounts ?? []).filter(a => !newInv.find(n => n.plaidId === a.plaidId)), ...newInv],
    })
  }

  const accBal = a => a.subAccounts?.length > 0 ? a.subAccounts.reduce((s, sa) => s + (sa.balance ?? 0), 0) : (a.balance ?? 0)
  const totalCash = cashAccounts.reduce((s, a) => s + accBal(a), 0)
  const totalDebt = debtAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalInv  = investmentAccounts.reduce((s, a) => s + accBal(a), 0)
  const totalRet        = retAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const totalOtherValue = otherAssets.reduce((s, a) => s + (a.value ?? 0), 0)

  function SectionHeader({ title, total, totalNegative = false, action, children }) {
    return (
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {total > 0 && (
            <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-lg ${
              totalNegative
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20'
                : 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
            }`}>
              {totalNegative ? '-' : ''}${total.toLocaleString()}
            </span>
          )}
          {children}
        </div>
        {action}
      </div>
    )
  }


  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
    <div className="p-6 space-y-8">

      {/* ── Demo Mode Banner ── */}
      {demoMode && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 flex items-center gap-3">
          <span className="text-amber-500 text-base leading-none flex-shrink-0">🏦</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Demo Mode — Bank connections simulated</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">All accounts are shown as if linked via Plaid. Toggle off DEMO to return to your real data.</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Live sync</span>
          </div>
        </div>
      )}

      {/* ── Cash & Savings ── */}
      <section>
        <SectionHeader title="Cash &amp; Savings" total={totalCash} action={
          <button onClick={addCash} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
            + Add Account
          </button>
        }>
          {spouseEnabled && (
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              {[{ id: 'primary', label: primaryName }, { id: 'spouse', label: spouseName }].map(p => (
                <button key={p.id} type="button" onClick={() => setActiveCashPerson(p.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activeCashPerson === p.id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          )}
        </SectionHeader>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Chequing, savings, and cash accounts used in the Budget Dashboard's net worth and cashflow projections.
        </p>
        {cashAccounts.length === 0 ? (
          <button onClick={addCash}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-6 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 transition-colors w-full">
            <span className="text-xl leading-none">+</span>
            <span className="text-xs font-medium">Add cash or savings account</span>
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cashAccounts.map((acc, idx) => (
              <CardWrap key={acc.id} id={acc.id} highlightId={highlightId}>
                <BudgetAccountCard
                  acc={acc}
                  rateLabel="Interest %"
                  defaultRate={0}
                  onUpdate={(f, v) => updateCash(acc.id, f, v)}
                  onRemove={() => removeCash(acc.id)}
                  onAddSub={addCashSub}
                  onRemoveSub={(subId) => removeCashSub(acc.id, subId)}
                  onUpdateSub={(subId, f, v) => updateCashSub(acc.id, subId, f, v)}
                  demoMode={demoMode} demoBankIdx={idx}
                  demoBal={DEMO_CASH_BALS[idx % DEMO_CASH_BALS.length]}
                />
              </CardWrap>
            ))}
            <button onClick={addCash}
              className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-4 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 transition-colors min-h-[100px]">
              <span className="text-xl leading-none">+</span>
              <span className="text-xs font-medium">Add Account</span>
            </button>
          </div>
        )}
      </section>

      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* ── Credit Cards & Debt ── */}
      <section>
        <SectionHeader title="Credit Cards &amp; Debt" total={totalDebt} totalNegative action={
          <button onClick={addDebt} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
            + Add Account
          </button>
        } />
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Credit cards, lines of credit, loans, and other liabilities. Balances are tracked as money owed.
        </p>
        {debtAccounts.length === 0 ? (
          <button onClick={addDebt}
            className="rounded-xl border border-dashed border-rose-200 dark:border-rose-900/40 flex flex-col items-center justify-center gap-1 p-6 text-gray-400 hover:text-rose-500 hover:border-rose-400 dark:hover:text-rose-400 transition-colors w-full">
            <span className="text-xl leading-none">+</span>
            <span className="text-xs font-medium">Add credit card or debt account</span>
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {debtAccounts.map((acc, idx) => (
              <CardWrap key={acc.id} id={acc.id} highlightId={highlightId}>
                <DebtAccountCard
                  acc={acc}
                  onUpdate={(f, v) => updateDebt(acc.id, f, v)}
                  onRemove={() => removeDebt(acc.id)}
                  demoMode={demoMode} demoBankIdx={cashAccounts.length + idx}
                  demoBal={DEMO_DEBT_BALS[idx % DEMO_DEBT_BALS.length]}
                />
              </CardWrap>
            ))}
            <button onClick={addDebt}
              className="rounded-xl border border-dashed border-rose-200 dark:border-rose-900/40 flex flex-col items-center justify-center gap-1 p-4 text-gray-400 hover:text-rose-500 hover:border-rose-400 dark:hover:text-rose-400 transition-colors min-h-[100px]">
              <span className="text-xl leading-none">+</span>
              <span className="text-xs font-medium">Add Account</span>
            </button>
          </div>
        )}
      </section>

      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* ── Investments ── */}
      <section>
        <SectionHeader title="Investments" total={totalRet}>
          {spouseEnabled && (
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              {[{ id: 'primary', label: primaryName }, { id: 'spouse', label: spouseName }].map(p => (
                <button key={p.id} type="button" onClick={() => setActivePerson(p.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activePerson === p.id
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          )}
        </SectionHeader>

        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          RRSP, TFSA, and non-registered accounts used in retirement simulations. Changes here update the Retirement Planner automatically.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {retAccounts.map((acc, idx) => (
            <CardWrap key={acc.id} id={acc.id} highlightId={highlightId}>
              <RetirementAccountCard
                account={acc}
                onUpdate={updateRetAccount}
                onRemove={() => removeRetAccount(acc.id)}
                tfsaLimit={acc.taxType === 'tfsa' ? tfsaLimit : null}
                tfsaIndexed={acc.taxType === 'tfsa' ? (inputs.tfsaIndexedToInflation ?? false) : false}
                onTfsaIndexedChange={acc.taxType === 'tfsa' ? v => onInputsChange({ ...inputs, tfsaIndexedToInflation: v }) : null}
                inflation={inflation}
                demoMode={demoMode}
                demoBankIdx={cashAccounts.length + debtAccounts.length + idx}
                demoBal={DEMO_RET_BALS[acc.taxType] ?? DEMO_RET_DEF[idx % DEMO_RET_DEF.length]}
              />
            </CardWrap>
          ))}
          <button
            onClick={addRetAccount}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-4 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 dark:hover:border-brand-700 transition-colors min-h-[120px]"
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs font-medium">Add Account{activePerson === 'spouse' ? ` for ${spouseName}` : ''}</span>
          </button>
        </div>
      </section>

      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* ── Other Assets ── */}
      <section>
        <SectionHeader title="Other Assets" total={totalOtherValue} action={
          <button onClick={addOtherAsset} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
            + Add Asset
          </button>
        } />
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Vehicles, artwork, business interests, and other assets. Manage real estate &amp; mortgages in the 🏠 Real Estate tab.
        </p>
        {otherAssets.length === 0 ? (
          <button onClick={addOtherAsset}
            className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-6 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 transition-colors w-full">
            <span className="text-xl leading-none">📦</span>
            <span className="text-xs font-medium">Add vehicle, artwork, or other asset</span>
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {otherAssets.map(asset => (
              <OtherAssetCard
                key={asset.id}
                asset={asset}
                onUpdate={(f, v) => updateOtherAsset(asset.id, f, v)}
                onRemove={() => removeOtherAsset(asset.id)}
              />
            ))}
            <button onClick={addOtherAsset}
              className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 p-4 text-gray-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 transition-colors min-h-[100px]">
              <span className="text-xl leading-none">+</span>
              <span className="text-xs font-medium">Add Asset</span>
            </button>
          </div>
        )}
      </section>

      {/* ── Real Estate (linked from RE tab) ── */}
      {(budget.properties ?? []).length > 0 && (() => {
        const props = budget.properties ?? []
        const totalPropVal  = props.reduce((s, p) => s + (p.currentValue ?? 0), 0)
        const totalMortDebt = props.reduce((s, p) => s + (p.mortgage?.enabled ? (p.mortgage?.balance ?? 0) : 0), 0)
        return (
          <section>
            <div className="border-t border-gray-100 dark:border-gray-800 mb-8" />
            <SectionHeader title="Real Estate" total={totalPropVal - totalMortDebt}
              action={
                <button onClick={() => onGoToRealEstate?.()}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                  Manage in 🏠 tab →
                </button>
              }
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Properties and mortgages are managed in the Real Estate tab. Equity shown below contributes to your net worth.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {props.map(p => {
                const equity = (p.currentValue ?? 0) - (p.mortgage?.enabled ? (p.mortgage?.balance ?? 0) : 0)
                return (
                  <div key={p.id} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3 space-y-1.5 bg-white dark:bg-gray-800/50">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{p.type?.replace('_', ' ')}</p>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">Value</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">${(p.currentValue ?? 0).toLocaleString()}</span>
                    </div>
                    {p.mortgage?.enabled && (p.mortgage?.balance ?? 0) > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500">Mortgage</span>
                        <span className="font-semibold text-rose-500">−${(p.mortgage.balance).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[11px] pt-1 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-gray-500 font-medium">Equity</span>
                      <span className={`font-bold ${equity >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>${equity.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

    </div>
    </div>
  )
}
