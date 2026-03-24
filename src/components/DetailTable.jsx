import { useState, useRef } from 'react'
import { InflowCell, OutflowCell } from './CashflowCells.jsx'

function fmt(n) {
  if (n == null || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function fmtFull(n) {
  if (n == null) return '—'
  return `$${Math.round(Math.abs(n)).toLocaleString()}`
}

function pct(n) {
  if (!n) return '—'
  return `${n.toFixed(1)}%`
}

// ─── Tooltip for account flow breakdown ──────────────────────────────────────

function FlowLine({ label, value, color = 'text-gray-500 dark:text-gray-400', bold = false, indent = false }) {
  if (!value) return null
  const isNeg = value < 0
  return (
    <div className={`flex justify-between gap-3 ${indent ? 'pl-3 opacity-90' : ''} ${bold ? 'font-semibold pt-1 border-t border-gray-100 dark:border-gray-700 mt-1' : ''} ${color}`}>
      <span className="leading-snug min-w-0 break-words">{label}</span>
      <span className="tabular-nums whitespace-nowrap ml-2 shrink-0">{isNeg ? '−' : ''}{fmtFull(value)}</span>
    </div>
  )
}

function AccountTooltip({ row, type }) {
  const ref   = useRef(null)
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const timer = useRef(null)
  const enter = (e) => { clearTimeout(timer.current); setPos({ x: e.clientX, y: e.clientY }); setShow(true) }
  const move  = (e) => { setPos({ x: e.clientX, y: e.clientY }) }
  const leave = ()  => { timer.current = setTimeout(() => setShow(false), 250) }

  // Compute flows for this account type
  let balance = 0, withdrawn = 0, deposited = 0, lines = []

  if (type === 'rrif') {
    balance   = row.rrifTotal ?? 0
    withdrawn = row.rrifWithdrawn ?? 0
    lines = [
      withdrawn > 0 && { label: 'RRIF Withdrawn', value: -withdrawn, color: 'text-red-500 dark:text-red-400' },
      (row.incomeSurplusTfsa > 0 || row.incomeSurplusNonReg > 0) && { label: 'Surplus Reinvested', value: (row.incomeSurplusTfsa ?? 0) + (row.incomeSurplusNonReg ?? 0), color: 'text-emerald-600 dark:text-emerald-400', note: true },
    ]
  } else if (type === 'tfsa') {
    balance   = row.tfsaTotal ?? 0
    withdrawn = row.tfsaWithdrawn ?? 0
    const xferGross = row.nonRegToTfsaGross ?? 0
    const xferTax   = row.nonRegToTfsaTax   ?? 0
    const xferNet   = row.nonRegToTfsaNet   ?? 0
    const surplusIn = (row.incomeSurplusTfsa ?? 0) + (row.inflowSurplusTfsa ?? 0) + xferNet
    deposited = surplusIn
    lines = [
      withdrawn > 0 && { label: 'Spending W/D', value: -withdrawn, color: 'text-red-500 dark:text-red-400' },
      (row.incomeSurplusTfsa ?? 0) > 0 && { label: 'RRIF Surplus → TFSA', value: row.incomeSurplusTfsa, color: 'text-emerald-600 dark:text-emerald-400' },
      (row.inflowSurplusTfsa ?? 0) > 0 && { label: 'Inflow Surplus → TFSA', value: row.inflowSurplusTfsa, color: 'text-emerald-600 dark:text-emerald-400' },
      // Non-reg transfer: show gross → tax haircut → net when there is a tax cost
      xferGross > 0 && !xferTax && { label: 'Non-Reg Transfer → TFSA', value: xferNet, color: 'text-emerald-600 dark:text-emerald-400' },
      xferGross > 0 && xferTax > 0 && { label: 'Non-Reg Transfer (gross)', value: xferGross, color: 'text-emerald-600 dark:text-emerald-400' },
      xferTax  > 0 && { label: '↳ Cap gains tax', value: -xferTax, color: 'text-orange-500 dark:text-orange-400', indent: true },
      xferTax  > 0 && { label: '↳ Net received by TFSA', value: xferNet, color: 'text-emerald-700 dark:text-emerald-300', indent: true },
    ]
  } else if (type === 'nonreg') {
    balance   = row.nonRegTotal ?? 0
    withdrawn = row.nonRegWithdrawn ?? 0
    const surplusIn = (row.incomeSurplusNonReg ?? 0) + (row.inflowSurplusNonReg ?? 0)
    const xferGross = row.nonRegToTfsaGross ?? 0
    const xferTax   = row.nonRegToTfsaTax   ?? 0
    const xferNet   = row.nonRegToTfsaNet   ?? 0
    deposited = surplusIn
    lines = [
      withdrawn > 0 && { label: 'Spending W/D', value: -withdrawn, color: 'text-red-500 dark:text-red-400' },
      // Transfer: show gross exit, then break down tax cost + net landing in TFSA
      xferGross > 0 && !xferTax && { label: 'Transfer → TFSA', value: -xferGross, color: 'text-amber-600 dark:text-amber-400' },
      xferGross > 0 && xferTax > 0 && { label: 'Transfer → TFSA (gross)', value: -xferGross, color: 'text-amber-600 dark:text-amber-400' },
      xferTax   > 0 && { label: '↳ Cap gains tax', value: -xferTax, color: 'text-orange-500 dark:text-orange-400', indent: true },
      xferTax   > 0 && { label: '↳ Net lands in TFSA', value: xferNet, color: 'text-emerald-600 dark:text-emerald-400', indent: true },
      (row.incomeSurplusNonReg ?? 0) > 0 && { label: 'RRIF Surplus → Non-Reg', value: row.incomeSurplusNonReg, color: 'text-emerald-600 dark:text-emerald-400' },
      (row.inflowSurplusNonReg ?? 0) > 0 && { label: 'Inflow Surplus → Non-Reg', value: row.inflowSurplusNonReg, color: 'text-emerald-600 dark:text-emerald-400' },
    ]
  } else if (type === 'portfolio') {
    balance = row.portfolioTotal ?? 0
    const totalWithdrawn = row.grossWithdrawal ?? 0
    const totalDeposited = (row.incomeSurplusTfsa ?? 0) + (row.incomeSurplusNonReg ?? 0)
      + (row.inflowSurplusTfsa ?? 0) + (row.inflowSurplusNonReg ?? 0)
    lines = [
      (row.rrifWithdrawn ?? 0) > 0 && { label: 'RRIF W/D', value: -(row.rrifWithdrawn), color: 'text-red-500 dark:text-red-400' },
      (row.nonRegWithdrawn ?? 0) > 0 && { label: 'Non-Reg W/D', value: -(row.nonRegWithdrawn), color: 'text-red-500 dark:text-red-400' },
      (row.tfsaWithdrawn ?? 0) > 0 && { label: 'TFSA W/D', value: -(row.tfsaWithdrawn), color: 'text-red-500 dark:text-red-400' },
      totalWithdrawn > 0 && { label: 'Total Withdrawn', value: -totalWithdrawn, color: 'text-red-600 dark:text-red-400', bold: true },
      totalDeposited > 0 && { label: 'Total Reinvested', value: totalDeposited, color: 'text-emerald-600 dark:text-emerald-400', bold: true },
    ]
  } else if (type === 'grossWD') {
    balance = row.grossWithdrawal ?? 0
    lines = [
      (row.rrifWithdrawn ?? 0) > 0 && { label: 'RRIF (fully taxable)', value: row.rrifWithdrawn, color: 'text-red-500 dark:text-red-400' },
      (row.tfsaWithdrawn ?? 0) > 0 && { label: 'TFSA (tax-free)', value: row.tfsaWithdrawn, color: 'text-violet-600 dark:text-violet-400' },
      (row.nonRegWithdrawn ?? 0) > 0 && { label: 'Non-Reg (partial tax)', value: row.nonRegWithdrawn, color: 'text-amber-600 dark:text-amber-400' },
      balance > 0 && { label: 'Total Cash from Portfolio', value: balance, color: 'text-gray-800 dark:text-gray-200', bold: true },
    ]
    // Add note explaining difference from Gross Income
    lines._note = 'Total cash withdrawn from all accounts. Differs from Gross Income because TFSA is tax-free and only the taxable portion of Non-Reg counts as income.'
  } else if (type === 'grossIncome') {
    balance = row.grossIncome ?? 0
    const rrif = row.rrifWithdrawn ?? 0
    const cpp = row.cpp ?? 0
    const oas = row.oas ?? 0
    const db  = row.dbPension ?? 0
    const other = row.otherPension ?? 0
    const cg  = row.capitalGain ?? 0
    const cgTaxable = Math.round(cg * 0.5)
    const nonRegFull = row.nonRegWithdrawn ?? 0
    const tfsaWd = row.tfsaWithdrawn ?? 0
    lines = [
      rrif > 0     && { label: 'RRIF (100% taxable)', value: rrif, color: 'text-red-500 dark:text-red-400' },
      cgTaxable > 0 && { label: 'Non-Reg cap gains (50%)', value: cgTaxable, color: 'text-amber-600 dark:text-amber-400' },
      cpp > 0      && { label: 'CPP', value: cpp, color: 'text-blue-600 dark:text-blue-400' },
      oas > 0      && { label: 'OAS (net of clawback)', value: oas, color: 'text-blue-600 dark:text-blue-400' },
      db > 0       && { label: 'DB Pension', value: db, color: 'text-emerald-600 dark:text-emerald-400' },
      other > 0    && { label: 'Other Pension', value: other, color: 'text-emerald-600 dark:text-emerald-400' },
      balance > 0  && { label: 'Gross Taxable Income', value: balance, color: 'text-gray-800 dark:text-gray-200', bold: true },
    ]
    // Excluded items note
    const excluded = []
    if (tfsaWd > 0) excluded.push(`TFSA $${Math.round(tfsaWd).toLocaleString()} (tax-free)`)
    if (nonRegFull > 0 && cgTaxable < nonRegFull) excluded.push(`Non-Reg return of capital $${Math.round(nonRegFull - cgTaxable).toLocaleString()}`)
    lines._note = 'Taxable income only — determines your tax bracket.'
    if (excluded.length > 0) lines._excluded = `Not included: ${excluded.join(', ')}`
  }

  const activeLines = lines.filter(Boolean)
  if (activeLines.length === 0 && balance === 0) return <span>—</span>

  const displayValue = type === 'portfolio' ? fmt(row.portfolioTotal)
    : type === 'rrif' ? fmt(row.rrifTotal)
    : type === 'tfsa' ? fmt(row.tfsaTotal)
    : type === 'grossWD' ? fmt(row.grossWithdrawal)
    : type === 'grossIncome' ? fmt(row.grossIncome)
    : fmt(row.nonRegTotal)

  // Position tooltip above-left of cursor, clamped to viewport
  const TIP_W = 288
  const tipLeft = Math.min(pos.x + 12, window.innerWidth  - TIP_W - 8)
  const tipTop  = pos.y - 8  // will use translateY(-100%) to flip above cursor

  return (
    <div className="relative" ref={ref} onMouseEnter={enter} onMouseMove={move} onMouseLeave={leave}>
      <span className="cursor-default">{displayValue}</span>
      {show && activeLines.length > 0 && (
        <div
          className="pointer-events-none fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-3 text-xs space-y-0.5"
          style={{ left: tipLeft, top: tipTop, width: TIP_W, transform: 'translateY(-100%)' }}
        >
          <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            {type === 'portfolio' ? 'Portfolio' : type === 'rrif' ? 'RRIF' : type === 'tfsa' ? 'TFSA' : type === 'grossWD' ? 'Gross Withdrawal' : type === 'grossIncome' ? 'Gross Income' : 'Non-Reg'} — Age {row.age}
          </p>
          {activeLines.map((l, i) => (
            <FlowLine key={i} label={l.label} value={l.value} color={l.color} bold={l.bold} indent={l.indent} />
          ))}
          {type !== 'grossWD' && type !== 'grossIncome' && (
            <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-200 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
              <span className="min-w-0">End Balance</span>
              <span className="tabular-nums whitespace-nowrap ml-2 shrink-0">{fmtFull(balance)}</span>
            </div>
          )}
          {/* Explanatory notes for grossWD / grossIncome */}
          {(type === 'grossWD' || type === 'grossIncome') && (lines._note || lines._excluded) && (
            <div className="pt-1.5 mt-1 border-t border-gray-100 dark:border-gray-700 space-y-0.5">
              {lines._note && <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">{lines._note}</p>}
              {lines._excluded && <p className="text-[10px] text-amber-500 dark:text-amber-400 leading-relaxed">{lines._excluded}</p>}
            </div>
          )}
          {type === 'tfsa' && (row.tfsaAnnualLimit ?? 0) > 0 && (
            <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700 mt-1.5 space-y-0.5">
              <div className="flex justify-between text-gray-400 dark:text-gray-500">
                <span className="min-w-0">Annual contribution room</span>
                <span className="tabular-nums whitespace-nowrap ml-2 shrink-0">${(row.tfsaAnnualLimit).toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-snug break-words">
                {row.tfsaIndexedToInflation
                  ? 'CPI-indexed — grows with inflation.'
                  : 'Not CPI-indexed — fixed at base amount.'
                }
              </p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-snug break-words">
                Edit in <span className="italic">Inputs › Accounts › TFSA</span>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Accumulation Tooltip ────────────────────────────────────────────────────

function AccAccountTooltip({ row, acc, accounts, accCashInflows, accCashOutflows }) {
  const [show, setShow] = useState(false)
  const timer = useRef(null)
  const enter = () => { clearTimeout(timer.current); setShow(true) }
  const leave = () => { timer.current = setTimeout(() => setShow(false), 250) }

  const balance = row.accountBalances?.[acc.id] ?? 0
  const returnRate = acc.returnRate ?? 0

  // Use actual per-account data from simulation if available, else estimate
  const accReturn = row.perAccountReturn?.[acc.id] ?? Math.round(balance * (returnRate / 100) / (1 + returnRate / 100))
  const accContrib = row.perAccountContrib?.[acc.id] ?? (acc.annualContribution ?? 0)

  // Cash inflow goes to non-reg
  const cashIn = (accCashInflows?.[row.age] ?? 0)
  const accInflow = acc.taxType === 'nonreg' ? cashIn : 0

  // Outflow is proportional
  const cashOut = (accCashOutflows?.[row.age] ?? 0)
  const totalBal = accounts.reduce((s, a) => s + (row.accountBalances?.[a.id] ?? 0), 0)
  const accOutflow = totalBal > 0 ? Math.round(cashOut * (balance / totalBal)) : 0

  // Tax drag for non-reg
  const accTaxDrag = acc.taxType === 'nonreg' && row.nonRegTaxDrag > 0
    ? Math.round(row.nonRegTaxDrag * (balance / Math.max(1, accounts.filter(a => a.taxType === 'nonreg').reduce((s, a) => s + (row.accountBalances?.[a.id] ?? 0), 0))))
    : 0

  // TFSA: show if contribution was capped at indexed limit
  const tfsaCapped = acc.taxType === 'tfsa' && row.tfsaLimit && acc.annualContribution > row.tfsaLimit
  const tfsaContribLabel = acc.taxType === 'tfsa' && row.tfsaLimit
    ? `Contribution (cap $${row.tfsaLimit.toLocaleString()}${row.tfsaIndexedToInflation ? ' CPI' : ''})`
    : 'Annual Contribution'

  const lines = [
    accContrib > 0 && { label: tfsaContribLabel, value: accContrib, color: 'text-brand-600 dark:text-brand-400' },
    accReturn > 0 && { label: `Return (${returnRate}%)`, value: accReturn, color: 'text-emerald-600 dark:text-emerald-400' },
    accTaxDrag > 0 && { label: 'Tax Drag', value: -accTaxDrag, color: 'text-amber-600 dark:text-amber-400' },
    accInflow > 0 && { label: 'Cash Inflow', value: accInflow, color: 'text-green-600 dark:text-green-400' },
    accOutflow > 0 && { label: 'Cash Outflow', value: -accOutflow, color: 'text-red-500 dark:text-red-400' },
  ].filter(Boolean)

  if (lines.length === 0 && balance === 0) return <span>—</span>

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <span className="cursor-default">{fmt(balance)}</span>
      {show && lines.length > 0 && (
        <div
          className="absolute left-0 bottom-full mb-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-3 w-56 text-xs space-y-0.5"
          onMouseEnter={enter} onMouseLeave={leave}
        >
          <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            {acc.name} <span className="font-normal text-gray-400">({acc.taxType.toUpperCase()})</span> — Age {row.age}
          </p>
          {lines.map((l, i) => (
            <FlowLine key={i} label={l.label} value={l.value} color={l.color} />
          ))}
          <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-200 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
            <span>Balance</span>
            <span className="tabular-nums">{fmtFull(balance)}</span>
          </div>
          {acc.taxType === 'tfsa' && row.tfsaLimit && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1.5 leading-relaxed">
              TFSA limit: ${row.tfsaLimit.toLocaleString()}/yr
              {row.tfsaIndexedToInflation ? ' (indexed to CPI)' : ' (fixed)'}
              {tfsaCapped && (
                <span className="text-amber-500"> · Set ${acc.annualContribution.toLocaleString()}, capped at limit</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Column definitions ──────────────────────────────────────────────────────

const COLS = [
  { key: 'age',             label: 'Age',             fmt: v => v },
  { key: 'portfolioTotal',  label: 'Portfolio',        fmt: fmt, tooltip: 'portfolio' },
  { key: 'rrifTotal',       label: 'RRIF Total',       fmt: fmt, tooltip: 'rrif' },
  { key: 'tfsaTotal',       label: 'TFSA Total',       fmt: fmt, tooltip: 'tfsa' },
  { key: 'nonRegTotal',     label: 'Non-Reg Total',    fmt: fmt, tooltip: 'nonreg' },
  { key: 'rrif_min',        label: 'RRIF Min',         fmt: fmt },
  { key: 'grossWithdrawal', label: 'Gross W/D',        fmt: fmt, tooltip: 'grossWD' },
  { key: 'cashInflow',      label: 'One-Time Inflow',  fmt: fmt, editableInflow: true },
  { key: 'cashOutflow',     label: 'One-Time Outflow', fmt: fmt, editable: true },
  { key: 'cpp',             label: 'CPP',              fmt: fmt },
  { key: 'oas',             label: 'OAS (net)',         fmt: fmt },
  { key: 'oasClawback',     label: 'OAS Clawback',     fmt: fmt },
  { key: 'dbPension',       label: 'DB Pension',       fmt: fmt },
  { key: 'otherPension',    label: 'Other Pension',    fmt: fmt },
  { key: 'grossIncome',     label: 'Gross Income',     fmt: fmt, tooltip: 'grossIncome' },
  { key: 'federalTax',      label: 'Fed Tax',          fmt: fmt },
  { key: 'provincialTax',   label: 'Prov Tax',         fmt: fmt },
  { key: 'totalTax',        label: 'Total Tax',        fmt: fmt },
  { key: 'netIncome',       label: 'Net Income',       fmt: fmt },
  { key: 'effectiveRate',   label: 'Eff Rate',         fmt: v => pct(v * 100) },
  { key: 'withdrawalRate',  label: 'W/D Rate',         fmt: v => pct(v) },
]

// ─── Export components for AccumulationTable ────────────────────────────────

export { AccAccountTooltip, FlowLine, fmtFull }

// ─── Main DetailTable ────────────────────────────────────────────────────────

export default function DetailTable({
  rows,
  cashOutflows        = {},
  cashOutflowTaxRates = {},
  cashInflows         = {},
  onOutflowChange,
  onOutflowTaxRateChange,
  onInflowChange,
}) {
  const [page, setPage] = useState(0)
  const pageSize = 20
  const pages  = Math.ceil((rows?.length || 0) / pageSize)
  const visible = rows?.slice(page * pageSize, (page + 1) * pageSize) || []

  if (!rows?.length) return null

  // First age where RRIF hits zero (for row highlight)
  const rrifDepletionAge = rows.find((r, i) => r.rrifTotal <= 0 && (i === 0 || rows[i - 1].rrifTotal > 0))?.age ?? null

  const totalOutflows = Object.values(cashOutflows).reduce((s, v) => s + (v || 0), 0)
  const totalInflows  = Object.values(cashInflows).reduce((s, v)  => s + (v || 0), 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Year-by-Year Detail</h3>
          <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">
            Hover account balances for flow breakdown · Click inflow/outflow cells to edit
            {totalInflows  > 0 && <span className="text-brand-600 ml-2 dark:text-brand-400">+{fmt(totalInflows)} inflows</span>}
            {totalOutflows > 0 && <span className="text-red-500 ml-2 dark:text-red-400">−{fmt(totalOutflows)} outflows</span>}
          </p>
        </div>
        {pages > 1 && (
          <div className="flex gap-1 items-center text-xs text-gray-500">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
            >←</button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              disabled={page === pages - 1}
              className="px-2 py-1 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
            >→</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {COLS.map(c => (
                <th
                  key={c.key}
                  className={`text-left py-2.5 px-2 font-medium whitespace-nowrap ${
                    c.editableInflow ? 'text-brand-600 dark:text-brand-400' :
                    c.editable       ? 'text-red-500 dark:text-red-400'   :
                                       'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={row.age}
                className={`border-b border-gray-50 dark:border-gray-800/50 ${
                  row.portfolioTotal <= 0          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                  row.age === rrifDepletionAge      ? 'bg-orange-50 border-t-2 border-t-orange-300 dark:bg-orange-900/20 dark:border-t-orange-700' :
                  row.oasClawback > 0              ? 'bg-amber-50 dark:bg-amber-900/20' :
                  (cashOutflows[row.age] || 0) > 0 ? 'bg-rose-50/60 dark:bg-rose-900/20' :
                  (cashInflows[row.age]  || 0) > 0 ? 'bg-green-50/60 dark:bg-green-900/20' :
                  i % 2 === 0                      ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'
                }`}
              >
                {COLS.map(c => (
                  <td key={c.key} className="py-2 px-2 whitespace-nowrap">
                    {c.editableInflow ? (
                      <InflowCell
                        age={row.age}
                        value={cashInflows[row.age] || 0}
                        onChange={onInflowChange}
                        inflowForSpending={row.inflowForSpending || 0}
                        inflowSurplus={row.inflowSurplus || 0}
                        inflowInvestedTo={row.inflowInvestedTo || null}
                        inflowSurplusTfsa={row.inflowSurplusTfsa || 0}
                        inflowSurplusNonReg={row.inflowSurplusNonReg || 0}
                        tfsaAnnualLimit={row.tfsaAnnualLimit ?? null}
                      />
                    ) : c.editable ? (
                      <OutflowCell
                        age={row.age}
                        value={cashOutflows[row.age] || 0}
                        taxRate={cashOutflowTaxRates[row.age] || 0}
                        onChange={onOutflowChange}
                        onTaxRateChange={onOutflowTaxRateChange}
                      />
                    ) : c.tooltip ? (
                      <AccountTooltip row={row} type={c.tooltip} />
                    ) : (
                      c.fmt(row[c.key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
