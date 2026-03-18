import { useState, useMemo, useCallback } from 'react'
import InputPanel         from './components/InputPanel.jsx'
import StrategySelector   from './components/StrategySelector.jsx'
import RrspDrawdown       from './components/RrspDrawdown.jsx'
import ResultsSummary     from './components/ResultsSummary.jsx'
import AccumulationChart  from './components/AccumulationChart.jsx'
import AccumulationTable  from './components/AccumulationTable.jsx'
import BalanceChart       from './components/BalanceChart.jsx'
import CashflowChart      from './components/CashflowChart.jsx'
import DetailTable        from './components/DetailTable.jsx'
import { runSimulation, buildAccumulationRows } from './lib/simulate.js'

const DEFAULT_INPUTS = {
  // Profile
  currentAge:     45,
  retirementAge:  65,
  lifeExpectancy: 90,
  province:       'ON',
  // Accounts
  accounts: [
    { id: 'rrif',   name: 'RRSP / RRIF',    balance: 250000, annualContribution: 10500, returnRate: 7,   taxType: 'rrif'   },
    { id: 'tfsa',   name: 'TFSA',           balance: 80000,  annualContribution: 7000,  returnRate: 7,   taxType: 'tfsa'   },
    { id: 'nonreg', name: 'Non-Registered', balance: 50000,  annualContribution: 0,     returnRate: 6.5, taxType: 'nonreg' },
  ],
  // Retirement
  inflation: 2.5,
  // CPP
  cppAvgEarnings:      60000,
  cppYearsContributed: 35,
  cppStartAge:         65,
  // OAS
  oasYearsResident:    40,
  oasStartAge:         65,
  // Defined Benefit
  dbEnabled:           false,
  dbBestAvgSalary:     80000,
  dbYearsService:      25,
  dbAccrualRate:       1.5,
  dbStartAge:          65,
  dbIndexingRate:      0,
  // Other
  otherPension:        0,
  // Tax assumptions
  workingMarginalRate: 40,
  nonRegOrdinaryPct:   0,
  // RRSP/RRIF drawdown
  rrspDrawdown: { type: 'none', fixedAmount: 30000, targetAge: 80, targetAnnualIncome: 80000, reinvestSurplus: true },
}

const DEFAULT_STRATEGY = {
  strategyType:   'fixedPct',
  strategyParams: {
    rate:             0.04,
    baseAmount:       60000,
    initialRate:      0.05,
    upperGuardrail:   0.06,
    lowerGuardrail:   0.04,
    adjustmentFactor: 0.10,
    cashYears:        2,
    bondYears:        5,
    annualExpense:    60000,
    bondReturn:       0.04,
    equityReturn:     0.07,
    targetAge:        90,
    targetBalance:    0,
  },
}

const TABS = [
  { id: 'charts',   label: 'Charts' },
  { id: 'retTable', label: 'Retirement Cashflow' },
  { id: 'accTable', label: 'Accumulation Cashflow' },
]

export default function App() {
  const [inputs,       setInputs]       = useState(DEFAULT_INPUTS)
  const [strategy,     setStrategy]     = useState(DEFAULT_STRATEGY)
  const [activeTab,    setActiveTab]    = useState('charts')
  const [cashOutflows, setCashOutflows] = useState({})
  const [rrspDrawdown, setRrspDrawdown] = useState(DEFAULT_INPUTS.rrspDrawdown)

  const result = useMemo(() => {
    try {
      return runSimulation({
        ...inputs,
        cashOutflows,
        strategyType:   strategy.strategyType,
        strategyParams: {
          ...strategy.strategyParams,
          inflation: inputs.inflation / 100,
        },
        rrspDrawdown,
      })
    } catch (e) {
      console.error('Simulation error:', e)
      return null
    }
  }, [inputs, cashOutflows, strategy, rrspDrawdown])

  const accRows = useMemo(() => {
    try {
      return buildAccumulationRows({
        accounts:            inputs.accounts,
        currentAge:          inputs.currentAge,
        retirementAge:       inputs.retirementAge,
        workingMarginalRate: inputs.workingMarginalRate,
        nonRegOrdinaryPct:   inputs.nonRegOrdinaryPct,
      })
    } catch (e) {
      console.error('Accumulation error:', e)
      return []
    }
  }, [inputs.accounts, inputs.currentAge, inputs.retirementAge, inputs.workingMarginalRate, inputs.nonRegOrdinaryPct])

  const handleInputChange      = useCallback((newInputs) => setInputs(newInputs), [])
  const handleStrategyChange   = useCallback((s) => setStrategy(s), [])
  const handleRrspDrawdownChange = useCallback((d) => setRrspDrawdown(d), [])
  const handleOutflowChange  = useCallback((age, amount) => {
    setCashOutflows(prev => ({ ...prev, [age]: amount }))
  }, [])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-brand-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Canadian Retirement Calculator</h1>
            <p className="text-brand-100 text-xs mt-0.5">
              RRSP/RRIF · TFSA · Non-Reg · CPP · OAS · Canadian Tax (2025)
            </p>
          </div>
          <div className="text-right text-xs text-brand-200">
            <p>Rates: Federal + All Provinces</p>
            <p>RRIF minimums from age 72</p>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 py-6 flex gap-5">

        {/* Left sidebar — inputs */}
        <aside className="w-72 shrink-0">
          <div className="card sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <InputPanel inputs={inputs} onChange={handleInputChange} />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-5">

          {/* Strategy selectors — side by side */}
          <div className="grid grid-cols-2 gap-5">
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Drawdown Strategy</h2>
              <StrategySelector
                strategyType={strategy.strategyType}
                strategyParams={strategy.strategyParams}
                onChange={handleStrategyChange}
              />
            </div>
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">RRSP / RRIF Drawdown</h2>
              <RrspDrawdown
                rrspDrawdown={rrspDrawdown}
                onChange={handleRrspDrawdownChange}
              />
            </div>
          </div>

          {/* Summary metrics */}
          {result && <ResultsSummary summary={result.summary} />}

          {/* Tab switcher */}
          {result && (
            <div className="flex gap-2 border-b border-slate-200 pb-0">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                    activeTab === t.id
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Charts */}
          {result && activeTab === 'charts' && (
            <div className="space-y-4">
              <AccumulationChart
                accounts={inputs.accounts}
                currentAge={inputs.currentAge}
                retirementAge={inputs.retirementAge}
                inflation={inputs.inflation}
                workingMarginalRate={inputs.workingMarginalRate}
                nonRegOrdinaryPct={inputs.nonRegOrdinaryPct}
              />
              <BalanceChart rows={result.rows} accountMeta={result.accountMeta} inflation={inputs.inflation} retirementAge={inputs.retirementAge} />
              <CashflowChart rows={result.rows} inflation={inputs.inflation} retirementAge={inputs.retirementAge} />

              {/* Tax breakdown note */}
              {result.summary.totalTaxPaid > 0 && (
                <div className="card bg-amber-50 border-amber-200">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">Tax Insights</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-amber-600">Total Federal Tax</p>
                      <p className="font-bold text-amber-900">
                        ${result.rows.reduce((s, r) => s + r.federalTax, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-amber-600">Total Provincial Tax</p>
                      <p className="font-bold text-amber-900">
                        ${result.rows.reduce((s, r) => s + r.provincialTax, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-amber-600">Total OAS Clawback</p>
                      <p className="font-bold text-amber-900">
                        ${result.rows.reduce((s, r) => s + r.oasClawback, 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-amber-600">Avg Marginal Rate (yr 1)</p>
                      <p className="font-bold text-amber-900">
                        {result.rows[0] ? `${(result.rows[0].effectiveRate * 100).toFixed(1)}% eff.` : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* OAS clawback warning */}
              {result.rows.some(r => r.oasClawback > 0) && (
                <div className="card bg-red-50 border-red-200 text-sm text-red-700">
                  <strong>OAS Clawback Warning:</strong> Your income in some years exceeds the clawback
                  threshold (~$91K). Consider a lower-income strategy or TFSA-first withdrawals to reduce clawback.
                </div>
              )}
            </div>
          )}

          {/* Retirement Cashflow table */}
          {result && activeTab === 'retTable' && (
            <DetailTable
              rows={result.rows}
              cashOutflows={cashOutflows}
              onOutflowChange={handleOutflowChange}
            />
          )}

          {/* Accumulation Cashflow table */}
          {activeTab === 'accTable' && (
            <AccumulationTable
              rows={accRows}
              accounts={inputs.accounts}
            />
          )}

          {/* Disclaimer */}
          <p className="text-xs text-slate-400 text-center pt-2">
            For educational purposes only. Not financial or tax advice.
            Tax rates are approximate 2025 values. Consult a qualified advisor.
          </p>
        </main>
      </div>
    </div>
  )
}
