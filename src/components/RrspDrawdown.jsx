import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

const STRATEGIES = [
  {
    id: 'none',
    label: 'None',
    desc: 'Only mandatory RRIF minimums are withdrawn each year.',
    detail: 'No proactive RRSP/RRIF drawdown. Only the CRA-required RRIF minimum (starting at age 72) is withdrawn. This maximizes tax-deferred growth but may result in large forced withdrawals and high taxes later.',
    pros: ['Maximum tax-deferred growth', 'Simple — no action required', 'Defers tax as long as possible'],
    cons: ['Large mandatory withdrawals at 72+', 'May push income into higher brackets', 'OAS clawback risk in later years'],
  },
  {
    id: 'fixedAmount',
    label: 'Fixed $',
    desc: 'Withdraw a fixed dollar amount from RRSP/RRIF each year.',
    detail: 'Each year a fixed amount is withdrawn from RRSP/RRIF accounts (above the mandatory minimum if applicable). Useful for topping up income to a specific level while managing tax brackets.',
    pros: ['Predictable tax hit each year', 'Can fill lower tax brackets deliberately', 'Reduces RRIF balance before mandatory minimums'],
    cons: ['Fixed amount may not keep pace with portfolio growth', 'Requires periodic review', 'No automatic adjustment for income changes'],
  },
  {
    id: 'targetAge',
    label: 'Depletion Age',
    desc: 'Amortize RRSP/RRIF balance to zero by a specified age.',
    detail: 'Computes an annual payment (using a PMT formula) that depletes the RRIF to zero by the target age, given the expected return on RRIF assets. Smooths out the mandatory minimum spike.',
    pros: ['Avoids large mandatory minimums', 'Spreads tax over more years', 'Good for estate planning — converts to estate assets'],
    cons: ['Payment rises or falls with RRIF balance', 'Assumes constant return', 'Risk of depleting too fast if returns disappoint'],
  },
  {
    id: 'targetBracket',
    label: 'Target Bracket',
    desc: 'Withdraw enough RRSP/RRIF to fill income up to a target level.',
    detail: 'Each year, withdraws enough from RRSP/RRIF to bring total income (CPP + OAS + pension + RRIF) up to a specified annual target. Fills lower tax brackets efficiently, especially in early retirement before CPP/OAS begin.',
    pros: ['Optimal bracket management', 'Avoids spikes in later years', 'Works well in early retirement gap years'],
    cons: ['Income varies year to year', 'May withdraw when not needed for spending', 'Requires updating the target as tax rules change'],
  },
]

function fmtM(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

function ComparisonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2.5 text-xs space-y-0.5 pointer-events-none">
      <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{d.label}</p>
      <p className="text-gray-400">Lifetime tax: {fmtM(d.totalTaxPaid)}</p>
      {d.taxSaving > 0 && <p className="text-emerald-600">Saves {fmtM(d.taxSaving)} vs no drawdown</p>}
      {d.taxSaving < 0 && <p className="text-red-500">Costs {fmtM(Math.abs(d.taxSaving))} more vs no drawdown</p>}
      <p className="text-gray-400">Final balance: {fmtM(d.finalBalance)}</p>
      {d.exhausted && <p className="text-red-500">⚠ Exhausted at age {d.exhausted}</p>}
    </div>
  )
}

function InfoTooltip({ strategy }) {
  return (
    <div className="relative group inline-flex items-center ml-1.5">
      <span className="cursor-help text-gray-300 hover:text-gray-500 text-sm leading-none select-none dark:text-gray-600 dark:hover:text-gray-400">ⓘ</span>
      <div className="absolute left-5 top-0 z-50 hidden group-hover:block w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3.5 text-xs pointer-events-none dark:bg-gray-800 dark:border-gray-700">
        <p className="text-gray-600 mb-2.5 leading-relaxed dark:text-gray-300">{strategy.detail}</p>
        <p className="font-semibold text-brand-700 mb-1 dark:text-brand-400">Pros</p>
        {strategy.pros.map(p => (
          <p key={p} className="text-gray-600 mb-0.5 dark:text-gray-300">✓ {p}</p>
        ))}
        <p className="font-semibold text-red-600 mt-2.5 mb-1 dark:text-red-400">Cons</p>
        {strategy.cons.map(c => (
          <p key={c} className="text-gray-600 mb-0.5 dark:text-gray-300">✗ {c}</p>
        ))}
      </div>
    </div>
  )
}

function ParamRow({ label, children }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 text-gray-500 shrink-0 dark:text-gray-400">{label}</span>
      {children}
    </div>
  )
}

function NumParam({ value, onChange, min, max, step = 1, prefix, suffix }) {
  const isPct = suffix === '%'

  function fmt(v) {
    const n = parseFloat(String(v).replace(/,/g, ''))
    if (isNaN(n)) return String(v)
    return isPct ? String(n) : Math.round(n).toLocaleString('en-CA')
  }

  const [local, setLocal] = React.useState(fmt(value))
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => { if (!focused) setLocal(fmt(value)) }, [value])

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
      {prefix && <span className="absolute left-2 text-gray-400 text-xs">{prefix}</span>}
      <input
        type="text"
        inputMode={isPct ? 'decimal' : 'numeric'}
        className={`input-field w-24 text-xs py-1.5 ${prefix ? 'pl-5' : ''} ${suffix ? 'pr-6' : ''}`}
        value={local}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {suffix && <span className="absolute right-2 text-gray-400 text-xs">{suffix}</span>}
    </div>
  )
}

export default function RrspDrawdown({ rrspDrawdown, onChange, comparison }) {
  const setType  = (type) => onChange({ ...rrspDrawdown, type })
  const setParam = (key)  => (val) => onChange({ ...rrspDrawdown, [key]: val })
  const active   = STRATEGIES.find(s => s.id === rrspDrawdown.type) || STRATEGIES[0]

  return (
    <div>
      {/* Tab buttons + reinvest toggle on same row */}
      <div className="flex items-start justify-between gap-2 mb-3 min-h-[60px]">
        <div className="flex flex-wrap gap-1 content-start">
          {STRATEGIES.map(s => (
            <button
              key={s.id}
              onClick={() => setType(s.id)}
              className={`strategy-tab ${rrspDrawdown.type === s.id ? 'active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {rrspDrawdown.type !== 'none' && (
          <div className="relative group shrink-0">
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 text-xs dark:bg-gray-800">
              <button
                onClick={() => setParam('reinvestSurplus')(true)}
                className={`px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                  (rrspDrawdown.reinvestSurplus ?? true)
                    ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >Non-reg</button>
              <button
                onClick={() => setParam('reinvestSurplus')(false)}
                className={`px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                  !(rrspDrawdown.reinvestSurplus ?? true)
                    ? 'bg-white shadow-sm text-gray-900 font-medium dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >Income</button>
            </div>
            <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs text-gray-600 pointer-events-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
              <p className="font-semibold text-gray-900 mb-1 dark:text-gray-200">Surplus destination</p>
              When your RRIF drawdown exceeds the amount needed for spending, the after-tax surplus is either reinvested into non-registered (grows the portfolio) or kept as additional income that year.
            </div>
          </div>
        )}
      </div>

      {/* Description + info icon */}
      <div className="flex items-start mb-3 min-h-[32px]">
        {active && (
          <>
            <p className="text-xs text-gray-400 italic dark:text-gray-500">{active.desc}</p>
            <InfoTooltip strategy={active} />
          </>
        )}
      </div>

      {/* Strategy-specific parameters */}
      <div className="space-y-2 bg-gray-50 rounded-xl p-3 dark:bg-gray-800/50">

        {rrspDrawdown.type === 'none' && (
          <p className="text-xs text-gray-400 italic dark:text-gray-500">No parameters — mandatory RRIF minimums only.</p>
        )}

        {rrspDrawdown.type === 'fixedAmount' && (
          <ParamRow label="Annual RRIF Withdrawal">
            <NumParam
              value={rrspDrawdown.fixedAmount ?? 30000}
              onChange={setParam('fixedAmount')}
              min={0} max={500000} step={1000} prefix="$"
            />
          </ParamRow>
        )}

        {rrspDrawdown.type === 'targetAge' && (
          <ParamRow label="Deplete RRIF by Age">
            <NumParam
              value={rrspDrawdown.targetAge ?? 80}
              onChange={setParam('targetAge')}
              min={65} max={100} step={1}
            />
          </ParamRow>
        )}

        {rrspDrawdown.type === 'targetBracket' && (
          <ParamRow label="Target Annual Income">
            <NumParam
              value={rrspDrawdown.targetAnnualIncome ?? 80000}
              onChange={setParam('targetAnnualIncome')}
              min={0} max={500000} step={1000} prefix="$"
            />
          </ParamRow>
        )}

      </div>

      {/* ── Comparison panel ── */}
      {comparison && comparison.length > 0 && (() => {
        const best    = comparison.reduce((b, s) => s.taxSaving > b.taxSaving ? s : b, comparison[0])
        const current = comparison.find(s =>
          s.rrspDrawdown.type === rrspDrawdown.type &&
          (rrspDrawdown.type !== 'fixedAmount'    || s.rrspDrawdown.fixedAmount           === (rrspDrawdown.fixedAmount          ?? 30000)) &&
          (rrspDrawdown.type !== 'targetAge'      || s.rrspDrawdown.targetAge             === (rrspDrawdown.targetAge            ?? 80)) &&
          (rrspDrawdown.type !== 'targetBracket'  || s.rrspDrawdown.targetAnnualIncome    === (rrspDrawdown.targetAnnualIncome   ?? 80000))
        ) ?? null

        return (
          <div className="mt-4 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Lifetime tax impact — strategy comparison
            </p>

            {/* Bar chart — total tax paid, lower = better */}
            <p className="text-[9px] text-gray-300 dark:text-gray-600 -mb-1">Lifetime tax paid — lower is better</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={comparison} margin={{ top: 16, right: 4, left: 0, bottom: 36 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  tick={{ fontSize: 8 }}
                  angle={-40}
                  textAnchor="end"
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 9 }} width={40}
                  tickFormatter={v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                <Tooltip content={<ComparisonTooltip />} />
                <Bar dataKey="totalTaxPaid" radius={[3,3,0,0]}>
                  {comparison.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        current && entry.label === current.label ? '#3b82f6' :
                        entry.label === best.label ? '#10b981' :
                        '#e5e7eb'
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="totalTaxPaid"
                    position="top"
                    formatter={v => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
                    style={{ fontSize: 8, fill: '#6b7280' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Table */}
            <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden text-[10px]">
              <div className="grid grid-cols-4 bg-gray-50 dark:bg-gray-800/60 px-2 py-1 text-gray-400 dark:text-gray-500 font-medium gap-1">
                <span>Strategy</span>
                <span className="text-right">Tax paid</span>
                <span className="text-right">Final bal.</span>
                <span className="text-right">Tax saved</span>
              </div>
              {comparison.map((row, i) => {
                const isCur  = current && row.label === current.label
                const isBest = row.label === best.label && row.taxSaving > 0
                return (
                  <div key={i} className={`grid grid-cols-4 gap-1 px-2 py-1.5 border-t border-gray-100 dark:border-gray-800 ${isCur ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                    <span className={`font-medium truncate ${isCur ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {row.label}
                      {isBest && <span className="ml-0.5 text-emerald-500">★</span>}
                      {isCur && !isBest && <span className="ml-0.5 text-blue-400">✓</span>}
                    </span>
                    <span className="text-right tabular-nums text-gray-500 dark:text-gray-400">{fmtM(row.totalTaxPaid)}</span>
                    <span className={`text-right tabular-nums ${row.exhausted ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {row.exhausted ? `⚠ age ${row.exhausted}` : fmtM(row.finalBalance)}
                    </span>
                    <span className={`text-right tabular-nums font-semibold ${
                      row.taxSaving > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                      row.taxSaving < 0 ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {row.taxSaving === 0 ? 'baseline' : row.taxSaving > 0 ? `+${fmtM(row.taxSaving)}` : `−${fmtM(Math.abs(row.taxSaving))}`}
                    </span>
                  </div>
                )
              })}
            </div>


            <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed">
              Comparison uses your full plan simulation. Tax saved = reduction vs. "None" strategy. ★ = best tax outcome.
            </p>
          </div>
        )
      })()}
    </div>
  )
}
