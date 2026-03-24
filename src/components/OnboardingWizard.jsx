import { useState } from 'react'

const PROVINCES = [
  { value: 'AB', label: 'Alberta' },
  { value: 'BC', label: 'British Columbia' },
  { value: 'MB', label: 'Manitoba' },
  { value: 'NB', label: 'New Brunswick' },
  { value: 'NL', label: 'Newfoundland' },
  { value: 'NS', label: 'Nova Scotia' },
  { value: 'ON', label: 'Ontario' },
  { value: 'PE', label: 'Prince Edward Island' },
  { value: 'QC', label: 'Quebec' },
  { value: 'SK', label: 'Saskatchewan' },
]

function fmt(n) {
  if (!n) return ''
  return Math.round(n).toLocaleString()
}
function parse(s) {
  return parseFloat(String(s).replace(/,/g, '')) || 0
}

function Step1({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Who are we planning for?</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Your name</label>
            <input
              type="text"
              placeholder="e.g. Alex"
              value={data.userName}
              onChange={e => onChange({ ...data, userName: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Province</label>
            <select
              value={data.province}
              onChange={e => onChange({ ...data, province: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Ages</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'currentAge',    label: 'Current age',    min: 18, max: 80 },
            { key: 'retirementAge', label: 'Retire at',      min: 45, max: 80 },
            { key: 'lifeExpectancy',label: 'Life expectancy', min: 70, max: 100 },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">{f.label}</label>
              <input
                type="number"
                min={f.min} max={f.max}
                value={data[f.key]}
                onChange={e => onChange({ ...data, [f.key]: parseInt(e.target.value) || f.min })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          {data.retirementAge - data.currentAge > 0
            ? `${data.retirementAge - data.currentAge} years until retirement · ${data.lifeExpectancy - data.retirementAge} years in retirement`
            : 'Adjust your ages above'}
        </p>
      </div>
    </div>
  )
}

function Step2({ data, onChange }) {
  const update = (id, field, val) => onChange({
    ...data,
    accounts: data.accounts.map(a => a.id === id ? { ...a, [field]: val } : a)
  })
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        Enter your current balances. You can fine-tune contributions and returns later in the Accounts section.
      </p>
      <div className="space-y-2">
        {data.accounts.map(acc => (
          <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{acc.name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {{ rrif: 'Tax-deferred · grows tax-free', tfsa: 'Tax-free growth & withdrawals', nonreg: 'Taxable investment account' }[acc.taxType] ?? ''}
              </p>
            </div>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={acc.balance ? fmt(acc.balance) : ''}
                onChange={e => update(acc.id, 'balance', parse(e.target.value))}
                className="w-full pl-7 pr-3 py-2 text-sm text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-3 py-2 text-[11px] text-blue-600 dark:text-blue-400">
        💡 Don't know the exact balance? A rough estimate is fine — you can update it anytime.
      </div>
    </div>
  )
}

function Step3({ data, onChange }) {
  const set = (key, val) => onChange({ ...data, [key]: val })
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        These government benefits are automatically estimated. Override them if you know your exact amounts.
      </p>
      <div className="space-y-3">
        <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 space-y-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">CPP (Canada Pension Plan)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Avg employment income</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                <input type="text" inputMode="numeric"
                  value={data.cppAvgEarnings ? fmt(data.cppAvgEarnings) : ''}
                  onChange={e => set('cppAvgEarnings', parse(e.target.value))}
                  className="w-full pl-6 pr-2 py-2 text-sm text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Years contributed</label>
              <input type="number" min={0} max={40}
                value={data.cppYearsContributed}
                onChange={e => set('cppYearsContributed', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">CPP start age</label>
              <input type="number" min={60} max={70}
                value={data.cppStartAge}
                onChange={e => set('cppStartAge', parseInt(e.target.value) || 65)}
                className="w-full px-3 py-2 text-sm text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">OAS start age</label>
              <input type="number" min={65} max={70}
                value={data.oasStartAge}
                onChange={e => set('oasStartAge', parseInt(e.target.value) || 65)}
                className="w-full px-3 py-2 text-sm text-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Annual Salary (remaining working years)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input type="text" inputMode="numeric"
              placeholder="0 if already retired"
              value={data.annualSalary ? fmt(data.annualSalary) : ''}
              onChange={e => set('annualSalary', parse(e.target.value))}
              className="w-full pl-7 pr-3 py-2 text-sm text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Step4({ data, onChange }) {
  const [targetEnabled, setTargetEnabled] = useState((data.annualSpendTarget ?? 0) > 0)
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        What does a good retirement look like for you? These goals shape your projections.
      </p>
      <div className="space-y-3">
        <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={targetEnabled}
              onChange={e => { setTargetEnabled(e.target.checked); if (!e.target.checked) onChange({ ...data, annualSpendTarget: 0 }) }}
              className="rounded" />
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Annual spending target in retirement</p>
          </label>
          {targetEnabled && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="text" inputMode="numeric"
                placeholder="e.g. 60,000"
                value={data.annualSpendTarget ? fmt(data.annualSpendTarget) : ''}
                onChange={e => onChange({ ...data, annualSpendTarget: parse(e.target.value) })}
                className="w-full pl-7 pr-3 py-2 text-sm text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            Not sure? A common rule of thumb is 70–80% of your pre-retirement income.
            {data.annualSalary > 0 && ` For you, that's ~$${Math.round(data.annualSalary * 0.75 / 1000)}K/yr.`}
          </p>
        </div>

        <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Estate goal (optional)</p>
          <p className="text-[11px] text-gray-400">Amount you'd like to leave to heirs after tax.</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={data.estateGoalEnabled ?? false}
              onChange={e => onChange({ ...data, estateGoalEnabled: e.target.checked })}
              className="rounded" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Set an estate goal</span>
          </label>
          {data.estateGoalEnabled && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="text" inputMode="numeric"
                placeholder="e.g. 500,000"
                value={data.estateGoal ? fmt(data.estateGoal) : ''}
                onChange={e => onChange({ ...data, estateGoal: parse(e.target.value) })}
                className="w-full pl-7 pr-3 py-2 text-sm text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 space-y-2">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Annual RRSP / TFSA contributions (working years)</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'rrif', label: 'RRSP' },
              { id: 'tfsa', label: 'TFSA' },
            ].map(acc => {
              const a = data.accounts.find(a => a.id === acc.id)
              if (!a) return null
              return (
                <div key={acc.id}>
                  <label className="text-[10px] text-gray-500 mb-1 block">{acc.label}/yr</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input type="text" inputMode="numeric"
                      value={a.annualContribution ? fmt(a.annualContribution) : ''}
                      onChange={e => onChange({ ...data, accounts: data.accounts.map(ac => ac.id === acc.id ? { ...ac, annualContribution: parse(e.target.value) } : ac) })}
                      className="w-full pl-6 pr-2 py-2 text-sm text-right rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Step5({ data }) {
  const totalBalance = data.accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const yearsToRet   = Math.max(0, data.retirementAge - data.currentAge)
  const retYears     = data.lifeExpectancy - data.retirementAge

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 space-y-3">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">You're all set, {data.userName || 'friend'}! 🎉</p>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Years until retirement</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{yearsToRet} years</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Years in retirement</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{retYears} years</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total savings entered</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">${totalBalance >= 1_000_000 ? `${(totalBalance/1_000_000).toFixed(2)}M` : `${(totalBalance/1_000).toFixed(0)}K`}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">What's next</p>
        {[
          { icon: '📊', title: 'Review your projection', desc: 'See how your portfolio grows and when it runs out — if ever.' },
          { icon: '💰', title: 'Set a spending target', desc: 'Tell us how much you want to spend each year in retirement.' },
          { icon: '🏠', title: 'Add real estate', desc: 'Include property equity and rental income in your net worth.' },
          { icon: '📋', title: 'Build your budget', desc: 'Track monthly expenses and plan for big purchases.' },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/40">
            <span className="text-base mt-0.5">{item.icon}</span>
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const STEPS = [
  { id: 'profile',  title: 'Your Profile',   subtitle: 'Tell us about yourself',           icon: '👤' },
  { id: 'accounts', title: 'Your Savings',   subtitle: 'Current account balances',         icon: '🏦' },
  { id: 'income',   title: 'Income',         subtitle: 'CPP, OAS & employment income',     icon: '💼' },
  { id: 'goals',    title: 'Goals',          subtitle: 'Spending targets & contributions', icon: '🎯' },
  { id: 'done',     title: "You're Ready",   subtitle: 'Start exploring your plan',        icon: '✅' },
]

export default function OnboardingWizard({ inputs, onChange, onClose }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState({
    userName:            inputs.userName       ?? '',
    province:            inputs.province       ?? 'ON',
    currentAge:          inputs.currentAge     ?? 45,
    retirementAge:       inputs.retirementAge  ?? 65,
    lifeExpectancy:      inputs.lifeExpectancy ?? 90,
    accounts:            inputs.accounts       ?? [],
    cppAvgEarnings:      inputs.cppAvgEarnings      ?? 60000,
    cppYearsContributed: inputs.cppYearsContributed ?? 35,
    cppStartAge:         inputs.cppStartAge         ?? 65,
    oasStartAge:         inputs.oasStartAge          ?? 65,
    annualSalary:        inputs.annualSalary         ?? 0,
    annualSpendTarget:   0,
    estateGoalEnabled:   inputs.estateGoalEnabled    ?? false,
    estateGoal:          inputs.estateGoal            ?? 0,
  })

  function handleFinish() {
    // Merge draft back into inputs
    onChange({
      ...inputs,
      userName:            draft.userName,
      province:            draft.province,
      currentAge:          draft.currentAge,
      retirementAge:       draft.retirementAge,
      lifeExpectancy:      draft.lifeExpectancy,
      accounts:            draft.accounts,
      cppAvgEarnings:      draft.cppAvgEarnings,
      cppYearsContributed: draft.cppYearsContributed,
      cppStartAge:         draft.cppStartAge,
      oasStartAge:         draft.oasStartAge,
      annualSalary:        draft.annualSalary,
      estateGoalEnabled:   draft.estateGoalEnabled,
      estateGoal:          draft.estateGoal,
    })
    onClose()
  }

  const isLast = step === STEPS.length - 1
  const cur    = STEPS[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-brand-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{cur.icon}</span>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{cur.title}</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">{cur.subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 mt-3">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-brand-500' :
                  i < step   ? 'w-1.5 bg-brand-300 dark:bg-brand-700' :
                               'w-1.5 bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {step === 0 && <Step1 data={draft} onChange={setDraft} />}
          {step === 1 && <Step2 data={draft} onChange={setDraft} />}
          {step === 2 && <Step3 data={draft} onChange={setDraft} />}
          {step === 3 && <Step4 data={draft} onChange={setDraft} />}
          {step === 4 && <Step5 data={draft} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
            className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            {step === 0 ? 'Skip setup' : '← Back'}
          </button>

          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                onClick={() => setStep(s => s + 1)}
                className="px-5 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={isLast ? handleFinish : () => setStep(s => s + 1)}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              {isLast ? 'View my plan →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
