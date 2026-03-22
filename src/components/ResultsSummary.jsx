import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}
function fmtFull(n) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString()}`
}
function pct(n) {
  return `${(n * 100).toFixed(1)}%`
}

// ─── Tooltip divider ──────────────────────────────────────────────────────────

function TipRow({ label, value, accent }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ?? 'text-gray-800 dark:text-gray-200'}`}>{value}</span>
    </div>
  )
}

function TipDivider() {
  return <div className="border-t border-gray-100 dark:border-gray-700 my-1.5" />
}

function TipSection({ title }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-2 mb-1 first:mt-0">{title}</p>
}

// ─── Portal tooltip ───────────────────────────────────────────────────────────

function MetricCard({ label, value, color = 'text-gray-900', exhausted, tooltip, tipWidth = 220 }) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0, align: 'left' })
  const cardRef = useRef(null)

  const darkColor = {
    'text-gray-900':   'dark:text-gray-100',
    'text-brand-600':  'dark:text-brand-400',
    'text-emerald-600':'dark:text-emerald-400',
    'text-red-600':    'dark:text-red-400',
    'text-amber-600':  'dark:text-amber-600',
  }[color] ?? ''

  function handleEnter() {
    if (!cardRef.current) return
    const r = cardRef.current.getBoundingClientRect()
    const spaceRight = window.innerWidth - r.right
    const align = spaceRight < tipWidth + 8 ? 'right' : 'left'
    setPos({
      top:   r.bottom + 6,
      left:  align === 'right' ? r.right - tipWidth : r.left,
      align,
    })
    setShow(true)
  }

  return (
    <>
      <div
        ref={cardRef}
        className="metric-card cursor-default select-none w-[130px]"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 leading-tight">{label}</p>
        <p className={`text-base font-semibold tracking-tight leading-tight mt-0.5 ${color} ${darkColor}`}>{value}</p>
        {exhausted && (
          <p className="text-[10px] text-red-500 font-medium mt-0.5">⚠ exhausted</p>
        )}
      </div>

      {show && tooltip && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: tipWidth, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs text-gray-600 space-y-0.5 pointer-events-none dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400"
        >
          {tooltip}
        </div>,
        document.body
      )}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ResultsSummary({ summary, rows = [], probabilityOfSuccess = null, pensionSplitSaving = null }) {
  if (!summary) return null

  const exhausted = summary.portfolioExhaustedAge
  const lastRow   = [...rows].reverse().find(r => r.portfolioTotal > 0) ?? rows[rows.length - 1]

  // Pre-compute aggregates from rows
  const totalFedTax  = rows.reduce((s, r) => s + (r.federalTax   ?? 0), 0)
  const totalProvTax = rows.reduce((s, r) => s + (r.provincialTax ?? 0), 0)
  const totalCpp     = rows.reduce((s, r) => s + (r.cpp           ?? 0), 0)
  const totalOas     = rows.reduce((s, r) => s + (r.oas           ?? 0), 0)
  const totalDb      = rows.reduce((s, r) => s + (r.dbPension     ?? 0), 0)
  const totalOther   = rows.reduce((s, r) => s + (r.otherPension  ?? 0), 0)
  const totalGovInc  = totalCpp + totalOas + totalDb + totalOther
  const totalPortW   = rows.reduce((s, r) => s + (r.grossWithdrawal ?? 0), 0)

  const peakTaxRow   = [...rows].sort((a, b) => (b.totalTax ?? 0) - (a.totalTax ?? 0))[0]
  const minRateRow   = [...rows].filter(r => r.effectiveRate > 0).sort((a, b) => a.effectiveRate - b.effectiveRate)[0]
  const maxRateRow   = [...rows].sort((a, b) => (b.effectiveRate ?? 0) - (a.effectiveRate ?? 0))[0]

  // ── Tooltip definitions ──────────────────────────────────────────────────────

  const tooltipPortfolio = (
    <>
      <TipSection title="At Retirement" />
      {(summary.accountsAtRetirement ?? []).map(a => (
        <TipRow key={a.id} label={a.name} value={fmtFull(a.balance)} />
      ))}
      <TipDivider />
      <TipRow label="Total" value={fmtFull(summary.portfolioAtRetirement)} accent="text-brand-600" />
    </>
  )

  const tooltipFinal = lastRow ? (
    <>
      <TipSection title="Final Balances" />
      {(summary.accountsAtRetirement ?? []).map(a => {
        const bal = lastRow.accountBalances?.[a.id]
        return bal != null
          ? <TipRow key={a.id} label={a.name} value={fmtFull(bal)} />
          : null
      })}
      <TipDivider />
      <TipRow
        label="Total"
        value={fmtFull(lastRow.portfolioTotal)}
        accent={exhausted ? 'text-red-600' : 'text-emerald-600'}
      />
      {exhausted && (
        <>
          <TipDivider />
          <p className="text-red-500 text-[11px]">Portfolio exhausted at age {exhausted}</p>
        </>
      )}
      {summary.rrifExhaustedAge && (
        <p className="text-amber-600 text-[11px]">RRIF depleted at age {summary.rrifExhaustedAge}</p>
      )}
      {lastRow && ((lastRow.rrifTotal ?? 0) + (lastRow.tfsaTotal ?? 0) + (lastRow.nonRegTotal ?? 0)) > 0 && (
        <>
          <TipDivider />
          <TipSection title="On Death" />
          {(lastRow.tfsaTotal ?? 0) > 0 && (
            <TipRow label="TFSA — tax-free" value={fmtFull(lastRow.tfsaTotal)} accent="text-emerald-600" />
          )}
          {(lastRow.rrifTotal ?? 0) > 0 && (
            <TipRow label="RRIF — fully taxable" value={fmtFull(lastRow.rrifTotal)} accent="text-amber-600" />
          )}
          {(lastRow.nonRegTotal ?? 0) > 0 && (
            <TipRow label="Non-reg — cap gains" value={fmtFull(lastRow.nonRegTotal)} accent="text-blue-500" />
          )}
        </>
      )}
    </>
  ) : null

  const tooltipNetIncome = (
    <>
      <TipSection title="Portfolio Withdrawals" />
      <TipRow label="Gross withdrawn" value={fmt(totalPortW)} />
      <TipSection title="Government Income" />
      {totalCpp   > 0 && <TipRow label="CPP"         value={fmt(totalCpp)} />}
      {totalOas   > 0 && <TipRow label="OAS (net)"   value={fmt(totalOas)} />}
      {totalDb    > 0 && <TipRow label="DB Pension"  value={fmt(totalDb)} />}
      {totalOther > 0 && <TipRow label="Other"       value={fmt(totalOther)} />}
      <TipDivider />
      <TipRow label="Less: taxes"    value={`−${fmt(summary.totalTaxPaid)}`} accent="text-amber-600" />
      <TipRow label="Total net"      value={fmt(summary.totalNetIncome)} accent="text-gray-900 dark:text-gray-100" />
    </>
  )

  const tooltipTax = (
    <>
      <TipSection title="Breakdown" />
      <TipRow label="Federal"    value={fmt(totalFedTax)}  />
      <TipRow label="Provincial" value={fmt(totalProvTax)} />
      <TipDivider />
      <TipRow label="Total paid" value={fmt(summary.totalTaxPaid)} accent="text-amber-600" />
      {peakTaxRow && (
        <>
          <TipDivider />
          <TipSection title="Peak Year" />
          <TipRow label={`Age ${peakTaxRow.age}`} value={fmtFull(peakTaxRow.totalTax)} accent="text-amber-700" />
        </>
      )}
    </>
  )

  const tooltipRate = (
    <>
      <TipSection title="Effective Tax Rate" />
      <TipRow label="Average" value={pct(summary.avgEffectiveRate)} accent="text-gray-900 dark:text-gray-100" />
      {minRateRow && <TipRow label={`Lowest (age ${minRateRow.age})`}  value={`${(minRateRow.effectiveRate * 100).toFixed(1)}%`} accent="text-emerald-600" />}
      {maxRateRow && <TipRow label={`Highest (age ${maxRateRow.age})`} value={`${(maxRateRow.effectiveRate * 100).toFixed(1)}%`} accent="text-red-600" />}
      <TipDivider />
      <p className="text-[10px] text-gray-400">Combined federal + provincial on gross income each year</p>
    </>
  )

  // ── Monte Carlo diagnostics ───────────────────────────────────────────────────
  const activeRows    = rows.filter(r => r.portfolioTotal > 0)
  const avgWR         = activeRows.length > 0
    ? activeRows.reduce((s, r) => s + (r.withdrawalRate ?? 0), 0) / activeRows.length
    : 0
  const peakWRRow     = [...rows].sort((a, b) => (b.withdrawalRate ?? 0) - (a.withdrawalRate ?? 0))[0]
  const totalIncome   = summary.totalNetIncome + summary.totalTaxPaid
  const govCoverPct   = totalIncome > 0 ? (totalGovInc / totalIncome) * 100 : 0
  const taxDragPct    = totalIncome > 0 ? (summary.totalTaxPaid / totalIncome) * 100 : 0
  const alreadyFails  = !!summary.portfolioExhaustedAge
  const safeWRTarget  = summary.portfolioAtRetirement * 0.04  // 4% SWR annual

  const firstRow = rows[0]
  const tooltipYears = (
    <>
      <TipSection title="Timeline" />
      <TipRow label="Retirement age" value={firstRow?.age ?? '—'} />
      <TipRow label="Life expectancy" value={firstRow ? firstRow.age + summary.yearsInRetirement - 1 : '—'} />
      <TipRow label="Years funded"   value={`${summary.yearsInRetirement} yrs`} accent="text-gray-900 dark:text-gray-100" />
      {totalCpp > 0 && (
        <>
          <TipDivider />
          <TipSection title="Gov. Income" />
          {totalCpp > 0 && <TipRow label="Total CPP" value={fmt(totalCpp)} />}
          {totalOas > 0 && <TipRow label="Total OAS" value={fmt(totalOas)} />}
          {totalDb  > 0 && <TipRow label="Total DB"  value={fmt(totalDb)} />}
        </>
      )}
    </>
  )

  return (
    <div className="flex flex-wrap gap-2">
      <MetricCard
        label="Portfolio at Retirement"
        value={fmt(summary.portfolioAtRetirement)}
        color="text-brand-600"
        tooltip={tooltipPortfolio}
      />
      <MetricCard
        label="Final Balance"
        value={fmt(exhausted ? 0 : summary.finalBalance)}
        color={exhausted ? 'text-red-600' : 'text-emerald-600'}
        exhausted={!!exhausted}
        tooltip={tooltipFinal}
      />
      <MetricCard
        label="Total Net Income"
        value={fmt(summary.totalNetIncome)}
        tooltip={tooltipNetIncome}
      />
      <MetricCard
        label="Total Tax Paid"
        value={fmt(summary.totalTaxPaid)}
        color="text-amber-600"
        tooltip={tooltipTax}
      />
      <MetricCard
        label="Avg Effective Rate"
        value={pct(summary.avgEffectiveRate)}
        tooltip={tooltipRate}
      />
      <MetricCard
        label="Years in Retirement"
        value={`${summary.yearsInRetirement} yrs`}
        tooltip={tooltipYears}
      />
      {pensionSplitSaving != null && pensionSplitSaving > 0 && (
        <MetricCard
          label="Pension Split Savings"
          value={fmt(pensionSplitSaving)}
          color="text-emerald-600"
          tipWidth={240}
          tooltip={
            <>
              <TipSection title="Pension Income Splitting" />
              <TipRow label="Lifetime tax saved" value={fmtFull(pensionSplitSaving)} accent="text-emerald-600" />
              <TipDivider />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Transfers up to 50% of eligible pension income (RRIF, DB pension) to the lower-income spouse each year to minimize combined household tax.
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                CPP and OAS are not eligible for splitting.
              </p>
            </>
          }
        />
      )}
      {probabilityOfSuccess != null && (() => {
        const p          = Math.round(probabilityOfSuccess * 100)
        const pAccent    = probabilityOfSuccess >= 0.90 ? 'text-emerald-600' : probabilityOfSuccess >= 0.75 ? 'text-amber-600' : 'text-red-600'
        const wrHigh     = avgWR > 5
        const wrModerate = avgWR >= 4 && avgWR <= 5
        const wrSafe     = avgWR < 4
        const wrColor    = wrHigh ? 'text-red-600' : wrModerate ? 'text-amber-600' : 'text-emerald-600'
        const govLow     = govCoverPct < 25
        const govModerate= govCoverPct >= 25 && govCoverPct < 50
        const taxHigh    = taxDragPct > 30

        // Headline reason
        const headline = alreadyFails
          ? `⚠ Portfolio runs out at age ${summary.portfolioExhaustedAge} in the base scenario — market risk compounds this further.`
          : wrHigh
            ? `High avg withdrawal rate (${avgWR.toFixed(1)}%/yr) is the primary driver of risk — each bad market year draws down a large portion of capital.`
            : wrModerate
              ? `Withdrawal rate near the 4% guideline leaves limited buffer for poor early-retirement returns.`
              : govLow
                ? `Low guaranteed income (${govCoverPct.toFixed(0)}% of spending) means the portfolio must fund nearly all spending, amplifying sequence-of-returns risk.`
                : probabilityOfSuccess >= 0.90
                  ? `Conservative withdrawal rate and sufficient guaranteed income provide a strong cushion against market downturns.`
                  : `Moderate volatility in the portfolio mix creates meaningful sequence-of-returns risk over a long retirement.`

        // Improvement tips (show 2–4 most relevant)
        const tips = []

        if (alreadyFails) {
          const gap = peakWRRow ? Math.round((peakWRRow.withdrawalRate - 4) / 100 * (rows[0]?.portfolioTotal ?? 0)) : null
          tips.push({ icon: '🔴', text: `Reduce target income — even the deterministic plan fails. Cutting withdrawals by ~${gap ? fmt(gap) : '10%'}/yr is the highest-impact fix.` })
        } else if (wrHigh) {
          const excess = totalPortW / rows.length - safeWRTarget / 1
          tips.push({ icon: '🔴', text: `Reduce annual withdrawals by ~${fmt(Math.abs(totalPortW / rows.length - safeWRTarget))} to reach the 4% safe withdrawal rate (${fmt(safeWRTarget)}/yr).` })
        } else if (wrModerate) {
          tips.push({ icon: '🟡', text: `A 10–15% reduction in early-retirement spending gives the portfolio more time to compound and survives bad market sequences.` })
        }

        if (govLow && (totalCpp + totalOas) === 0) {
          tips.push({ icon: '💡', text: `No CPP/OAS entered. Maximizing these by deferring to age 70 can add $10–18K/yr in guaranteed income, reducing portfolio dependence by ~${govCoverPct < 10 ? '30–40%' : '15–25%'}.` })
        } else if (govLow) {
          tips.push({ icon: '💡', text: `Deferring CPP/OAS to age 70 adds ~36–42% more benefit, covering more fixed spending and reducing how much the portfolio must supply.` })
        }

        if (!alreadyFails && avgWR > 3.5) {
          tips.push({ icon: '🛡', text: `Add a 2-year cash buffer account. Spending from cash during market downturns lets investments recover without forced selling at a loss.` })
        }

        if (taxHigh) {
          tips.push({ icon: '📉', text: `Tax drag is ${taxDragPct.toFixed(0)}% of total income. A RRIF meltdown strategy — drawing RRSP/RRIF earlier at lower rates — can shift ${fmt(summary.totalTaxPaid * 0.15)} out of taxes.` })
        }

        if (probabilityOfSuccess >= 0.90 && !alreadyFails && tips.length === 0) {
          tips.push({ icon: '✅', text: `Plan is well-positioned. Consider a higher equity allocation to grow the legacy balance further, or model an earlier retirement date.` })
        }

        if (tips.length === 0) {
          tips.push({ icon: '📊', text: `Review the Forecast fan chart to see the P10/P50/P90 outcome range across 1,000 simulations.` })
        }

        return (
          <MetricCard
            label="Success Probability"
            value={`${p}%`}
            color={probabilityOfSuccess >= 0.90 ? 'text-emerald-600' : probabilityOfSuccess >= 0.75 ? 'text-amber-600' : 'text-red-600'}
            tipWidth={272}
            tooltip={
              <>
                <TipSection title="Monte Carlo — 1,000 Simulations" />
                <TipRow
                  label={`${p}% of runs succeed`}
                  value={probabilityOfSuccess >= 0.90 ? 'Strong' : probabilityOfSuccess >= 0.75 ? 'Moderate' : 'At Risk'}
                  accent={pAccent}
                />
                <TipRow label="Avg withdrawal rate" value={`${avgWR.toFixed(1)}%/yr`} accent={wrColor} />
                {govCoverPct > 0 && <TipRow label="Guaranteed income" value={`${govCoverPct.toFixed(0)}% of spending`} accent={govLow ? 'text-amber-600' : 'text-emerald-600'} />}
                <TipDivider />
                <TipSection title="Why" />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{headline}</p>
                <TipDivider />
                <TipSection title="Ways to Improve" />
                <div className="space-y-1.5">
                  {tips.map((t, i) => (
                    <p key={i} className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      <span className="mr-1">{t.icon}</span>{t.text}
                    </p>
                  ))}
                </div>
              </>
            }
          />
        )
      })()}
    </div>
  )
}
