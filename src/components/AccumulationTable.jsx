import { useState } from 'react'
import { InflowCell, OutflowCell } from './CashflowCells.jsx'
import { AccAccountTooltip } from './DetailTable.jsx'

function fmt(n) {
  if (n == null || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
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
              <th className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">Age</th>
              <th className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">Year</th>
              {accounts.map(acc => (
                <th key={acc.id} className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">{acc.name}</th>
              ))}
              <th className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">Total</th>
              <th className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">Contribution</th>
              <th className="text-left py-2.5 px-2 text-brand-600 font-medium whitespace-nowrap dark:text-brand-400">One-Time Inflow</th>
              <th className="text-left py-2.5 px-2 text-red-500 font-medium whitespace-nowrap dark:text-red-400">One-Time Outflow</th>
              <th className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">Gross Return</th>
              {hasNonRegTaxDrag && (
                <th className="text-left py-2.5 px-2 text-amber-600 font-medium whitespace-nowrap dark:text-amber-400">Tax Drag</th>
              )}
              <th className="text-left py-2.5 px-2 text-gray-400 font-medium whitespace-nowrap dark:text-gray-500">Net Growth</th>
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
                <td className="py-2 px-2 whitespace-nowrap text-brand-700 dark:text-brand-400">{row.contribution > 0 ? fmt(row.contribution) : '—'}</td>
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
