import { useState } from 'react'

function fmt(n) {
  if (n == null || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

export default function AccumulationTable({ rows, accounts }) {
  const [page, setPage] = useState(0)
  const pageSize = 20
  const pages    = Math.ceil((rows?.length || 0) / pageSize)
  const visible  = rows?.slice(page * pageSize, (page + 1) * pageSize) || []

  if (!rows?.length) return null

  const hasNonRegTaxDrag = rows.some(r => r.nonRegTaxDrag > 0)
  const totalContribution = rows.reduce((s, r) => s + r.contribution, 0)
  const totalTaxDrag      = rows.reduce((s, r) => s + r.nonRegTaxDrag, 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Accumulation Cashflow</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Total contributions: {fmt(totalContribution)}
            {totalTaxDrag > 0 && <span className="text-amber-600 ml-3">Non-reg tax drag: {fmt(totalTaxDrag)}</span>}
          </p>
        </div>
        {pages > 1 && (
          <div className="flex gap-1 items-center text-xs text-slate-500">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100"
            >←</button>
            <span>{page + 1} / {pages}</span>
            <button
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              disabled={page === pages - 1}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-100"
            >→</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">Age</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">Year</th>
              {accounts.map(acc => (
                <th key={acc.id} className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">{acc.name}</th>
              ))}
              <th className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">Total</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">Contribution</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">Gross Return</th>
              {hasNonRegTaxDrag && (
                <th className="text-left py-2 px-2 text-amber-600 font-medium whitespace-nowrap">Tax Drag</th>
              )}
              <th className="text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap">Net Growth</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={row.age}
                className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
              >
                <td className="py-1.5 px-2 font-medium text-slate-700">{row.age}</td>
                <td className="py-1.5 px-2 text-slate-500">{row.year}</td>
                {accounts.map(acc => (
                  <td key={acc.id} className="py-1.5 px-2 whitespace-nowrap">
                    {fmt(row.accountBalances?.[acc.id])}
                  </td>
                ))}
                <td className="py-1.5 px-2 whitespace-nowrap font-medium">{fmt(row.totalBalance)}</td>
                <td className="py-1.5 px-2 whitespace-nowrap text-brand-700">{row.contribution > 0 ? fmt(row.contribution) : '—'}</td>
                <td className="py-1.5 px-2 whitespace-nowrap text-green-700">{fmt(row.grossReturn)}</td>
                {hasNonRegTaxDrag && (
                  <td className="py-1.5 px-2 whitespace-nowrap text-amber-700">
                    {row.nonRegTaxDrag > 0 ? `−${fmt(row.nonRegTaxDrag)}` : '—'}
                  </td>
                )}
                <td className="py-1.5 px-2 whitespace-nowrap text-slate-700 font-medium">{fmt(row.netGrowth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
