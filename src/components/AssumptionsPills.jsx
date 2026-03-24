import { useMemo } from 'react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function weightedReturn(accounts = []) {
  const total = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  if (total <= 0) return '—'
  const wr = accounts.reduce((s, a) => s + (a.balance ?? 0) * (a.returnRate ?? 0), 0) / total
  return wr.toFixed(1)
}

const SEQ_ABBR = { rrif: 'R', tfsa: 'T', nonreg: 'NR' }
function shortSeq(seq = []) {
  if (!seq.length) return '—'
  return seq.map(s => SEQ_ABBR[s] ?? s).join('→')
}

// ── Pill definitions ─────────────────────────────────────────────────────────

function buildPills(inputs, isSpouse = false) {
  const src = isSpouse ? inputs.spouse : inputs
  if (!src) return []
  const tag = isSpouse ? '(S) ' : ''

  const pills = [
    { label: `${tag}Return`,    val: weightedReturn(src.accounts ?? inputs.accounts), suffix: '%', section: 'accounts' },
    { label: `${tag}Inflation`, val: inputs.inflation,           suffix: '%', section: 'inflation' },
    { label: `${tag}Retire`,    val: src.retirementAge,                       section: 'profile' },
    { label: `${tag}Life`,      val: src.lifeExpectancy,                      section: 'profile' },
    { label: `${tag}CPP`,       val: `@${src.cppStartAge}`,                  section: 'cpp' },
    { label: `${tag}OAS`,       val: `@${src.oasStartAge}`,                  section: 'oas' },
  ]

  if (src.dbEnabled) {
    pills.push({ label: `${tag}DB Pension`, val: '✓', section: 'pension' })
  }

  if (!isSpouse) {
    pills.push({ label: 'Withdraw', val: shortSeq(inputs.withdrawalSequence), section: 'profile' })
    pills.push({ label: 'Province',  val: inputs.province,                    section: 'profile' })
  }

  return pills
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AssumptionsPills({ inputs, onOpenSection, className = '' }) {
  const pills = useMemo(() => {
    const primary = buildPills(inputs, false)
    const spouse  = inputs.spouse?.enabled ? buildPills(inputs, true) : []
    return [...primary, ...spouse]
  }, [inputs])

  return (
    <div className={`flex flex-wrap gap-1.5 items-center ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300 dark:text-gray-600 select-none mr-0.5">
        Assumptions
      </span>
      {pills.map((p, i) => (
        <button
          key={`${p.label}-${i}`}
          onClick={() => onOpenSection?.(p.section)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer transition-colors whitespace-nowrap"
        >
          <span className="text-gray-400 dark:text-gray-500">{p.label}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{p.val}{p.suffix ?? ''}</span>
        </button>
      ))}
    </div>
  )
}
