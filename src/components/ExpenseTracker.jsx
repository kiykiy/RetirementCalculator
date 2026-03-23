import { useState, useEffect } from 'react'
import PlaidConnect from './PlaidConnect.jsx'

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const TYPE_META = {
  expense:      { label: 'Expense',    short: 'EXP',  cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
  income:       { label: 'Income',     short: 'INC',  cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  transfer:     { label: 'Transfer',   short: 'XFER', cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
  debt_payment: { label: 'Debt Pmt',  short: 'DEBT', cls: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' },
}

const fmt2    = n => n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = d => { const dt = new Date(d + 'T00:00:00'); return `${MONTHS[dt.getMonth()]} ${dt.getDate()}` }
const monthOf = dateStr => new Date(dateStr + 'T00:00:00').getMonth()
const yearOf  = dateStr => new Date(dateStr + 'T00:00:00').getFullYear()
const txnType = t => t.type ?? 'expense'

let _tid = 1
const newId = () => `txn_${Date.now()}_${_tid++}`

// ─── Demo data ────────────────────────────────────────────────────────────────

// Expenses that recur every month
const DEMO_RECURRING = [
  { description: 'Hydro Bill',        amount: 118.44 },
  { description: 'Rogers Internet',   amount:  89.99 },
  { description: 'Netflix',           amount:  20.99 },
  { description: 'Spotify',           amount:  11.99 },
  { description: 'Gym Membership',    amount:  49.99 },
  { description: 'Insurance Premium', amount: 185.00 },
  { description: 'Enbridge Gas',      amount: 145.33 },
]

// Variable expenses — rotated across months for variety
const DEMO_VARIABLE = [
  { description: 'Loblaws',            amount: 134.27 },
  { description: 'Shell Gas Station',  amount:  72.50 },
  { description: 'Tim Hortons',        amount:  14.75 },
  { description: 'Metro Grocery',      amount:  98.61 },
  { description: 'Costco',             amount: 213.08 },
  { description: 'Shoppers Drug Mart', amount:  43.20 },
  { description: 'LCBO',               amount:  38.90 },
  { description: 'Petro-Canada',       amount:  65.00 },
  { description: 'Amazon.ca',          amount:  57.34 },
  { description: 'Property Tax',       amount: 420.00 },
  { description: 'Cineplex',           amount:  32.50 },
  { description: 'Esso',               amount:  58.20 },
  { description: 'No Frills',          amount:  76.14 },
  { description: 'Uber Eats',          amount:  42.80 },
  { description: 'Starbucks',          amount:  18.50 },
  { description: 'Canadian Tire',      amount:  67.45 },
  { description: 'Best Buy',           amount:  89.99 },
  { description: 'Rona',               amount: 156.00 },
  { description: 'Dentist Office',     amount: 225.00 },
  { description: 'Via Rail',           amount:  84.00 },
  { description: 'Indigo',             amount:  38.60 },
  { description: 'Sport Chek',         amount: 127.99 },
  { description: 'Winners',            amount:  62.40 },
  { description: 'Sobeys',             amount: 112.33 },
]

// Seasonal amount multipliers (index = month 0-11)
const SEASONAL = [1.12, 1.08, 1.00, 0.95, 0.93, 0.97, 1.02, 1.05, 0.98, 1.00, 1.07, 1.18]

// Seasonal payroll bonus (Dec bonus, summer unchanged)
const PAYROLL_BONUS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1400]

function buildMonthTxns({ yr, monthIdx, pfx, reviewed, chequing, savings,
  mortgageAcct, creditCardAcct, tfsaAcct, leafCatIds }) {
  const mm   = String(monthIdx + 1).padStart(2, '0')
  const pool = [...DEMO_RECURRING, ...DEMO_VARIABLE.slice((monthIdx * 3) % (DEMO_VARIABLE.length - 9), (monthIdx * 3) % (DEMO_VARIABLE.length - 9) + 10)]
  const seas = SEASONAL[monthIdx] ?? 1
  const txns = []

  // Expenses
  pool.forEach((row, i) => {
    const dd    = String(Math.min(2 + i * 2, 28)).padStart(2, '0')
    const catId = reviewed ? (leafCatIds[i % Math.max(1, leafCatIds.length)] ?? null) : null
    const amt   = +(row.amount * seas * (1 + (((i * 7 + monthIdx * 3) % 9) - 4) * 0.01)).toFixed(2)
    txns.push({
      id: `${pfx}_e${i}`, date: `${yr}-${mm}-${dd}`,
      description: row.description, amount: amt,
      account: chequing, type: 'expense', categoryId: catId, reviewed, isDemo: true,
    })
  })

  // Income: payroll 1st & 15th (+ Dec bonus)
  const bonus = PAYROLL_BONUS[monthIdx] ?? 0
  txns.push({ id: `${pfx}_i0`, date: `${yr}-${mm}-01`, description: 'Payroll — Employer Inc.', amount: 4200.00, account: chequing, type: 'income', reviewed, isDemo: true })
  txns.push({ id: `${pfx}_i1`, date: `${yr}-${mm}-15`, description: 'Payroll — Employer Inc.', amount: 4200.00 + bonus, account: chequing, type: 'income', reviewed, isDemo: true })

  // Mortgage (1st)
  txns.push({
    id: `${pfx}_mortgage`, date: `${yr}-${mm}-01`,
    description: 'Mortgage Payment', amount: 2154.00,
    account: chequing, type: 'debt_payment',
    debtAccountId: mortgageAcct?.id   ?? null,
    debtLabel:     mortgageAcct?.name ?? 'Mortgage',
    reviewed, isDemo: true,
  })

  // Credit card payment (22nd)
  txns.push({
    id: `${pfx}_cc`, date: `${yr}-${mm}-22`,
    description: 'Credit Card Payment', amount: 1350.00,
    account: chequing, type: 'debt_payment',
    debtAccountId: creditCardAcct?.id   ?? null,
    debtLabel:     creditCardAcct?.name ?? 'Credit Card',
    reviewed, isDemo: true,
  })

  // Savings transfer (1st)
  txns.push({ id: `${pfx}_t0`, date: `${yr}-${mm}-01`, description: 'Transfer to Savings', amount: 500.00, account: chequing, type: 'transfer', toAccount: savings, reviewed, isDemo: true })

  // TFSA contribution (1st)
  if (tfsaAcct) {
    txns.push({ id: `${pfx}_t1`, date: `${yr}-${mm}-01`, description: 'TFSA Contribution', amount: 583.33, account: chequing, type: 'transfer', toAccount: tfsaAcct.name, reviewed, isDemo: true })
  }

  return txns
}

export function buildDemoTransactions(budget) {
  const cashAccts  = budget?.cashAccounts      ?? []
  const debtAccts  = budget?.debtAccounts      ?? []
  const invAccts   = budget?.investmentAccounts ?? []
  const expSects   = budget?.expenseSections   ?? []

  const chequing = cashAccts[0]?.name || 'Chequing'
  const savings  = cashAccts.find(a => /sav/i.test(a.name))?.name || cashAccts[1]?.name || 'Savings'

  const mortgageAcct   = debtAccts.find(d => d.debtType === 'mortgage'    || /mortgage/i.test(d.name))
  const creditCardAcct = debtAccts.find(d => d.debtType === 'credit_card' || /visa|mc|amex|credit/i.test(d.name))
  const tfsaAcct       = invAccts.find(a => /tfsa/i.test(a.name))

  const leafCatIds = expSects.flatMap(s =>
    s.items.flatMap(item =>
      item.subItems?.length ? item.subItems.map(sub => sub.id) : [item.id]
    )
  )

  const now  = new Date()
  const txns = []

  const shared = { chequing, savings, mortgageAcct, creditCardAcct, tfsaAcct, leafCatIds }

  // ── Full 2025 — all reviewed/pre-classified ───────────────────────────────
  for (let mi = 0; mi < 12; mi++) {
    txns.push(...buildMonthTxns({ yr: 2025, monthIdx: mi, pfx: `demo_2025_${mi}`, reviewed: true, ...shared }))
  }

  // ── Rolling window: current month + 2 previous (may cross into 2026) ─────
  for (let mo = 0; mo <= 2; mo++) {
    const d    = new Date(now.getFullYear(), now.getMonth() - mo, 1)
    const yr   = d.getFullYear()
    const mi   = d.getMonth()
    // Skip if this month is already covered by the 2025 block above
    if (yr === 2025) continue
    const reviewed = mo !== 0
    txns.push(...buildMonthTxns({ yr, monthIdx: mi, pfx: `demo_m${mo}`, reviewed, ...shared }))
  }

  return txns
}

// ─── Add Transaction Form ─────────────────────────────────────────────────────
function AddTxnForm({ onAdd, onCancel, cashAccounts = [], debtAccounts = [] }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    date:          today,
    description:   '',
    amount:        '',
    account:       cashAccounts[0]?.name || '',
    type:          'expense',
    toAccount:     cashAccounts[1]?.name || '',
    debtAccountId: debtAccounts[0]?.id   || '',
  })
  const set   = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const valid = form.date && form.description.trim() && parseFloat(form.amount) > 0

  function handleAdd() {
    if (!valid) return
    const txn = {
      id:          newId(),
      date:        form.date,
      description: form.description.trim(),
      amount:      parseFloat(form.amount),
      account:     form.account || '',
      type:        form.type,
    }
    if (form.type === 'expense')      txn.categoryId    = null
    if (form.type === 'transfer')     txn.toAccount     = form.toAccount
    if (form.type === 'debt_payment') txn.debtAccountId = form.debtAccountId
    onAdd(txn)
  }

  return (
    <div className="px-3 py-2.5 space-y-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
      {/* Type selector */}
      <div className="grid grid-cols-4 gap-0.5 bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
        {Object.entries(TYPE_META).map(([t, meta]) => (
          <button key={t} onClick={() => set('type', t)}
            className={`text-[10px] font-semibold py-1 rounded-md transition-colors ${
              form.type === t ? meta.cls : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}>
            {meta.short}
          </button>
        ))}
      </div>

      <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
        className="input-field text-xs py-1 w-full" />
      <input type="text" value={form.description} onChange={e => set('description', e.target.value)}
        placeholder="Description" className="input-field text-xs py-1 w-full" autoFocus />

      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
          <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)}
            placeholder="0.00" className="input-field text-xs py-1 pl-5 w-full" step="0.01" min="0" />
        </div>
        {cashAccounts.length > 0
          ? <select value={form.account} onChange={e => set('account', e.target.value)}
              className="input-field text-xs py-1 flex-1">
              {cashAccounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          : <input type="text" value={form.account} onChange={e => set('account', e.target.value)}
              placeholder="Account" className="input-field text-xs py-1 w-28" />
        }
      </div>

      {/* Transfer: destination */}
      {form.type === 'transfer' && (
        cashAccounts.length > 1
          ? <select value={form.toAccount} onChange={e => set('toAccount', e.target.value)}
              className="input-field text-xs py-1 w-full">
              <option value="">→ To Account…</option>
              {cashAccounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          : <input type="text" value={form.toAccount} onChange={e => set('toAccount', e.target.value)}
              placeholder="→ To Account" className="input-field text-xs py-1 w-full" />
      )}

      {/* Debt payment: pick account */}
      {form.type === 'debt_payment' && (
        debtAccounts.length > 0
          ? <select value={form.debtAccountId} onChange={e => set('debtAccountId', e.target.value)}
              className="input-field text-xs py-1 w-full">
              <option value="">Select Debt Account…</option>
              {debtAccounts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          : <p className="text-[10px] text-amber-500 dark:text-amber-400">Add debt accounts in the Accounts tab first.</p>
      )}

      <div className="flex gap-1.5">
        <button onClick={handleAdd} disabled={!valid}
          className="flex-1 text-xs py-1 rounded-lg font-medium bg-brand-600 text-white disabled:opacity-40 hover:bg-brand-700 transition-colors">
          Add
        </button>
        <button onClick={onCancel}
          className="flex-1 text-xs py-1 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Cell Popup ───────────────────────────────────────────────────────────────
function CellPopup({ txns, title, subtitle, onClose, onUnassign, onDelete, debtAccounts = [] }) {
  const total = txns.reduce((s, t) => s + (t.amount ?? 0), 0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle} · {txns.length} transaction{txns.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none mt-0.5">×</button>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {txns.map(txn => {
            const meta = TYPE_META[txnType(txn)] ?? TYPE_META.expense
            const debtName = txn.debtAccountId ? debtAccounts.find(d => d.id === txn.debtAccountId)?.name : null
            return (
              <div key={txn.id} className="flex items-center gap-2 px-5 py-2.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${meta.cls}`}>{meta.short}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{txn.description}</p>
                  <p className="text-[10px] text-gray-400">
                    {fmtDate(txn.date)}{txn.account ? ` · ${txn.account}` : ''}{txn.toAccount ? ` → ${txn.toAccount}` : ''}{debtName ? ` → ${debtName}` : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300 flex-shrink-0">${fmt2(txn.amount ?? 0)}</span>
                {onUnassign && txnType(txn) === 'expense' && (
                  <button onClick={() => onUnassign(txn.id)} title="Move back to inbox"
                    className="text-gray-300 hover:text-amber-500 transition-colors text-sm leading-none flex-shrink-0">↩</button>
                )}
                <button onClick={() => onDelete(txn.id)} title="Delete"
                  className="text-gray-300 hover:text-red-500 transition-colors text-sm leading-none flex-shrink-0">✕</button>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <span className="text-xs text-gray-500">Total</span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">${fmt2(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Classify popover ────────────────────────────────────────────────────────
// Floating panel anchored left of the sidebar. Adapts to the transaction type:
//   expense      → category picker (single) or split across multiple categories
//   income       → confirm button
//   transfer     → destination account picker
//   debt_payment → debt account picker
// Type switcher lets you correct a wrong auto-classification.
function ClassifyPopover({ txn, anchorY, allRows, cashAccounts, investmentAccounts, debtAccounts, onClassify, onClose }) {
  const [activeType, setActiveType] = useState(txnType(txn))
  const [search,     setSearch]     = useState('')
  const [toAccount,  setToAccount]  = useState(txn.toAccount ?? '')
  const [debtId,     setDebtId]     = useState(txn.debtAccountId ?? '')
  const [splitMode,  setSplitMode]  = useState(false)
  const [splits,     setSplits]     = useState([{ _k: 0, catId: '', amount: +(txn.amount ?? 0).toFixed(2) }])
  const [_splitKey,  setSplitKey]   = useState(1)

  const total    = txn.amount ?? 0
  const allocated = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const remaining = +(total - allocated).toFixed(2)
  const splitValid = Math.abs(remaining) < 0.005 && splits.length >= 2 && splits.every(r => r.catId && parseFloat(r.amount) > 0)

  const leafRows = allRows.filter(r => !r.isSection && !r.isGroup)
  const q = search.toLowerCase()
  const matchedLeafIds = new Set(leafRows.filter(r => !q || r.name.toLowerCase().includes(q)).map(r => r.id))
  const allAccts = [...(cashAccounts ?? []), ...(investmentAccounts ?? [])]

  const popH = splitMode ? Math.min(520, 200 + splits.length * 52) : 420
  const top  = Math.max(8, Math.min(anchorY - popH / 2, (typeof window !== 'undefined' ? window.innerHeight : 800) - popH - 8))

  // ── Single confirm ──
  function confirm(catId) {
    const updates = { type: activeType, reviewed: true }
    if (activeType === 'expense')      { updates.categoryId    = catId ?? null }
    if (activeType === 'transfer')     { updates.toAccount     = toAccount }
    if (activeType === 'debt_payment') {
      updates.debtAccountId = debtId || null
      if (!debtId) updates.debtLabel = txn.debtLabel || txn.description
    }
    onClassify(updates)
  }

  // ── Split confirm: delete original, create one txn per split ──
  function confirmSplit() {
    if (!splitValid) return
    onClassify({
      _splits: splits.map(s => ({
        id:          newId(),
        date:        txn.date,
        description: txn.description,
        amount:      +(parseFloat(s.amount)).toFixed(2),
        account:     txn.account ?? '',
        type:        'expense',
        categoryId:  s.catId,
        reviewed:    true,
      }))
    })
  }

  function addSplit() {
    const rem = Math.max(0, remaining)
    setSplits(p => [...p, { _k: _splitKey, catId: '', amount: +rem.toFixed(2) }])
    setSplitKey(p => p + 1)
  }

  function updateSplit(k, field, val) {
    setSplits(p => p.map(r => r._k === k ? { ...r, [field]: val } : r))
  }

  function removeSplit(k) {
    setSplits(p => p.filter(r => r._k !== k))
  }

  const typeBtnCls = t =>
    `text-[9px] font-bold py-0.5 rounded transition-colors ${
      activeType === t ? TYPE_META[t].cls : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
    }`

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        className="absolute w-64 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
        style={{ top, right: 'calc(18rem + 10px)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 truncate flex-1 leading-snug">
              {txn.description}
            </p>
            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular-nums flex-shrink-0">
              ${fmt2(total)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {Object.entries(TYPE_META).map(([t]) => (
              <button key={t} onMouseDown={() => { setActiveType(t); setSplitMode(false) }} className={typeBtnCls(t)}>
                {TYPE_META[t].short}
              </button>
            ))}
          </div>
        </div>

        {/* ── Expense: single or split ── */}
        {activeType === 'expense' && (
          <>
            {/* Single / Split toggle */}
            <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5 flex-shrink-0">
              <button onMouseDown={() => setSplitMode(false)}
                className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-colors ${
                  !splitMode ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                Single
              </button>
              <button onMouseDown={() => { setSplitMode(true); if (splits.length < 2) addSplit() }}
                className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-colors ${
                  splitMode ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                ✂ Split
              </button>
            </div>

            {/* Single: searchable category list */}
            {!splitMode && (
              <>
                <div className="px-3 pb-1.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                  <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search categories…" className="input-field text-xs py-1 w-full" />
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  {allRows.map(row => {
                    if (row.isSection) {
                      const hasMatch = allRows.some(r => !r.isSection && !r.isGroup && r.sectionId === row.id && matchedLeafIds.has(r.id))
                      if (!hasMatch) return null
                      return (
                        <div key={row.id} className="sticky top-0 px-3 py-1 bg-gray-50 dark:bg-gray-800/80 text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                          {row.name}
                        </div>
                      )
                    }
                    if (row.isGroup) {
                      const hasMatch = allRows.some(r => r.parentId === row.id && matchedLeafIds.has(r.id))
                      if (!hasMatch) return null
                      return (
                        <div key={row.id} className="px-4 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                          {row.name}
                        </div>
                      )
                    }
                    if (!matchedLeafIds.has(row.id)) return null
                    return (
                      <button key={row.id} onMouseDown={() => confirm(row.id)}
                        className={`w-full text-left py-2 pr-3 text-[11px] font-medium text-gray-700 dark:text-gray-300
                          hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-300 transition-colors
                          ${row.indent ? 'pl-8' : 'pl-4'}`}>
                        {row.name}
                      </button>
                    )
                  })}
                  {matchedLeafIds.size === 0 && (
                    <p className="px-3 py-6 text-center text-[11px] text-gray-400 dark:text-gray-600">No matching categories</p>
                  )}
                </div>
              </>
            )}

            {/* Split: rows of [category select + amount] */}
            {splitMode && (
              <div className="flex flex-col overflow-hidden">
                <div className="overflow-y-auto px-3 pt-1 pb-2 space-y-1.5" style={{ maxHeight: 260 }}>
                  {splits.map((s, idx) => (
                    <div key={s._k} className="flex items-center gap-1.5">
                      <select
                        value={s.catId}
                        onChange={e => updateSplit(s._k, 'catId', e.target.value)}
                        className="input-field text-[11px] py-1 flex-1 min-w-0"
                      >
                        <option value="">Category…</option>
                        {leafRows.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <div className="relative flex-shrink-0 w-20">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={s.amount}
                          onChange={e => updateSplit(s._k, 'amount', e.target.value)}
                          className="input-field text-[11px] py-1 pl-4 w-full no-spinner"
                        />
                      </div>
                      {splits.length > 2 && (
                        <button onMouseDown={() => removeSplit(s._k)}
                          className="text-gray-300 hover:text-red-500 dark:text-gray-700 dark:hover:text-red-400 text-sm leading-none flex-shrink-0">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Running total */}
                <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400">Allocated</span>
                    <span className={`font-semibold tabular-nums ${Math.abs(remaining) < 0.005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                      ${fmt2(allocated)} / ${fmt2(total)}
                    </span>
                  </div>
                  {Math.abs(remaining) >= 0.005 && (
                    <p className="text-[9.5px] text-amber-500 dark:text-amber-400">
                      {remaining > 0 ? `$${fmt2(remaining)} unallocated` : `$${fmt2(Math.abs(remaining))} over total`}
                    </p>
                  )}
                  <button onMouseDown={addSplit}
                    className="w-full text-[11px] py-1 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-brand-400 hover:text-brand-600 dark:hover:border-brand-600 dark:hover:text-brand-400 transition-colors">
                    + Add split
                  </button>
                  <button onMouseDown={confirmSplit} disabled={!splitValid}
                    className="w-full text-xs font-semibold py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors">
                    ✓ Confirm Split ({splits.length})
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Income: confirm ── */}
        {activeType === 'income' && (
          <div className="px-4 py-5 flex flex-col items-center gap-3">
            <span className="text-2xl">💰</span>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-snug">
              Confirm as income{txn.account ? ` into ${txn.account}` : ''}?
            </p>
            <button onMouseDown={() => confirm()}
              className="w-full text-xs font-semibold py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              ✓ Confirm Income
            </button>
          </div>
        )}

        {/* ── Transfer: pick destination account ── */}
        {activeType === 'transfer' && (
          <div className="px-3 py-3 space-y-2.5">
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Transfer to which account?</p>
            {allAccts.length > 0
              ? <select value={toAccount} onChange={e => setToAccount(e.target.value)} className="input-field text-xs py-1 w-full">
                  <option value="">Select account…</option>
                  {allAccts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              : <input autoFocus type="text" value={toAccount} onChange={e => setToAccount(e.target.value)}
                  placeholder="Account name" className="input-field text-xs py-1 w-full" />
            }
            <button onMouseDown={() => confirm()} disabled={!toAccount}
              className="w-full text-xs font-semibold py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 transition-colors">
              ✓ Confirm Transfer
            </button>
          </div>
        )}

        {/* ── Debt payment: pick debt account ── */}
        {activeType === 'debt_payment' && (
          <div className="px-3 py-3 space-y-2.5">
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Payment toward which debt?</p>
            {debtAccounts.length > 0
              ? <select value={debtId} onChange={e => setDebtId(e.target.value)} className="input-field text-xs py-1 w-full">
                  <option value="">Select debt account…</option>
                  {debtAccounts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              : <p className="text-[10px] text-amber-500 dark:text-amber-400">Add debt accounts in the Accounts tab first.</p>
            }
            {debtAccounts.length > 0 && !debtId && (
              <p className="text-[9px] text-gray-400 dark:text-gray-600">Leave blank to confirm without linking</p>
            )}
            <button onMouseDown={() => confirm()}
              className="w-full text-xs font-semibold py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors">
              ✓ Confirm Payment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Plaid transaction classifier ────────────────────────────────────────────
// Plaid sends transactions with: amount (positive=debit), category[], personal_finance_category
// We map them to our type model: expense | income | transfer | debt_payment
function classifyPlaidTxn(t) {
  const cats    = (t.category ?? []).map(c => c.toLowerCase())
  const pfc     = (t.personal_finance_category?.primary  ?? '').toLowerCase()
  const pfcDetail = (t.personal_finance_category?.detailed ?? '').toLowerCase()

  // ── Income ──
  if (cats[0] === 'income' || pfc.startsWith('income'))
    return { type: 'income' }
  // Negative Plaid amount = credit into the account = income (unless it's a transfer)
  if ((t.amount ?? 0) < 0 && !cats.includes('transfer') && pfc !== 'transfer_in' && pfc !== 'transfer_out')
    return { type: 'income' }

  // ── Transfers (internal moves between own accounts) ──
  if (
    pfc === 'transfer_in' || pfc === 'transfer_out' ||
    (cats.includes('transfer') && (cats.includes('internal account transfer') || cats.includes('deposit')))
  ) return { type: 'transfer' }

  // ── Debt payments ──
  if (pfcDetail.includes('credit_card_payment') || cats.includes('credit card'))
    return { type: 'debt_payment', debtLabel: 'Credit Card' }
  if (pfcDetail.includes('mortgage_payment') || (cats.includes('bank fees') && cats.includes('mortgage')))
    return { type: 'debt_payment', debtLabel: 'Mortgage' }
  if (pfc === 'loan_payments' || cats.includes('loan payment'))
    return { type: 'debt_payment', debtLabel: 'Loan Payment' }

  // ── Default: expense ──
  return { type: 'expense', categoryId: null }
}

// ─── Account link label ───────────────────────────────────────────────────────
// Renders an account name as a clickable link whenever onGoTo is provided.
// accountId may be null — in that case it still navigates but without highlighting.
function AcctLink({ name, accountId, onGoTo, className = '' }) {
  if (!onGoTo) return <span className={className}>{name}</span>
  return (
    <button
      onClick={() => onGoTo(accountId)}
      title="View in Accounts"
      className={`${className} text-left flex items-center gap-1 hover:underline underline-offset-2 decoration-current/40`}
    >
      {name}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className="w-2.5 h-2.5 opacity-40 flex-shrink-0">
        <path d="M2 10 L10 2M5 2h5v5" />
      </svg>
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExpenseTracker({ budget, onBudgetChange, onGoToAccounts, demoMode = false }) {
  const [year,           setYear]          = useState(new Date().getFullYear())
  const [dragTxn,        setDragTxn]       = useState(null)
  const [dragOver,       setDragOver]      = useState(null)
  const [popup,          setPopup]         = useState(null)
  const [showAddForm,    setShowAddForm]   = useState(false)
  const [demoOn,         setDemoOn]        = useState(false)
  const [showAssigned,   setShowAssigned]  = useState(false)
  const [classifyState,  setClassifyState] = useState(null) // { txn, anchorY }
  const [inboxYear,      setInboxYear]     = useState(null) // null = all years
  const [inboxMonths,    setInboxMonths]   = useState(new Set()) // empty = all months

  const transactions    = budget.transactions    ?? []
  const expenseSections = budget.expenseSections ?? []
  const cashAccounts    = budget.cashAccounts    ?? []
  const debtAccounts    = budget.debtAccounts    ?? []

  // ── Demo ──
  function toggleDemo(on) {
    setDemoOn(on)
    if (on) {
      const demos = buildDemoTransactions(budget)
      onBudgetChange({ ...budget, transactions: [...transactions.filter(t => !t.isDemo), ...demos] })
    } else {
      onBudgetChange({ ...budget, transactions: transactions.filter(t => !t.isDemo) })
    }
  }

  // Sync global demoMode prop → local toggleDemo
  useEffect(() => { toggleDemo(demoMode) }, [demoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Plaid ──
  function handlePlaidTransactions(imported) {
    const existingIds = new Set(transactions.filter(t => t.plaidId).map(t => t.plaidId))
    const fresh = imported
      .filter(t => {
        const pid = t.plaidId ?? t.transaction_id
        return pid && !existingIds.has(pid)
      })
      .map(t => {
        const pid            = t.plaidId ?? t.transaction_id
        const classification = classifyPlaidTxn(t)
        return {
          id:          newId(),
          plaidId:     pid,
          date:        t.date ?? '',
          description: t.description ?? t.name ?? '(no description)',
          amount:      Math.abs(t.amount ?? 0),   // always positive; sign encoded in `type`
          account:     t.account ?? '',
          ...classification,
        }
      })
    if (!fresh.length) return
    onBudgetChange({ ...budget, transactions: [...transactions, ...fresh] })
  }

  // ── CRUD ──
  const setTxns      = fn => onBudgetChange({ ...budget, transactions: fn(transactions) })
  const addTxn       = txn => setTxns(p => [...p, { ...txn, reviewed: false }])
  const deleteTxn    = id  => setTxns(p => p.filter(t => t.id !== id))
  // Sending back to inbox re-opens the review flow
  const unassignTxn  = id  => setTxns(p => p.map(t => t.id === id ? { ...t, categoryId: null, reviewed: false } : t))
  const assignTxn    = (id, catId) => setTxns(p => p.map(t => t.id === id ? { ...t, categoryId: catId, reviewed: true } : t))
  // Classify: applies type + reviewed:true + type-specific fields.
  // If updates._splits present, the original is deleted and replaced by the split child transactions.
  const classifyTxn  = (id, updates) => {
    if (updates._splits) {
      setTxns(p => [...p.filter(t => t.id !== id), ...updates._splits])
    } else {
      setTxns(p => p.map(t => t.id === id ? { ...t, ...updates } : t))
    }
  }

  // ── Derived ──
  // Only reviewed transactions appear in the monthly table
  const yearTxns = transactions.filter(t => t.date && yearOf(t.date) === year && t.reviewed !== false)
  const expTxns  = yearTxns.filter(t => txnType(t) === 'expense')
  const incTxns  = yearTxns.filter(t => txnType(t) === 'income')
  const debtTxns = yearTxns.filter(t => txnType(t) === 'debt_payment')
  const xferTxns = yearTxns.filter(t => txnType(t) === 'transfer')

  // unreviewed = explicitly marked reviewed:false (inbox review queue)
  // reviewed:undefined (pre-existing / migrated data) is treated as reviewed
  const unreviewed  = [...transactions]
    .filter(t => t.reviewed === false)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  // ── Inbox filter — year and month are independent toggles ──
  const unreviewedFiltered = unreviewed.filter(t => {
    if (!t.date) return true
    if (inboxYear    !== null         && yearOf(t.date)  !== inboxYear)        return false
    if (inboxMonths.size > 0          && !inboxMonths.has(monthOf(t.date)))    return false
    return true
  })
  const assigned    = transactions
    .filter(t => t.reviewed !== false && txnType(t) === 'expense' && !!t.categoryId)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  const assignedFiltered = assigned.filter(t => {
    if (!t.date) return true
    if (inboxYear    !== null  && yearOf(t.date)  !== inboxYear)     return false
    if (inboxMonths.size > 0  && !inboxMonths.has(monthOf(t.date))) return false
    return true
  })

  // ── Expense category rows ──
  const allRows = expenseSections.flatMap(section => [
    { id: section.id, name: section.name, isSection: true },
    ...section.items.flatMap(item => {
      const hasSubs = item.subItems?.length > 0
      return hasSubs
        ? [
            { id: item.id, name: item.name, isGroup: true, sectionId: section.id },
            ...item.subItems.map(sub => ({ id: sub.id, name: sub.name, sectionId: section.id, parentId: item.id, indent: true })),
          ]
        : [{ id: item.id, name: item.name, sectionId: section.id }]
    }),
  ])

  // ── Expense helpers ──
  const getExpCell  = (catId, mIdx) => expTxns.filter(t => t.categoryId === catId && monthOf(t.date) === mIdx)
  const getExpTotal = (catId, mIdx) => getExpCell(catId, mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)
  const getItemIds  = row => {
    if (row.isSection) return allRows.filter(r => !r.isSection && r.sectionId === row.id).map(r => r.id)
    if (row.isGroup)   return allRows.filter(r => r.parentId === row.id).map(r => r.id)
    return [row.id]
  }
  const getAggExpTotal  = (row, mIdx) => getItemIds(row).reduce((s, id) => s + getExpTotal(id, mIdx), 0)
  const getRowExpTotal  = row => MONTHS.reduce((s, _, mIdx) => s + getAggExpTotal(row, mIdx), 0)
  const getExpMonthSum  = mIdx => allRows.filter(r => !r.isSection && !r.isGroup).reduce((s, r) => s + getExpTotal(r.id, mIdx), 0)
  const expYTD          = MONTHS.reduce((s, _, mIdx) => s + getExpMonthSum(mIdx), 0)

  // ── Income helpers ──
  const incomeAccts    = [...new Set(incTxns.map(t => t.account || '(No Account)'))]
  const getIncCell     = (acct, mIdx) => incTxns.filter(t => (t.account || '(No Account)') === acct && monthOf(t.date) === mIdx)
  const getIncTotal    = (acct, mIdx) => getIncCell(acct, mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)
  const getIncRowSum   = acct => MONTHS.reduce((s, _, mIdx) => s + getIncTotal(acct, mIdx), 0)
  const getIncMonthSum = mIdx => incTxns.filter(t => monthOf(t.date) === mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)
  const incYTD         = MONTHS.reduce((s, _, mIdx) => s + getIncMonthSum(mIdx), 0)

  // ── Debt payment helpers ──
  // Group key: real debtAccountId if present, else fall back to debtLabel, else description
  const debtKey     = t => t.debtAccountId || `_lbl:${t.debtLabel || t.description}`
  const debtLabel   = did => {
    const acct = debtAccounts.find(d => d.id === did)
    if (acct) return acct.name
    if (did.startsWith('_lbl:')) return did.slice(5)
    return 'Debt Account'
  }
  const debtRealId  = did => debtAccounts.find(d => d.id === did)?.id ?? null
  const uniqueDebtIds   = [...new Set(debtTxns.map(debtKey))]
  const getDebtCell     = (did, mIdx) => debtTxns.filter(t => debtKey(t) === did && monthOf(t.date) === mIdx)
  const getDebtTotal    = (did, mIdx) => getDebtCell(did, mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)
  const getDebtRowSum   = did => MONTHS.reduce((s, _, mIdx) => s + getDebtTotal(did, mIdx), 0)
  const getDebtMonthSum = mIdx => debtTxns.filter(t => monthOf(t.date) === mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)

  // ── Transfer helpers ──
  const uniqueToAccts   = [...new Set(xferTxns.map(t => t.toAccount || '(Unknown)'))]
  const getXferCell     = (acct, mIdx) => xferTxns.filter(t => (t.toAccount || '(Unknown)') === acct && monthOf(t.date) === mIdx)
  const getXferTotal    = (acct, mIdx) => getXferCell(acct, mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)
  const getXferRowSum   = acct => MONTHS.reduce((s, _, mIdx) => s + getXferTotal(acct, mIdx), 0)
  const getXferMonthSum = mIdx => xferTxns.filter(t => monthOf(t.date) === mIdx).reduce((s, t) => s + (t.amount ?? 0), 0)

  // ── Account ID lookup (for linking to Accounts page) ──
  const findCashId = name => cashAccounts.find(a => a.name === name)?.id ?? null
  const findInvId  = name => (budget.investmentAccounts ?? []).find(a => a.name === name)?.id ?? null
  // For transfers, check cash accounts first, then investment accounts
  const findAcctId = name => findCashId(name) ?? findInvId(name) ?? null

  // ── Net ──
  const getNetMth = mIdx => getIncMonthSum(mIdx) - getExpMonthSum(mIdx) - getDebtMonthSum(mIdx) - getXferMonthSum(mIdx)
  const netYTD    = MONTHS.reduce((s, _, mIdx) => s + getNetMth(mIdx), 0)

  // ── Drag & drop (expenses only) ──
  const onDragStart = txn  => { setDragTxn(txn); setClassifyState(null) }
  const onDragEnd   = ()   => { setDragTxn(null); setDragOver(null) }
  const onDragOver  = (e, catId) => { e.preventDefault(); if (catId !== dragOver) setDragOver(catId) }
  const onDrop      = (e, catId) => { e.preventDefault(); if (dragTxn) assignTxn(dragTxn.id, catId); setDragTxn(null); setDragOver(null) }

  // ── Popup ──
  function openPopup(kind, key, mIdx, title) {
    const txns = kind === 'expense'  ? getExpCell(key, mIdx)
               : kind === 'income'   ? getIncCell(key, mIdx)
               : kind === 'debt'     ? getDebtCell(key, mIdx)
               :                       getXferCell(key, mIdx)
    if (!txns.length) return
    setPopup({ kind, key, monthIdx: mIdx, title })
  }

  const popupTxns = popup
    ? popup.kind === 'expense'  ? getExpCell(popup.key, popup.monthIdx)
    : popup.kind === 'income'   ? getIncCell(popup.key, popup.monthIdx)
    : popup.kind === 'debt'     ? getDebtCell(popup.key, popup.monthIdx)
    :                              getXferCell(popup.key, popup.monthIdx)
    : []

  // ── Helpers for inbox grouping ──
  function groupByAccount(txnList) {
    const groups = []
    const seen   = {}
    for (const txn of txnList) {
      const key = txn.account || '(No account)'
      if (!seen[key]) { seen[key] = []; groups.push({ account: key, txns: seen[key] }) }
      seen[key].push(txn)
    }
    return groups
  }

  function groupByCategory(txnList) {
    const groups = []
    const seen   = {}
    for (const txn of txnList) {
      const key = txn.categoryId ?? '__none'
      if (!seen[key]) {
        seen[key] = []
        const row = allRows.find(r => r.id === key)
        groups.push({ catId: key, label: row?.name ?? '(Uncategorized)', txns: seen[key] })
      }
      seen[key].push(txn)
    }
    return groups
  }

  return (
    <div className="flex flex-1 min-h-0 h-full overflow-hidden">

      {/* ══════════════════════════════════════════════════════════════════════
          Monthly Table
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 overflow-auto">
        <table className="border-collapse text-xs w-full">
          <thead className="sticky top-0 z-20">
            <tr className="bg-white dark:bg-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
              <th className="sticky left-0 z-30 bg-white dark:bg-gray-900 px-4 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-gray-800 min-w-[180px] whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { setYear(y => y - 1); setInboxMonths(new Set()) }} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">‹</button>
                  <button
                    onClick={() => { setInboxYear(v => v === year ? null : year); setInboxMonths(new Set()) }}
                    title={inboxYear === year ? `Show all years in inbox` : `Filter inbox to ${year}`}
                    className={`text-sm font-bold rounded px-0.5 transition-colors select-none
                      ${inboxYear === year
                        ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                        : 'text-gray-800 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400'}`}
                  >{year}</button>
                  <button onClick={() => { setYear(y => y + 1); setInboxMonths(new Set()) }} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">›</button>
                </div>
              </th>
              {MONTHS.map((m, mi) => {
                const isActive = inboxMonths.has(mi)
                return (
                  <th
                    key={m}
                    onClick={() => {
                      setInboxYear(year)
                      setInboxMonths(prev => {
                        const next = new Set(prev)
                        if (next.has(mi)) { next.delete(mi) } else { next.add(mi) }
                        return next
                      })
                    }}
                    title={isActive ? `Remove ${m} from filter` : `Add ${m} to filter`}
                    className={`px-2 py-2.5 text-center font-semibold min-w-[82px] whitespace-nowrap cursor-pointer select-none transition-colors
                      ${isActive
                        ? 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                        : 'text-gray-400 dark:text-gray-500 hover:text-brand-500 dark:hover:text-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/10'}`}
                  >
                    {m}{isActive && <span className="ml-0.5 text-[8px] align-super">●</span>}
                  </th>
                )
              })}
              <th className="px-3 py-2.5 text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[90px] whitespace-nowrap border-l border-gray-100 dark:border-gray-800">Total</th>
            </tr>
          </thead>

          <tbody>

            {/* ════ INCOME ════ */}
            <tr className="bg-emerald-50/60 dark:bg-emerald-900/10 border-y border-emerald-100 dark:border-emerald-900/30">
              <td colSpan={14} className="sticky left-0 z-10 bg-emerald-50/60 dark:bg-emerald-900/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                📈 Income
              </td>
            </tr>

            {incomeAccts.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-2 text-center text-[10px] text-gray-300 dark:text-gray-700 italic">
                  No income transactions for {year}
                </td>
              </tr>
            )}

            {incomeAccts.map(acct => {
              const rowTotal = getIncRowSum(acct)
              return (
                <tr key={`inc_${acct}`} className="border-b border-gray-50 dark:border-gray-800/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 transition-colors">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border-r border-gray-100 dark:border-gray-800">
                    <AcctLink name={acct} accountId={findCashId(acct)} onGoTo={onGoToAccounts} />
                  </td>
                  {MONTHS.map((_, mIdx) => {
                    const total = getIncTotal(acct, mIdx)
                    return (
                      <td key={mIdx} onClick={() => openPopup('income', acct, mIdx, acct)}
                        className={`px-2 py-2 text-center tabular-nums text-[11px] ${
                          total > 0
                            ? 'cursor-pointer font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            : 'text-gray-200 dark:text-gray-800'
                        }`}>
                        {total > 0 ? `$${fmt2(total)}` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center tabular-nums text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border-l border-gray-100 dark:border-gray-800">
                    {rowTotal > 0 ? `$${fmt2(rowTotal)}` : '—'}
                  </td>
                </tr>
              )
            })}

            {incomeAccts.length > 1 && (
              <tr className="bg-emerald-50/40 dark:bg-emerald-900/10">
                <td className="sticky left-0 z-10 bg-emerald-50/40 dark:bg-emerald-900/10 px-4 py-1.5 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-500 border-r border-gray-100 dark:border-gray-800">
                  Income Total
                </td>
                {MONTHS.map((_, mIdx) => {
                  const t = getIncMonthSum(mIdx)
                  return <td key={mIdx} className="px-2 py-1.5 text-center tabular-nums text-[11px] font-semibold text-emerald-600 dark:text-emerald-500">{t > 0 ? `$${fmt2(t)}` : ''}</td>
                })}
                <td className="px-3 py-1.5 text-center tabular-nums text-[11px] font-bold text-emerald-700 dark:text-emerald-400 border-l border-gray-100 dark:border-gray-800">
                  {incYTD > 0 ? `$${fmt2(incYTD)}` : ''}
                </td>
              </tr>
            )}

            {/* ════ EXPENSES ════ */}
            <tr className="bg-rose-50/60 dark:bg-rose-900/10 border-y border-rose-100 dark:border-rose-900/30">
              <td colSpan={14} className="sticky left-0 z-10 bg-rose-50/60 dark:bg-rose-900/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-400">
                💸 Expenses
              </td>
            </tr>

            {allRows.map(row => {
              if (row.isSection) {
                return (
                  <tr key={row.id} className="bg-gray-50 dark:bg-gray-800/40">
                    <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/40 px-4 py-1.5 font-bold text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 border-r border-gray-100 dark:border-gray-800">
                      {row.name}
                    </td>
                    {MONTHS.map((_, mIdx) => {
                      const total = getAggExpTotal(row, mIdx)
                      return <td key={mIdx} className="px-2 py-1.5 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500 tabular-nums">{total > 0 ? `$${fmt2(total)}` : ''}</td>
                    })}
                    <td className="px-3 py-1.5 text-center text-[11px] font-semibold text-gray-500 dark:text-gray-400 tabular-nums border-l border-gray-100 dark:border-gray-800">
                      {(() => { const t = getRowExpTotal(row); return t > 0 ? `$${fmt2(t)}` : '' })()}
                    </td>
                  </tr>
                )
              }

              if (row.isGroup) {
                return (
                  <tr key={row.id} className="bg-gray-50/50 dark:bg-gray-800/20">
                    <td className="sticky left-0 z-10 bg-gray-50/50 dark:bg-gray-800/20 pl-6 pr-4 py-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-gray-800">
                      {row.name}
                    </td>
                    {MONTHS.map((_, mIdx) => {
                      const total = getAggExpTotal(row, mIdx)
                      return <td key={mIdx} className="px-2 py-1 text-center text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{total > 0 ? `$${fmt2(total)}` : ''}</td>
                    })}
                    <td className="px-3 py-1 text-center text-[11px] text-gray-500 dark:text-gray-400 tabular-nums border-l border-gray-100 dark:border-gray-800">
                      {(() => { const t = getRowExpTotal(row); return t > 0 ? `$${fmt2(t)}` : '' })()}
                    </td>
                  </tr>
                )
              }

              // Leaf — droppable
              const isTarget = dragTxn && dragOver === row.id
              const rowTotal = getRowExpTotal(row)
              return (
                <tr key={row.id}
                  onDragOver={e => onDragOver(e, row.id)}
                  onDrop={e => onDrop(e, row.id)}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null) }}
                  className={`group border-b border-gray-50 dark:border-gray-800/60 transition-colors ${
                    isTarget ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/20'
                  }`}>
                  <td className={`sticky left-0 z-10 px-4 py-2 border-r border-gray-100 dark:border-gray-800 transition-colors ${
                    isTarget ? 'bg-brand-50 dark:bg-brand-900/20' : 'bg-white dark:bg-gray-900 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/20'
                  } ${row.indent ? 'pl-8' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-700 dark:text-gray-300 font-medium">{row.name}</span>
                      {isTarget && <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-100 dark:bg-brand-900/40 px-1.5 py-0.5 rounded-full">Drop here</span>}
                    </div>
                  </td>
                  {MONTHS.map((_, mIdx) => {
                    const cellTxns = getExpCell(row.id, mIdx)
                    const total    = cellTxns.reduce((s, t) => s + (t.amount ?? 0), 0)
                    const hasData  = cellTxns.length > 0
                    return (
                      <td key={mIdx} onClick={() => hasData && openPopup('expense', row.id, mIdx, row.name)}
                        className={`px-2 py-2 text-center tabular-nums border-b border-gray-50 dark:border-gray-800/60 transition-colors ${
                          hasData
                            ? 'cursor-pointer text-gray-800 dark:text-gray-200 font-medium hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-300'
                            : 'text-gray-200 dark:text-gray-800'
                        }`}>
                        {hasData
                          ? <span className="relative text-[11px]">${fmt2(total)}<span className="absolute -top-1 -right-2.5 text-[8px] text-brand-400 font-bold">{cellTxns.length}</span></span>
                          : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center tabular-nums text-[11px] font-semibold text-gray-600 dark:text-gray-300 border-l border-gray-100 dark:border-gray-800 border-b border-gray-50 dark:border-gray-800/60">
                    {rowTotal > 0 ? `$${fmt2(rowTotal)}` : '—'}
                  </td>
                </tr>
              )
            })}

            {/* Expense totals */}
            <tr className="bg-rose-50/40 dark:bg-rose-900/10">
              <td className="sticky left-0 z-10 bg-rose-50/40 dark:bg-rose-900/10 px-4 py-1.5 text-[10px] font-bold uppercase text-rose-600 dark:text-rose-500 border-r border-gray-100 dark:border-gray-800">
                Expenses Total
              </td>
              {MONTHS.map((_, mIdx) => {
                const t = getExpMonthSum(mIdx)
                return <td key={mIdx} className="px-2 py-1.5 text-center tabular-nums text-[11px] font-semibold text-rose-600 dark:text-rose-500">{t > 0 ? `$${fmt2(t)}` : ''}</td>
              })}
              <td className="px-3 py-1.5 text-center tabular-nums text-[11px] font-bold text-rose-700 dark:text-rose-400 border-l border-gray-100 dark:border-gray-800">
                {expYTD > 0 ? `$${fmt2(expYTD)}` : ''}
              </td>
            </tr>

            {/* ════ DEBT PAYMENTS ════ */}
            {(uniqueDebtIds.length > 0 || debtAccounts.length > 0) && (
              <tr className="bg-violet-50/60 dark:bg-violet-900/10 border-y border-violet-100 dark:border-violet-900/30">
                <td colSpan={14} className="sticky left-0 z-10 bg-violet-50/60 dark:bg-violet-900/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400">
                  💳 Debt Payments
                </td>
              </tr>
            )}

            {uniqueDebtIds.map(did => {
              const name     = debtLabel(did)
              const realId   = debtRealId(did)
              const rowTotal = getDebtRowSum(did)
              return (
                <tr key={`debt_${did}`} className="border-b border-gray-50 dark:border-gray-800/60 hover:bg-violet-50/40 dark:hover:bg-violet-900/10 transition-colors">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2 text-[11px] font-medium text-violet-700 dark:text-violet-400 border-r border-gray-100 dark:border-gray-800">
                    <AcctLink name={name} accountId={realId} onGoTo={onGoToAccounts} />
                  </td>
                  {MONTHS.map((_, mIdx) => {
                    const total = getDebtTotal(did, mIdx)
                    return (
                      <td key={mIdx} onClick={() => openPopup('debt', did, mIdx, name)}
                        className={`px-2 py-2 text-center tabular-nums text-[11px] ${
                          total > 0
                            ? 'cursor-pointer font-semibold text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                            : 'text-gray-200 dark:text-gray-800'
                        }`}>
                        {total > 0 ? `$${fmt2(total)}` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center tabular-nums text-[11px] font-semibold text-violet-700 dark:text-violet-400 border-l border-gray-100 dark:border-gray-800">
                    {rowTotal > 0 ? `$${fmt2(rowTotal)}` : '—'}
                  </td>
                </tr>
              )
            })}

            {uniqueDebtIds.length === 0 && debtAccounts.length > 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-2 text-center text-[10px] text-gray-300 dark:text-gray-700 italic">
                  No debt payments recorded for {year}
                </td>
              </tr>
            )}

            {/* ════ TRANSFERS ════ */}
            {uniqueToAccts.length > 0 && (
              <tr className="bg-sky-50/60 dark:bg-sky-900/10 border-y border-sky-100 dark:border-sky-900/30">
                <td colSpan={14} className="sticky left-0 z-10 bg-sky-50/60 dark:bg-sky-900/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-400">
                  🔄 Transfers
                </td>
              </tr>
            )}

            {uniqueToAccts.map(toAcct => {
              const rowTotal = getXferRowSum(toAcct)
              return (
                <tr key={`xfer_${toAcct}`} className="border-b border-gray-50 dark:border-gray-800/60 hover:bg-sky-50/40 dark:hover:bg-sky-900/10 transition-colors">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2 text-[11px] font-medium text-sky-700 dark:text-sky-400 border-r border-gray-100 dark:border-gray-800">
                    <AcctLink name={`→ ${toAcct}`} accountId={findAcctId(toAcct)} onGoTo={onGoToAccounts} />
                  </td>
                  {MONTHS.map((_, mIdx) => {
                    const total = getXferTotal(toAcct, mIdx)
                    return (
                      <td key={mIdx} onClick={() => openPopup('transfer', toAcct, mIdx, `→ ${toAcct}`)}
                        className={`px-2 py-2 text-center tabular-nums text-[11px] ${
                          total > 0
                            ? 'cursor-pointer font-semibold text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20'
                            : 'text-gray-200 dark:text-gray-800'
                        }`}>
                        {total > 0 ? `$${fmt2(total)}` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center tabular-nums text-[11px] font-semibold text-sky-700 dark:text-sky-400 border-l border-gray-100 dark:border-gray-800">
                    {rowTotal > 0 ? `$${fmt2(rowTotal)}` : '—'}
                  </td>
                </tr>
              )
            })}

            {/* ════ NET CASH FLOW ════ */}
            <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <td className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-[11px] font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">
                Net Cash Flow
              </td>
              {MONTHS.map((_, mIdx) => {
                const net = getNetMth(mIdx)
                return (
                  <td key={mIdx} className={`px-2 py-2.5 text-center tabular-nums text-[11px] font-bold ${
                    net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-300 dark:text-gray-700'
                  }`}>
                    {net !== 0 ? `${net > 0 ? '+' : '−'}$${fmt2(Math.abs(net))}` : '—'}
                  </td>
                )
              })}
              <td className={`px-3 py-2.5 text-center tabular-nums text-[11px] font-bold border-l border-gray-200 dark:border-gray-700 ${
                netYTD > 0 ? 'text-emerald-600 dark:text-emerald-400' : netYTD < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-300 dark:text-gray-700'
              }`}>
                {netYTD !== 0 ? `${netYTD > 0 ? '+' : '−'}$${fmt2(Math.abs(netYTD))}` : '—'}
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Transaction Inbox
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="w-72 flex-shrink-0 flex flex-col border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">Transactions</h3>
            {demoOn && (
              <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-md px-1.5 py-0.5 flex-shrink-0">DEMO</span>
            )}
            <button onClick={() => setShowAddForm(v => !v)}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0">
              + Add
            </button>
          </div>
          <div className="flex gap-3 mt-1 flex-wrap">
            {unreviewed.length > 0 && <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">{unreviewed.length} to review</span>}
            <span className="text-[10px] text-gray-400">{assigned.length} assigned</span>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="flex-shrink-0">
            <AddTxnForm
              onAdd={txn => { addTxn(txn); setShowAddForm(false) }}
              onCancel={() => setShowAddForm(false)}
              cashAccounts={cashAccounts}
              debtAccounts={debtAccounts}
            />
          </div>
        )}

        {/* Plaid */}
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <PlaidConnect compact label="Connect Bank via Plaid" onTransactions={handlePlaidTransactions} />
        </div>

        {/* Drag hint */}
        {dragTxn && (
          <div className="px-3 py-2 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-100 dark:border-brand-800 flex-shrink-0">
            <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium text-center">↖ Drag onto a category row to assign</p>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Needs Review (all unreviewed transactions, any type) ── */}
          {unreviewed.length > 0 && (
            <>
              <div className="sticky top-0 z-10 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30">
                <div className="px-3 py-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">📥 Needs Review</span>
                  <span className="ml-auto text-[10px] text-amber-500 tabular-nums">
                    {unreviewedFiltered.length}{unreviewedFiltered.length !== unreviewed.length ? `/${unreviewed.length}` : ''}
                  </span>
                </div>
                {(inboxYear !== null || inboxMonths.size > 0) && (
                  <div className="px-3 pb-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] text-amber-500/80 dark:text-amber-500/60 flex-shrink-0">Filtered to</span>
                    <div className="flex gap-1 flex-wrap flex-1 min-w-0">
                      {inboxYear !== null && inboxMonths.size === 0 && (
                        <span className="text-[9px] font-semibold bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded-full">{inboxYear}</span>
                      )}
                      {inboxMonths.size > 0 && [...inboxMonths].sort((a,b) => a-b).map(mi => (
                        <span key={mi} className="text-[9px] font-semibold bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded-full">
                          {inboxYear ?? year} · {MONTHS[mi]}
                        </span>
                      ))}
                    </div>
                    <button onClick={() => { setInboxYear(null); setInboxMonths(new Set()) }} className="text-[9px] text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 flex-shrink-0">✕</button>
                  </div>
                )}
                <div className="px-3 pb-1.5 text-[9.5px] text-amber-500/80 dark:text-amber-600/70 italic leading-tight">
                  Click to classify or split · expenses can also be dragged to a table row
                </div>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {unreviewedFiltered.map(txn => {
                  const isClassifying = classifyState?.txn.id === txn.id
                  const meta = TYPE_META[txnType(txn)] ?? TYPE_META.expense
                  const isExp = txnType(txn) === 'expense'
                  return (
                    <div
                      key={txn.id}
                      draggable={isExp}
                      onDragStart={isExp ? () => { setClassifyState(null); onDragStart(txn) } : undefined}
                      onDragEnd={isExp ? onDragEnd : undefined}
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setClassifyState(prev =>
                          prev?.txn.id === txn.id ? null : { txn, anchorY: rect.top + rect.height / 2 }
                        )
                      }}
                      className={`px-3 py-2 cursor-pointer select-none transition-colors group
                        ${isClassifying ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}
                        ${dragTxn?.id === txn.id ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${meta.cls}`}>{meta.short}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-gray-400 tabular-nums">{fmtDate(txn.date)}{txn.account ? ` · ${txn.account}` : ''}</p>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate leading-snug">{txn.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-all
                            ${isClassifying
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : 'opacity-0 group-hover:opacity-100 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                            }`}>
                            {isClassifying ? '▲' : 'Review'}
                          </span>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">${fmt2(txn.amount ?? 0)}</span>
                          <button onClick={e => { e.stopPropagation(); deleteTxn(txn.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 dark:text-gray-700 dark:hover:text-red-400 text-sm leading-none transition-all"
                            title="Delete">✕</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Empty state */}
          {unreviewed.length === 0 && assigned.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 dark:text-gray-600">
              <span className="text-2xl">✓</span>
              <span className="text-xs">No transactions</span>
            </div>
          )}

          {/* ── Assigned Expenses (collapsible) ── */}
          {assigned.length > 0 && (
            <>
              {/* Section header — click to toggle */}
              <button
                onClick={() => setShowAssigned(v => !v)}
                className="w-full sticky top-0 z-10 px-3 py-1 bg-gray-50 dark:bg-gray-800/60 border-y border-gray-100 dark:border-gray-800 flex items-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  ✓ Assigned
                </span>
                <span className="ml-auto text-[10px] text-gray-400 tabular-nums mr-1">
                  {assignedFiltered.length}{assignedFiltered.length !== assigned.length ? `/${assigned.length}` : ''}
                </span>
                <span className="text-[9px] text-gray-300 dark:text-gray-600">{showAssigned ? '▲' : '▼'}</span>
              </button>

              {showAssigned && groupByCategory(assignedFiltered).map(({ catId, label, txns: grpTxns }) => (
                <div key={catId}>
                  {/* Category sub-header */}
                  <div className="px-3 py-0.5 bg-rose-50/60 dark:bg-rose-900/10 border-b border-rose-100/60 dark:border-rose-900/20 flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400 truncate">{label}</span>
                    <span className="ml-auto text-[9px] text-gray-400 tabular-nums flex-shrink-0">{grpTxns.length}</span>
                  </div>

                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {grpTxns.map(txn => (
                      <div key={txn.id} draggable
                        onDragStart={() => onDragStart(txn)} onDragEnd={onDragEnd}
                        className={`px-3 py-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group ${dragTxn?.id === txn.id ? 'opacity-40' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-gray-400 tabular-nums">{fmtDate(txn.date)}</p>
                            <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate leading-snug">{txn.description}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">${fmt2(txn.amount ?? 0)}</span>
                            <button onClick={() => unassignTxn(txn.id)} title="Send back to inbox to reclassify"
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-amber-500 dark:text-gray-700 dark:hover:text-amber-400 text-sm leading-none transition-all">↩</button>
                            <button onClick={() => deleteTxn(txn.id)} title="Delete"
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 dark:text-gray-700 dark:hover:text-red-400 text-sm leading-none transition-all">✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}


        </div>
      </div>

      {/* ── Classify popover (all types) ── */}
      {classifyState && (
        <ClassifyPopover
          txn={classifyState.txn}
          anchorY={classifyState.anchorY}
          allRows={allRows}
          cashAccounts={cashAccounts}
          investmentAccounts={budget.investmentAccounts ?? []}
          debtAccounts={debtAccounts}
          onClassify={updates => { classifyTxn(classifyState.txn.id, updates); setClassifyState(null) }}
          onClose={() => setClassifyState(null)}
        />
      )}

      {/* ── Cell popup ── */}
      {popup && popupTxns.length > 0 && (
        <CellPopup
          txns={popupTxns}
          title={popup.title}
          subtitle={`${MONTHS[popup.monthIdx]} ${year}`}
          debtAccounts={debtAccounts}
          onClose={() => setPopup(null)}
          onUnassign={popup.kind === 'expense' ? id => {
            unassignTxn(id)
            if (getExpCell(popup.key, popup.monthIdx).length <= 1) setPopup(null)
          } : null}
          onDelete={id => {
            deleteTxn(id)
            // close if last txn deleted
            const remaining = popupTxns.filter(t => t.id !== id)
            if (!remaining.length) setPopup(null)
          }}
        />
      )}
    </div>
  )
}
