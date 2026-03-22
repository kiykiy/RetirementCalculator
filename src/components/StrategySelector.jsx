import React from 'react'

const STRATEGIES = [
  {
    id: 'fixedPct',
    label: 'Fixed %',
    desc: 'Withdraw a fixed percentage of the portfolio each year.',
    detail: 'Each year you withdraw a set percentage of the current portfolio value. Income rises with a growing portfolio and falls with a declining one.',
    pros: ['Simple to implement', 'Portfolio can never technically run out', 'Spending rises in good markets'],
    cons: ['Inconsistent income year to year', 'No inflation guarantee', 'Low spending in down markets'],
  },
  {
    id: 'fixedDollar',
    label: 'Fixed $',
    desc: 'Withdraw a constant inflation-adjusted amount each year.',
    detail: 'You withdraw the same real dollar amount every year, adjusted upward by inflation. Spending is predictable but portfolio depletion is possible.',
    pros: ['Predictable, stable income', 'Easy to budget around', 'Keeps purchasing power intact'],
    cons: ['Can deplete portfolio in bad markets', 'Ignores portfolio performance', 'Risk of outliving savings'],
  },
  {
    id: 'guardrails',
    label: 'Guardrails',
    desc: 'Guyton-Klinger dynamic adjustments (±10%) based on withdrawal rate.',
    detail: 'Starts with an initial withdrawal rate and adjusts spending by 10% when the withdrawal rate drifts outside guardrail thresholds. Balances income stability with sustainability.',
    pros: ['Responds to market conditions', 'Better longevity than fixed dollar', 'Avoids extreme cuts'],
    cons: ['More complex to follow', 'Income can still fluctuate', 'Guardrail triggers can feel arbitrary'],
  },
  {
    id: 'bucket',
    label: 'Bucket',
    desc: 'Cash / Bonds / Equity buckets with automatic annual refill.',
    detail: 'Divides the portfolio into three buckets by time horizon. Cash covers near-term expenses, bonds cover the medium term, and equities provide long-term growth. Equities refill bonds; bonds refill cash each year.',
    pros: ['Psychologically comforting', 'Reduces sequence-of-returns risk', 'Clear mental model'],
    cons: ['May underperform a simple mix', 'Rebalancing adds complexity', 'Cash drag reduces growth'],
  },
  {
    id: 'targeted',
    label: 'Target Estate',
    desc: 'Solve for the withdrawal that hits a specific end balance at a target age.',
    detail: 'Uses a binary search to find the constant (inflation-adjusted) annual withdrawal that exhausts the portfolio to a specified balance at a specified age. Good for leaving an estate or funding a care need.',
    pros: ['Precise control over end balance', 'Can plan for estate or care costs', 'Maximises spending within constraints'],
    cons: ['Assumes constant real return', 'Sensitive to return assumptions', 'Requires re-solving if markets change'],
  },
]

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

function NumParam({ value, onChange, min, max, step = 0.1, prefix, suffix }) {
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

export default function StrategySelector({ strategyType, strategyParams, onChange }) {
  const setType  = (id) => onChange({ strategyType: id, strategyParams })
  const setParam = (key) => (val) => onChange({ strategyType, strategyParams: { ...strategyParams, [key]: val } })
  const active   = STRATEGIES.find(s => s.id === strategyType)

  return (
    <div>
      {/* Tab buttons */}
      <div className="flex flex-wrap gap-1 mb-3 min-h-[60px] content-start">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            onClick={() => setType(s.id)}
            className={`strategy-tab ${strategyType === s.id ? 'active' : ''}`}
          >
            {s.label}
          </button>
        ))}
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

        {strategyType === 'fixedPct' && (
          <ParamRow label="Withdrawal Rate">
            <NumParam value={(strategyParams.rate ?? 0.04) * 100} onChange={v => setParam('rate')(v / 100)} min={1} max={15} step={0.1} suffix="%" />
          </ParamRow>
        )}

        {strategyType === 'fixedDollar' && (
          <ParamRow label="Annual Withdrawal (today's $)">
            <NumParam value={strategyParams.baseAmount ?? 60000} onChange={setParam('baseAmount')} min={1000} max={500000} step={1000} prefix="$" />
          </ParamRow>
        )}

        {strategyType === 'guardrails' && (
          <>
            <ParamRow label="Initial Withdrawal Rate">
              <NumParam value={(strategyParams.initialRate ?? 0.05) * 100} onChange={v => setParam('initialRate')(v / 100)} min={1} max={15} step={0.1} suffix="%" />
            </ParamRow>
            <ParamRow label="Upper Guardrail (cut)">
              <NumParam value={(strategyParams.upperGuardrail ?? 0.06) * 100} onChange={v => setParam('upperGuardrail')(v / 100)} min={1} max={20} step={0.1} suffix="%" />
            </ParamRow>
            <ParamRow label="Lower Guardrail (raise)">
              <NumParam value={(strategyParams.lowerGuardrail ?? 0.04) * 100} onChange={v => setParam('lowerGuardrail')(v / 100)} min={1} max={15} step={0.1} suffix="%" />
            </ParamRow>
            <ParamRow label="Adjustment Factor">
              <NumParam value={(strategyParams.adjustmentFactor ?? 0.10) * 100} onChange={v => setParam('adjustmentFactor')(v / 100)} min={1} max={30} step={1} suffix="%" />
            </ParamRow>
          </>
        )}

        {strategyType === 'bucket' && (
          <>
            <ParamRow label="Annual Expense (today's $)">
              <NumParam value={strategyParams.annualExpense ?? 60000} onChange={setParam('annualExpense')} min={1000} max={500000} step={1000} prefix="$" />
            </ParamRow>
            <ParamRow label="Cash Bucket (years)">
              <NumParam value={strategyParams.cashYears ?? 2} onChange={setParam('cashYears')} min={1} max={5} step={1} />
            </ParamRow>
            <ParamRow label="Bond Bucket (years)">
              <NumParam value={strategyParams.bondYears ?? 5} onChange={setParam('bondYears')} min={2} max={10} step={1} />
            </ParamRow>
            <ParamRow label="Bond Return">
              <NumParam value={(strategyParams.bondReturn ?? 0.04) * 100} onChange={v => setParam('bondReturn')(v / 100)} min={0} max={10} step={0.1} suffix="%" />
            </ParamRow>
            <ParamRow label="Equity Return">
              <NumParam value={(strategyParams.equityReturn ?? 0.07) * 100} onChange={v => setParam('equityReturn')(v / 100)} min={0} max={20} step={0.1} suffix="%" />
            </ParamRow>
          </>
        )}

        {strategyType === 'targeted' && (
          <>
            <ParamRow label="Target End Age">
              <NumParam value={strategyParams.targetAge ?? 90} onChange={setParam('targetAge')} min={70} max={110} step={1} />
            </ParamRow>
            <ParamRow label="Target End Balance">
              <NumParam value={strategyParams.targetBalance ?? 0} onChange={setParam('targetBalance')} min={0} max={5000000} step={10000} prefix="$" />
            </ParamRow>
          </>
        )}
      </div>
    </div>
  )
}
