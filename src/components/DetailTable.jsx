import { useState, useEffect } from 'react'

function fmt(n) {
  if (n == null || n === 0) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function pct(n) {
  if (!n) return '—'
  return `${n.toFixed(1)}%`
}

const COLS = [
  { key: 'age',             label: 'Age',            fmt: v => v },
  { key: 'portfolioTotal',  label: 'Portfolio',       fmt: fmt },
  { key: 'rrifTotal',       label: 'RRIF Total',      fmt: fmt },
  { key: 'tfsaTotal',       label: 'TFSA Total',      fmt: fmt },
  { key: 'nonRegTotal',     label: 'Non-Reg Total',   fmt: fmt },
  { key: 'rrif_min',        label: 'RRIF Min',        fmt: fmt },
  { key: 'grossWithdrawal', label: 'Gross W/D',       fmt: fmt },
  { key: 'cashOutflow',     label: 'One-Time Outflow',fmt: fmt, editable: true },
  { key: 'cpp',             label: 'CPP',             fmt: fmt },
  { key: 'oas',             label: 'OAS (net)',        fmt: fmt },
  { key: 'oasClawback',     label: 'OAS Clawback',    fmt: fmt },
  { key: 'dbPension',       label: 'DB Pension',      fmt: fmt },
  { key: 'otherPension',    label: 'Other Pension',   fmt: fmt },
  { key: 'grossIncome',     label: 'Gross Income',    fmt: fmt },
  { key: 'federalTax',      label: 'Fed Tax',         fmt: fmt },
  { key: 'provincialTax',   label: 'Prov Tax',        fmt: fmt },
  { key: 'totalTax',        label: 'Total Tax',       fmt: fmt },
  { key: 'netIncome',       label: 'Net Income',      fmt: fmt },
  { key: 'effectiveRate',   label: 'Eff Rate',        fmt: v => pct(v * 100) },
  { key: 'withdrawalRate',  label: 'W/D Rate',        fmt: v => pct(v) },
]

// Editable cell for one-time outflows
function OutflowCell({ age, value, onChange }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal]     = useState(value > 0 ? String(value) : '')

  useEffect(() => { setLocal(value > 0 ? String(value) : '') }, [value])

  function commit() {
    const n = parseFloat(local)
    onChange(age, isNaN(n) || n <= 0 ? 0 : Math.round(n))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="relative flex items-center">
        <span className="absolute left-1.5 text-slate-400 text-xs select-none">$</span>
        <input
          autoFocus
          type="number"
          min={0}
          step={1000}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="w-24 pl-4 pr-1 py-0.5 text-xs border border-brand-400 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-left w-full px-1 py-0.5 rounded hover:bg-brand-50 hover:text-brand-700 transition-colors ${
        value > 0 ? 'text-red-600 font-medium' : 'text-slate-300 hover:text-brand-500'
      }`}
      title="Click to set a one-time cash outflow for this year"
    >
      {value > 0 ? fmt(value) : '+ add'}
    </button>
  )
}

export default function DetailTable({ rows, cashOutflows = {}, onOutflowChange }) {
  const [page, setPage] = useState(0)
  const pageSize = 20
  const pages  = Math.ceil((rows?.length || 0) / pageSize)
  const visible = rows?.slice(page * pageSize, (page + 1) * pageSize) || []

  if (!rows?.length) return null

  const totalOutflows = Object.values(cashOutflows).reduce((s, v) => s + (v || 0), 0)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Year-by-Year Detail</h3>
          {totalOutflows > 0 && (
            <p className="text-xs text-red-600 mt-0.5">
              Total one-time outflows: {fmt(totalOutflows)} · Click any cell in "One-Time Outflow" to edit
            </p>
          )}
          {totalOutflows === 0 && (
            <p className="text-xs text-slate-400 mt-0.5">Click any cell in "One-Time Outflow" to add a one-time expense for that year.</p>
          )}
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
              {COLS.map(c => (
                <th key={c.key} className={`text-left py-2 px-2 text-slate-500 font-medium whitespace-nowrap ${c.editable ? 'text-brand-600' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={row.age}
                className={`border-b border-slate-100 ${
                  row.portfolioTotal <= 0 ? 'bg-red-50 text-red-700' :
                  row.oasClawback > 0    ? 'bg-amber-50' :
                  (cashOutflows[row.age] || 0) > 0 ? 'bg-rose-50' :
                  i % 2 === 0            ? 'bg-white' : 'bg-slate-50/50'
                }`}
              >
                {COLS.map(c => (
                  <td key={c.key} className="py-1.5 px-2 whitespace-nowrap">
                    {c.editable ? (
                      <OutflowCell
                        age={row.age}
                        value={cashOutflows[row.age] || 0}
                        onChange={onOutflowChange}
                      />
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
