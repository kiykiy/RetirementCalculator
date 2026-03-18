import React from 'react'

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
    label: 'Target Tax Bracket',
    desc: 'Withdraw enough RRSP/RRIF to fill income up to a target level.',
    detail: 'Each year, withdraws enough from RRSP/RRIF to bring total income (CPP + OAS + pension + RRIF) up to a specified annual target. Fills lower tax brackets efficiently, especially in early retirement before CPP/OAS begin.',
    pros: ['Optimal bracket management', 'Avoids spikes in later years', 'Works well in early retirement gap years'],
    cons: ['Income varies year to year', 'May withdraw when not needed for spending', 'Requires updating the target as tax rules change'],
  },
]

function InfoTooltip({ strategy }) {
  return (
    <div className="relative group inline-flex items-center ml-1.5">
      <span className="cursor-help text-slate-400 hover:text-brand-500 text-sm leading-none select-none">ⓘ</span>
      <div className="absolute left-5 top-0 z-50 hidden group-hover:block w-72 bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-xs pointer-events-none">
        <p className="text-slate-600 mb-2">{strategy.detail}</p>
        <p className="font-semibold text-green-700 mb-1">Pros</p>
        {strategy.pros.map(p => (
          <p key={p} className="text-slate-600 mb-0.5">✓ {p}</p>
        ))}
        <p className="font-semibold text-red-600 mt-2 mb-1">Cons</p>
        {strategy.cons.map(c => (
          <p key={c} className="text-slate-600 mb-0.5">✗ {c}</p>
        ))}
      </div>
    </div>
  )
}

function ParamRow({ label, children }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 text-slate-500 shrink-0">{label}</span>
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
      {prefix && <span className="absolute left-2 text-slate-400 text-xs">{prefix}</span>}
      <input
        type="text"
        inputMode={isPct ? 'decimal' : 'numeric'}
        className={`input-field w-24 text-xs py-1 ${prefix ? 'pl-5' : ''} ${suffix ? 'pr-6' : ''}`}
        value={local}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {suffix && <span className="absolute right-2 text-slate-400 text-xs">{suffix}</span>}
    </div>
  )
}

export default function RrspDrawdown({ rrspDrawdown, onChange }) {
  const setType  = (type) => onChange({ ...rrspDrawdown, type })
  const setParam = (key)  => (val) => onChange({ ...rrspDrawdown, [key]: val })
  const active   = STRATEGIES.find(s => s.id === rrspDrawdown.type) || STRATEGIES[0]

  return (
    <div>
      {/* Tab buttons + reinvest toggle on same row */}
      <div className="flex items-start justify-between gap-2 mb-2 min-h-[60px]">
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
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-md p-0.5 text-xs">
              <button
                onClick={() => setParam('reinvestSurplus')(true)}
                className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                  (rrspDrawdown.reinvestSurplus ?? true)
                    ? 'bg-white shadow text-slate-700 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >Non-reg</button>
              <button
                onClick={() => setParam('reinvestSurplus')(false)}
                className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                  !(rrspDrawdown.reinvestSurplus ?? true)
                    ? 'bg-white shadow text-slate-700 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >Income</button>
            </div>
            <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block w-56 bg-white border border-slate-200 rounded-lg shadow-xl p-2.5 text-xs text-slate-600 pointer-events-none">
              <p className="font-semibold text-slate-700 mb-1">Surplus destination</p>
              When your RRIF drawdown exceeds the amount needed for spending, the after-tax surplus is either reinvested into non-registered (grows the portfolio) or kept as additional income that year.
            </div>
          </div>
        )}
      </div>

      {/* Description + info icon */}
      <div className="flex items-start mb-2 min-h-[32px]">
        {active && (
          <>
            <p className="text-xs text-slate-500 italic">{active.desc}</p>
            <InfoTooltip strategy={active} />
          </>
        )}
      </div>

      {/* Strategy-specific parameters */}
      <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">

        {rrspDrawdown.type === 'none' && (
          <p className="text-xs text-slate-400 italic">No parameters — mandatory RRIF minimums only.</p>
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
    </div>
  )
}
