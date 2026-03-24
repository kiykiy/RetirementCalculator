import { useMemo, useState } from 'react'

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
  const [open, setOpen] = useState(false)

  const pills = useMemo(() => {
    const primary = buildPills(inputs, false)
    const spouse  = inputs.spouse?.enabled ? buildPills(inputs, true) : []
    return [...primary, ...spouse]
  }, [inputs])

  return (
    <div className={className}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        Assumptions
      </button>

      {/* Collapsible pills */}
      {open && (
        <div className="flex flex-wrap gap-1.5 items-center mt-1.5 pl-1">
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
      )}
    </div>
  )
}
