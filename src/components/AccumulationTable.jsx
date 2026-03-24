import { useState, useRef } from 'react'
import { InflowCell, OutflowCell } from './CashflowCells.jsx'
import { AccAccountTooltip } from './DetailTable.jsx'

function fmt(n) {
  if (n == null || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function Th({ children, tip, color = 'text-gray-400 dark:text-gray-500' }) {
  return (
    <th className={`text-left py-2.5 px-2 font-medium whitespace-nowrap ${color}`}>
      {tip ? (
        <span className="group relative cursor-help border-b border-dotted border-current">
          {children}
          <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-52 rounded-lg bg-gray-900 dark:bg-gray-800 text-white text-[11px] leading-relaxed p-2.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 font-normal normal-case whitespace-normal">
            {tip}
          </span>
        </span>
      ) : children}
    </th>
  )
}

function ContribTooltip({ row, accounts }) {
  const [show, setShow] = useState(false)
  const timer = useRef(null)
  const enter = () => { clearTimeout(timer.current); setShow(true) }
  const leave = () => { timer.current = setTimeout(() => setShow(false), 250) }

  if (row.contribution <= 0) return <span>—</span>

  const hasTfsa = accounts.some(a => a.taxType === 'tfsa')

  return (
    <div className="relative inline-block" onMouseEnter={enter} onMouseLeave={leave}>
      <span className="cursor-default">{fmt(row.contribution)}</span>
      {show && (
        <div
          className="absolute left-0 bottom-full mb-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg p-3 w-60 text-xs space-y-0.5"
          onMouseEnter={enter} onMouseLeave={leave}
        >
          <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Contributions — Age {row.age}</p>
          {accounts.map(acc => {
            const c = row.perAccountContrib?.[acc.id] ?? 0
            if (c <= 0) return null
            const isTfsa = acc.taxType === 'tfsa'
            const capped = isTfsa && row.tfsaLimit && acc.annualContribution > row.tfsaLimit
            return (
              <div key={acc.id} className="flex justify-between items-start">
                <span className="text-gray-500 dark:text-gray-400">
                  {acc.name}
                  {capped && <span className="text-amber-500 text-[10px] ml-1">capped</span>}
                </span>
                <span className="tabular-nums font-medium text-brand-600 dark:text-brand-400">${c.toLocaleString()}</span>
              </div>
            )
          })}
          <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-200 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
            <span>Total</span>
            <span className="tabular-nums">${row.contribution.toLocaleString()}</span>
          </div>
          {hasTfsa && row.tfsaLimit && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1.5 leading-relaxed">
              TFSA limit: ${row.tfsaLimit.toLocaleString()}/yr
              {row.tfsaIndexedToInflation ? ' · indexed to CPI' : ' · fixed (not indexed)'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function AccumulationTable({
  rows,
  accounts,
  accCashInflows      = {},
  accCashOutflows     = {},
  accOutflowTaxRates  = {},
  onInflowChange,
  onOutflowChange,
  onOutflowTaxRateChange,
}) {
  const [page, setPage] = useState(0)
  const pageSize = 20
  const pages    = Math.ceil((rows?.length || 0) / pageSize)
  const visible  = rows?.slice(page * pageSize, (page + 1) * pageSize) || []

  if (!rows?.length) return null

  const hasNonRegTaxDrag = rows.some(r => r.nonRegTaxDrag > 0)
  const totalContribution = rows.reduce((s, r) => s + r.contribution, 0)
  const totalTaxDrag      = rows.reduce((s, r) => s + r.nonRegTaxDrag, 0)
  const totalInflows      = Object.values(accCashInflows).reduce((s, v)  => s + (v || 0), 0)
  const totalOutflows     = Object.values(accCashOutflows).reduce((s, v) => s + (v || 0), 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Accumulation Cashflow</h3>
          <p className="text-[11px] text-gray-400 mt-1 dark:text-gray-500">
            Total contributions: {fmt(totalContribution)}
            {totalTaxDrag  > 0 && <span className="text-amber-600 ml-3 dark:text-amber-400">Non-reg tax drag: {fmt(totalTaxDrag)}</span>}
            {totalInflows  > 0 && <span className="text-brand-600 ml-3 dark:text-brand-400">+{fmt(totalInflows)} inflows</span>}
            {totalOutflows > 0 && <span className="text-red-500 ml-3 dark:text-red-400">−{fmt(totalOutflows)} outflows</span>}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 dark:text-gray-500">
            Hover account balances for breakdown · Click inflow/outflow cells to edit · Hover outflow to set tax rate
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
              <Th>Age</Th>
              <Th>Year</Th>
              {accounts.map(acc => (
                <Th key={acc.id} tip={acc.taxType === 'rrif' ? 'Registered (RRSP/RRIF). Contributions are tax-deductible. Withdrawals are 100% taxable.' : acc.taxType === 'tfsa' ? 'Tax-Free Savings Account. Growth and withdrawals are completely tax-free.' : acc.taxType === 'nonreg' ? 'Non-registered. Only capital gains (50% inclusion) and interest/dividends are taxable.' : null}>{acc.name}</Th>
              ))}
              <Th tip="Combined balance across all investment accounts.">Total</Th>
              <Th tip="Annual contributions to each account. TFSA contributions scale with CPI-indexed limit when enabled.">Contribution</Th>
              <Th color="text-brand-600 dark:text-brand-400" tip="Lump-sum cash added in a specific year (inheritance, bonus). Goes to non-registered accounts.">One-Time Inflow</Th>
              <Th color="text-red-500 dark:text-red-400" tip="Lump-sum withdrawal in a specific year (home purchase, large expense). Withdrawn proportionally from accounts.">One-Time Outflow</Th>
              <Th tip="Investment returns before tax. Based on each account's rate of return.">Gross Return</Th>
              {hasNonRegTaxDrag && (
                <Th color="text-amber-600 dark:text-amber-400" tip="Annual tax on non-reg investment income (interest, dividends, realized gains) during accumulation. Reduces effective growth rate.">Tax Drag</Th>
              )}
              <Th tip="Net portfolio growth: contributions + returns − tax drag.">Net Growth</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={row.age}
                className={`border-b border-gray-50 dark:border-gray-800/50 ${
                  (accCashOutflows[row.age] || 0) > 0 ? 'bg-rose-50/60 dark:bg-rose-900/20' :
                  (accCashInflows[row.age]  || 0) > 0 ? 'bg-green-50/60 dark:bg-green-900/20' :
                  i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'
                }`}
              >
                <td className="py-2 px-2 font-medium text-gray-700 dark:text-gray-300">{row.age}</td>
                <td className="py-2 px-2 text-gray-500 dark:text-gray-400">{row.year}</td>
                {accounts.map(acc => (
                  <td key={acc.id} className="py-2 px-2 whitespace-nowrap">
                    <AccAccountTooltip
                      row={row}
                      acc={acc}
                      accounts={accounts}
                      accCashInflows={accCashInflows}
                      accCashOutflows={accCashOutflows}
                    />
                  </td>
                ))}
                <td className="py-2 px-2 whitespace-nowrap font-medium dark:text-gray-300">{fmt(row.totalBalance)}</td>
                <td className="py-2 px-2 whitespace-nowrap text-brand-700 dark:text-brand-400">
                  <ContribTooltip row={row} accounts={accounts} />
                </td>
                <td className="py-2 px-2 whitespace-nowrap">
                  <InflowCell
                    age={row.age}
                    value={accCashInflows[row.age] || 0}
                    onChange={onInflowChange}
                    accLabel={accCashInflows[row.age] > 0 ? 'Added to non-registered accounts and compounds with investment returns.' : null}
                  />
                </td>
                <td className="py-2 px-2 whitespace-nowrap">
                  <OutflowCell
                    age={row.age}
                    value={accCashOutflows[row.age] || 0}
                    taxRate={accOutflowTaxRates[row.age] || 0}
                    onChange={onOutflowChange}
                    onTaxRateChange={onOutflowTaxRateChange}
                  />
                </td>
                <td className="py-2 px-2 whitespace-nowrap text-brand-700 dark:text-brand-400">{fmt(row.grossReturn)}</td>
                {hasNonRegTaxDrag && (
                  <td className="py-2 px-2 whitespace-nowrap text-amber-700 dark:text-amber-400">
                    {row.nonRegTaxDrag > 0 ? `−${fmt(row.nonRegTaxDrag)}` : '—'}
                  </td>
                )}
                <td className="py-2 px-2 whitespace-nowrap text-gray-700 font-medium dark:text-gray-300">{fmt(row.netGrowth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
