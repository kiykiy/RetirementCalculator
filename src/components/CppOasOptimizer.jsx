import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { calcCPP, calcOAS } from '../lib/simulate.js'

// ─── Calculation helpers ───────────────────────────────────────────────────────

function cppAtAge(base65, startAge) {
  const months = (startAge - 65) * 12
  const factor = months >= 0 ? 1 + months * 0.007 : 1 + months * 0.006
  return Math.round(base65 * factor)
}

function oasAtAge(base65, startAge) {
  const months = Math.max(0, (startAge - 65) * 12)
  return Math.round(base65 * (1 + months * 0.006))
}

function calcBreakEven(ageA, annualA, ageB, annualB) {
  if (ageB <= ageA || annualB <= annualA) return null
  const be = (annualB * ageB - annualA * ageA) / (annualB - annualA)
  return Math.round(be * 10) / 10
}

function cumulativePayout(annual, startAge, toAge) {
  return annual * Math.max(0, toAge - startAge)
}

function fmt(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)    return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function fmtAge(a) { return a == null ? '—' : `age ${a.toFixed(1)}` }

const CPP_AGES = [60, 62, 65, 67, 70]
const OAS_AGES = [65, 66, 67, 68, 70]

// ─── BreakEvenNote ────────────────────────────────────────────────────────────

function BreakEvenNote({ selectedAge, refAge, selectedAnnual, refAnnual, lifeExpectancy }) {
  if (selectedAge === refAge) {
    return <p className="text-[11px] text-gray-400 dark:text-gray-500">Standard age — no adjustment</p>
  }

  const delta = selectedAnnual - refAnnual

  if (selectedAge < refAge) {
    const be = calcBreakEven(selectedAge, selectedAnnual, refAge, refAnnual)
    return (
      <div className="space-y-0.5">
        <p className="text-[11px] text-red-500 dark:text-red-400 font-medium">
          {fmt(Math.abs(delta))}/yr less than age {refAge}
        </p>
        {be != null && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Taking early pays off only if you pass before{' '}
            <span className={`font-medium ${be <= lifeExpectancy ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}`}>
              {fmtAge(be)}
            </span>
            {be > lifeExpectancy ? ' — past your life expectancy' : ' — before your life expectancy ⚠'}
          </p>
        )}
      </div>
    )
  }

  const be = calcBreakEven(refAge, refAnnual, selectedAge, selectedAnnual)
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
        +{fmt(delta)}/yr more than age {refAge}
      </p>
      {be != null && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Deferral pays off at{' '}
          <span className={`font-medium ${be <= lifeExpectancy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {fmtAge(be)}
          </span>
          {be <= lifeExpectancy ? ' — before your life expectancy ✓' : ' — past your life expectancy ⚠'}
        </p>
      )}
    </div>
  )
}

// ─── RefRow ───────────────────────────────────────────────────────────────────

function RefRow({ label, annual, beVs65, lifeExpectancy, isSelected, isRef }) {
  return (
    <div className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ${isSelected ? 'bg-gray-100 dark:bg-gray-800' : ''}`}>
      <span className={`w-8 tabular-nums flex-shrink-0 ${isRef ? 'text-gray-500' : isSelected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
        {label}
      </span>
      <span className="flex-1 tabular-nums text-right text-gray-700 dark:text-gray-300">{fmt(annual)}/yr</span>
      <span className={`w-20 text-right tabular-nums text-[10px] flex-shrink-0 ${
        beVs65 == null ? 'text-gray-300 dark:text-gray-600' :
        beVs65 <= lifeExpectancy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
      }`}>
        {beVs65 == null ? 'baseline' : `BE ${fmtAge(beVs65)}`}
      </span>
    </div>
  )
}

// ─── CumulativePayoutChart ─────────────────────────────────────────────────────

function CumulativePayoutChart({ base65, lifeExp, selectedAge, ageFn, ages, label }) {
  const data = ages.map(age => {
    const annual = ageFn(base65, age)
    const total  = cumulativePayout(annual, age, lifeExp)
    return { age: `${age}`, total, annual }
  })
  const maxAge = ages.reduce((best, age) => {
    const t = cumulativePayout(ageFn(base65, age), age, lifeExp)
    return t > cumulativePayout(ageFn(base65, best), best, lifeExp) ? age : best
  }, ages[0])

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label} — Lifetime Cumulative Payout
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} barSize={22}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="age" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 10 }} width={44} />
          <Tooltip
            formatter={(v, n, p) => [fmt(v), 'Lifetime total']}
            labelFormatter={l => `Start age ${l}`}
            contentStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="total" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={String(entry.age) === String(selectedAge)
                  ? '#3b82f6'
                  : String(entry.age) === String(maxAge)
                  ? '#10b981'
                  : '#e5e7eb'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Best</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />Selected</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" />Other</span>
      </div>
    </div>
  )
}


// ─── CppSection / OasSection — standalone column components ──────────────────

function CppSection({ base65CPP, cppAge, setCppAge, adjLifeExp }) {
  const cppSelected = cppAtAge(base65CPP, cppAge)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">CPP</p>
        <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          Age {cppAge} · {fmt(cppSelected)}/yr
        </span>
      </div>

      <input
        type="range" min={60} max={70} step={1} value={cppAge}
        onChange={e => setCppAge(parseInt(e.target.value))}
        className="w-full accent-gray-900 dark:accent-white"
      />
      <div className="flex justify-between text-[10px] text-gray-300 dark:text-gray-600 -mt-1">
        <span>60</span><span>62</span><span>65</span><span>67</span><span>70</span>
      </div>

      <BreakEvenNote
        selectedAge={cppAge} refAge={65}
        selectedAnnual={cppSelected} refAnnual={base65CPP}
        lifeExpectancy={adjLifeExp}
      />

      <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1 bg-gray-50 dark:bg-gray-800/60">
          <span className="w-8">Age</span>
          <span className="flex-1 text-right">Annual</span>
          <span className="w-20 text-right">BE vs 65</span>
        </div>
        {CPP_AGES.map(age => {
          const annual = cppAtAge(base65CPP, age)
          const beVs65 = age < 65 ? calcBreakEven(age, annual, 65, base65CPP)
                       : age > 65 ? calcBreakEven(65, base65CPP, age, annual)
                       : null
          return <RefRow key={age} label={`${age}`} annual={annual} beVs65={beVs65} lifeExpectancy={adjLifeExp} isSelected={age === cppAge} isRef={age === 65} />
        })}
      </div>

      <CumulativePayoutChart base65={base65CPP} lifeExp={adjLifeExp} selectedAge={cppAge} ageFn={cppAtAge} ages={CPP_AGES} label="CPP" />
    </div>
  )
}

function OasSection({ base65OAS, oasAge, setOasAge, adjLifeExp }) {
  const oasSelected = oasAtAge(base65OAS, oasAge)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">OAS</p>
        <span className="text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          Age {oasAge} · {fmt(oasSelected)}/yr
        </span>
      </div>

      <input
        type="range" min={65} max={70} step={1} value={oasAge}
        onChange={e => setOasAge(parseInt(e.target.value))}
        className="w-full accent-gray-900 dark:accent-white"
      />
      <div className="flex justify-between text-[10px] text-gray-300 dark:text-gray-600 -mt-1">
        <span>65</span><span>66</span><span>67</span><span>68</span><span>69</span><span>70</span>
      </div>

      <BreakEvenNote
        selectedAge={oasAge} refAge={65}
        selectedAnnual={oasSelected} refAnnual={base65OAS}
        lifeExpectancy={adjLifeExp}
      />

      <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1 bg-gray-50 dark:bg-gray-800/60">
          <span className="w-8">Age</span>
          <span className="flex-1 text-right">Annual</span>
          <span className="w-20 text-right">BE vs 65</span>
        </div>
        {OAS_AGES.map(age => {
          const annual = oasAtAge(base65OAS, age)
          const beVs65 = age > 65 ? calcBreakEven(65, base65OAS, age, annual) : null
          return <RefRow key={age} label={`${age}`} annual={annual} beVs65={beVs65} lifeExpectancy={adjLifeExp} isSelected={age === oasAge} isRef={age === 65} />
        })}
      </div>

      <CumulativePayoutChart base65={base65OAS} lifeExp={adjLifeExp} selectedAge={oasAge} ageFn={oasAtAge} ages={OAS_AGES} label="OAS" />
    </div>
  )
}

// ─── PersonCppOas — one person's full CPP+OAS panel ──────────────────────────
// sideBySide=true  → CPP and OAS in two columns (single-person, 520px card)
// sideBySide=false → CPP then OAS stacked (spouse columns, narrower)

function PersonCppOas({ label, base65CPP, base65OAS, cppAge, setCppAge, oasAge, setOasAge, adjLifeExp, sideBySide = false }) {
  return (
    <div className="space-y-3">
      {label && (
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 pb-1.5 border-b border-gray-100 dark:border-gray-800">
          {label}
        </p>
      )}
      {sideBySide ? (
        <div className="grid grid-cols-2 gap-5">
          <CppSection base65CPP={base65CPP} cppAge={cppAge} setCppAge={setCppAge} adjLifeExp={adjLifeExp} />
          <OasSection base65OAS={base65OAS} oasAge={oasAge} setOasAge={setOasAge} adjLifeExp={adjLifeExp} />
        </div>
      ) : (
        <div className="space-y-4">
          <CppSection base65CPP={base65CPP} cppAge={cppAge} setCppAge={setCppAge} adjLifeExp={adjLifeExp} />
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <OasSection base65OAS={base65OAS} oasAge={oasAge} setOasAge={setOasAge} adjLifeExp={adjLifeExp} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared inner content ─────────────────────────────────────────────────────

export function CppOasContent({ inputs, onApply }) {
  const [cppAge, setCppAge] = useState(inputs.cppStartAge ?? 65)
  const [oasAge, setOasAge] = useState(inputs.oasStartAge ?? 65)

  const adjLifeExp = inputs.lifeExpectancy ?? 90

  const hasChanges = cppAge !== (inputs.cppStartAge ?? 65) || oasAge !== (inputs.oasStartAge ?? 65)

  const baseCPP65 = useMemo(() => calcCPP({
    avgEarnings:      inputs.cppAvgEarnings      ?? 0,
    yearsContributed: inputs.cppYearsContributed ?? 0,
    startAge: 65,
  }), [inputs.cppAvgEarnings, inputs.cppYearsContributed])

  const baseOAS65 = useMemo(() => calcOAS({
    yearsResident: inputs.oasYearsResident ?? 40,
    startAge: 65,
  }), [inputs.oasYearsResident])

  function handleApply() {
    if (onApply) onApply({ cppStartAge: cppAge, oasStartAge: oasAge })
  }
  function handleReset() {
    setCppAge(inputs.cppStartAge ?? 65)
    setOasAge(inputs.oasStartAge ?? 65)
  }

  return (
    <div className="space-y-4">

      {/* Title + actions row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">CPP / OAS Timing</p>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button onClick={handleReset} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Reset
            </button>
          )}
          {onApply && (
            <button
              onClick={handleApply}
              disabled={!hasChanges}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                hasChanges
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-default'
              }`}
            >
              Apply to Plan
            </button>
          )}
        </div>
      </div>

      <PersonCppOas
        base65CPP={baseCPP65} base65OAS={baseOAS65}
        cppAge={cppAge} setCppAge={setCppAge}
        oasAge={oasAge} setOasAge={setOasAge}
        adjLifeExp={adjLifeExp}
        sideBySide={true}
      />

      {/* Footnote */}
      <p className="text-[10px] text-gray-300 dark:text-gray-600 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-2">
        Break-even vs taking at 65. Does not account for tax, investment returns on early payments, or OAS clawback.
      </p>

    </div>
  )
}

// ─── Default export ────────────────────────────────────────────────────────────

export default CppOasContent
