// SeqRiskPanel — Sequence-of-returns stress test card

const PRESETS = [
  { id: 'dotcom',    name: '2000–02 Dot-com',         returnDelta: -15, durationYears: 3 },
  { id: 'gfc',       name: '2008 Financial Crisis',    returnDelta: -25, durationYears: 2 },
  { id: 'oilshock',  name: '1973–74 Oil Shock',        returnDelta: -20, durationYears: 2 },
  { id: 'custom',    name: 'Custom',                   returnDelta: -15, durationYears: 2 },
]

export default function SeqRiskPanel({ seqRisk, onChange, isHovered }) {
  // seqRisk: { active, presetId, returnDelta, durationYears }
  const active = seqRisk.active

  function pickPreset(id) {
    const p = PRESETS.find(x => x.id === id)
    if (!p) return
    if (id === 'custom') {
      onChange({ ...seqRisk, presetId: id })
    } else {
      onChange({ ...seqRisk, presetId: id, returnDelta: p.returnDelta, durationYears: p.durationYears })
    }
  }

  const activePreset = PRESETS.find(p => p.id === seqRisk.presetId) ?? PRESETS[0]

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Sequence Risk</h3>
        <button
          onClick={() => onChange({ ...seqRisk, active: !active })}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
            active
              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {active ? 'Active' : 'Inactive'}
        </button>
      </div>

      {/* Scenario picker */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Scenario</p>
        <div className="grid grid-cols-2 gap-1">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => pickPreset(p.id)}
              className={`text-left px-2 py-1.5 rounded-md text-[11px] border transition-colors ${
                seqRisk.presetId === p.id
                  ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-medium'
                  : 'border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="block font-medium leading-tight">{p.name}</span>
              {p.id !== 'custom' && (
                <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {p.returnDelta}%/yr · {p.durationYears} yr{p.durationYears > 1 ? 's' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500 dark:text-gray-400">Return Rate Δ</span>
            <span className={`font-medium tabular-nums ${seqRisk.returnDelta < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {seqRisk.returnDelta > 0 ? '+' : ''}{seqRisk.returnDelta}% / yr
            </span>
          </div>
          <input
            type="range" min={-50} max={0} step={1} value={seqRisk.returnDelta}
            onChange={e => onChange({ ...seqRisk, returnDelta: parseInt(e.target.value), presetId: 'custom' })}
            className="w-full accent-rose-500"
          />
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-500 dark:text-gray-400">Duration</span>
            <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">
              {seqRisk.durationYears} yr{seqRisk.durationYears > 1 ? 's' : ''}
            </span>
          </div>
          <input
            type="range" min={1} max={10} step={1} value={seqRisk.durationYears}
            onChange={e => onChange({ ...seqRisk, durationYears: parseInt(e.target.value), presetId: 'custom' })}
            className="w-full accent-rose-500"
          />
        </div>
      </div>

      <p className="text-[10px] text-gray-300 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800 pt-2 leading-relaxed">
        Applies return shock to the first {seqRisk.durationYears} year{seqRisk.durationYears > 1 ? 's' : ''} of retirement only. Shown as a stressed overlay on the portfolio chart.
      </p>
    </div>
  )
}
