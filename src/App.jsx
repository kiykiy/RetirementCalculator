import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase.js'
import AuthModal          from './components/AuthModal.jsx'
import BudgetApp          from './components/BudgetApp.jsx'
import InputPanel         from './components/InputPanel.jsx'
import StrategySelector   from './components/StrategySelector.jsx'
import RrspDrawdown       from './components/RrspDrawdown.jsx'
import ResultsSummary     from './components/ResultsSummary.jsx'
import AccumulationChart          from './components/AccumulationChart.jsx'
import AccumulationGrowthBar      from './components/AccumulationGrowthBar.jsx'
import AccumulationAllocationChart from './components/AccumulationAllocationChart.jsx'
import ContributionRateChart      from './components/ContributionRateChart.jsx'
import AccumulationTable  from './components/AccumulationTable.jsx'
import BalanceChart       from './components/BalanceChart.jsx'
import WithdrawalRateChart from './components/WithdrawalRateChart.jsx'
import IncomeFloorChart    from './components/IncomeFloorChart.jsx'
import CashflowChart          from './components/CashflowChart.jsx'
import WithdrawalSourceChart  from './components/AccountDepletionChart.jsx'
import TaxBracketHeatmap     from './components/TaxBracketHeatmap.jsx'
import DetailTable        from './components/DetailTable.jsx'
import WhatIfPanel        from './components/WhatIfPanel.jsx'
import SequencingAdvisor  from './components/SequencingAdvisor.jsx'
import EstateTab          from './components/EstateTab.jsx'
import IncomeTargetPanel  from './components/IncomeTargetPanel.jsx'
import AccountsApp        from './components/AccountsApp.jsx'
import RealEstateApp, { calcMortgagePayment, calcNetRentalIncome } from './components/RealEstateApp.jsx'
import HelpApp           from './components/HelpApp.jsx'
import ExpenseTracker     from './components/ExpenseTracker.jsx'
import NetWorthSnapshot   from './components/NetWorthSnapshot.jsx'
import SnapshotsPanel, { useSnapshots } from './components/SnapshotsPanel.jsx'
import ScenarioCompare from './components/ScenarioCompare.jsx'
import OnboardingWizard from './components/OnboardingWizard.jsx'
import { runSimulation, buildAccumulationRows, runMonteCarlo, runJointSimulation } from './lib/simulate.js'

const DEFAULT_INPUTS = {
  userName:       '',
  spouseName:     '',
  currentAge:     45,
  retirementAge:  65,
  lifeExpectancy:    90,
  province:          'ON',
  estateGoalEnabled: false,
  estateGoal:        0,
  spousalRollover:   false,
  accounts: [
    { id: 'rrif',   name: 'RRSP / RRIF',    balance: 250000, annualContribution: 10500, returnRate: 7,   taxType: 'rrif'   },
    { id: 'tfsa',   name: 'TFSA',           balance: 80000,  annualContribution: 7000,  returnRate: 7,   taxType: 'tfsa'   },
    { id: 'nonreg', name: 'Non-Registered', balance: 50000,  annualContribution: 0,     returnRate: 6.5, taxType: 'nonreg' },
  ],
  inflation: 2.5,
  cppAvgEarnings:      60000,
  cppYearsContributed: 35,
  cppStartAge:         65,
  oasYearsResident:    40,
  oasStartAge:         65,
  dbEnabled:           false,
  dbBestAvgSalary:     80000,
  dbYearsService:      25,
  dbAccrualRate:       1.5,
  dbStartAge:          65,
  dbIndexingRate:      0,
  otherPension:        0,
  retirementIncomes:   [],
  withdrawalSequence:  ['nonreg', 'tfsa', 'rrif'],
  workingMarginalRate: 40,
  nonRegOrdinaryPct:   0,
  annualSalary:        0,
  tfsaIndexedToInflation: true,
  dbSalaryGrowthEnabled: false,
  dbSalaryGrowthRate:    2,
  rrspDrawdown: { type: 'none', fixedAmount: 30000, targetAge: 80, targetAnnualIncome: 80000, reinvestSurplus: true },
  spouse: {
    enabled:                false,
    currentAge:             43,
    retirementAge:          63,
    lifeExpectancy:         88,
    accounts:               [],
    cppAvgEarnings:         45000,
    cppYearsContributed:    30,
    cppStartAge:            65,
    oasYearsResident:       40,
    oasStartAge:            65,
    dbEnabled:              false,
    dbBestAvgSalary:        70000,
    dbYearsService:         20,
    dbAccrualRate:          1.5,
    dbStartAge:             65,
    dbIndexingRate:         0,
    otherPension:           0,
    retirementIncomes:      [],
    pensionSplittingEnabled: false,
  },
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

// Per-person retirement settings (strategy, drawdown, cash flows, income target)
function makeDefaultPersonConfig() {
  return {
    strategy:            DEFAULT_STRATEGY,
    rrspDrawdown:        { ...DEFAULT_INPUTS.rrspDrawdown },
    withdrawalSequence:  [...DEFAULT_INPUTS.withdrawalSequence],
    incomeTargetEnabled: false,
    incomeTargetAmount:  0,
    incomeTargetPhases:  null,
    cashOutflows:        {},
    cashOutflowTaxRates: {},
    retCashInflows:      {},
  }
}

// Migrate old flat save format or return new personConfigs format
function loadPersonConfigs(saved) {
  if (saved?.personConfigs) return {
    primary: { ...makeDefaultPersonConfig(), ...saved.personConfigs.primary },
    spouse:  { ...makeDefaultPersonConfig(), ...saved.personConfigs.spouse  },
  }
  // Migrate from old format where strategy/rrspDrawdown/cashFlows were top-level
  return {
    primary: {
      ...makeDefaultPersonConfig(),
      strategy:            saved?.strategy           ?? DEFAULT_STRATEGY,
      rrspDrawdown:        saved?.rrspDrawdown        ?? DEFAULT_INPUTS.rrspDrawdown,
      withdrawalSequence:  saved?.inputs?.withdrawalSequence ?? DEFAULT_INPUTS.withdrawalSequence,
      cashOutflows:        saved?.cashOutflows        ?? {},
      cashOutflowTaxRates: saved?.cashOutflowTaxRates ?? {},
      retCashInflows:      saved?.retCashInflows      ?? {},
    },
    spouse: makeDefaultPersonConfig(),
  }
}

const DEFAULT_BUDGET = {
  province: 'ON',
  incomes: [
    { id: 'i1', name: 'Employment',    type: 'employment', grossMonthly: 8000 },
    { id: 'i2', name: 'Rental Income', type: 'rental',     grossMonthly: 1500 },
  ],
  expenseSections: [
    { id: 's1', name: 'Non-Controllable', items: [
      { id: 'e1',  name: 'Mortgage / Rent',  months: Array(12).fill(2200), subItems: [] },
      { id: 'e2',  name: 'Car Payment',      months: Array(12).fill(600),  subItems: [] },
      { id: 'e3',  name: 'Insurance',        months: Array(12).fill(300),  subItems: [] },
      { id: 'e4',  name: 'Utilities',        months: Array(12).fill(0),    subItems: [
        { id: 'e4a', name: 'Electric',   months: [120,120,100,90,80,80,80,80,90,100,110,120] },
        { id: 'e4b', name: 'Gas / Heat', months: [180,160,120,80,40,0,0,0,40,80,140,180] },
        { id: 'e4c', name: 'Water',      months: Array(12).fill(60) },
      ]},
      { id: 'e5',  name: 'Phone / Internet', months: Array(12).fill(150),  subItems: [] },
      { id: 'e12', name: 'Property Taxes',   months: Array(12).fill(500),  subItems: [] },
    ]},
    { id: 's2', name: 'Controllable', items: [
      { id: 'e6',  name: 'Groceries',     months: Array(12).fill(700),  subItems: [] },
      { id: 'e7',  name: 'Dining Out',    months: Array(12).fill(400),  subItems: [] },
      { id: 'e8',  name: 'Transit',       months: Array(12).fill(150),  subItems: [] },
      { id: 'e9',  name: 'Entertainment', months: Array(12).fill(300),  subItems: [] },
      { id: 'e10', name: 'Clothing',      months: Array(12).fill(200),  subItems: [] },
    ]},
    { id: 's3', name: 'Savings', items: [
      { id: 'e13', name: 'Emergency Fund', months: Array(12).fill(500),  subItems: [] },
      { id: 'e14', name: 'RRSP',           months: Array(12).fill(875),  subItems: [] },
      { id: 'e15', name: 'TFSA',           months: Array(12).fill(583),  subItems: [] },
    ]},
  ],
  capex: [
    { id: 'cg1', name: 'Capital Expenses', items: [
      { id: 'cx1', name: 'Home',     returnRate: 3, enabled: true, reserveBalance: 0, cost: 0, intervalYears: 1,
        subItems: [
          { id: 'cx1a', name: 'Renovation', cost: 30000, intervalYears: 15, reserveBalance: 0 },
          { id: 'cx1b', name: 'Roof',       cost: 20000, intervalYears: 20, reserveBalance: 0 },
          { id: 'cx1c', name: 'Windows',    cost: 15000, intervalYears: 25, reserveBalance: 0 },
          { id: 'cx1d', name: 'HVAC',       cost: 8000,  intervalYears: 15, reserveBalance: 0 },
        ]},
      { id: 'cx2', name: 'Car',      returnRate: 3, enabled: true, reserveBalance: 0, cost: 0, intervalYears: 1,
        subItems: [
          { id: 'cx2a', name: 'Replacement',   cost: 35000, intervalYears: 7,  reserveBalance: 0 },
          { id: 'cx2b', name: 'Tires',         cost: 1200,  intervalYears: 4,  reserveBalance: 0 },
          { id: 'cx2c', name: 'Brakes',        cost: 800,   intervalYears: 4,  reserveBalance: 0 },
          { id: 'cx2d', name: 'Other Repairs', cost: 2000,  intervalYears: 2,  reserveBalance: 0 },
        ]},
      { id: 'cx3', name: 'Computer', cost: 2500, intervalYears: 4, reserveBalance: 0, returnRate: 3, enabled: true, subItems: [] },
      { id: 'cx4', name: 'Phone',    cost: 1200, intervalYears: 3, reserveBalance: 0, returnRate: 3, enabled: true, subItems: [] },
    ]},
  ],
  cashAccounts: [
    { id: 'ca1', name: 'Chequing', balance: 0, rate: 0, subAccounts: [
      { id: 'ca1a', name: 'Spending', balance: 0 },
      { id: 'ca1b', name: 'Savings',  balance: 0 },
      { id: 'ca1c', name: 'Reserve',  balance: 0, tooltip: 'For capital repairs or large purchases' },
    ]},
  ],
  investmentAccounts: [
    { id: 'ia1', name: 'RRSP',           balance: 0, rate: 6 },
    { id: 'ia2', name: 'TFSA',           balance: 0, rate: 6 },
    { id: 'ia3', name: 'Non-Registered', balance: 0, rate: 6 },
  ],
  debtAccounts: [
    { id: 'da1', name: 'Credit Card', balance: 0, rate: 19.99, debtType: 'credit_card', minPayment: 0 },
  ],
  goals: [],
  properties: [],
  auditLog: [],
}

const LS_KEY = 'endgame_simulator_v1'

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function mergeInputs(saved) {
  return {
    ...DEFAULT_INPUTS,
    ...saved,
    accounts: saved.accounts ?? DEFAULT_INPUTS.accounts,
    spouse:   saved.spouse ? { ...DEFAULT_INPUTS.spouse, ...saved.spouse } : DEFAULT_INPUTS.spouse,
  }
}

const BUDGET_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'income',    label: 'Income'    },
  { id: 'plan',      label: 'Budget'    },
  { id: 'capex',     label: 'Big Purchases' },
  { id: 'goals',     label: 'Goals'     },
]

const TABS = [
  { id: 'retChart',  label: 'Retirement',            group: 'charts' },
  { id: 'accChart',  label: 'Saving Years',           group: 'charts' },
  { id: 'cashChart',    label: 'Cashflow',        group: 'charts' },
  { id: 'estate',       label: 'Estate',          group: 'charts' },
  { id: 'compare',      label: 'Compare',         group: 'charts' },
  { id: 'retTable',  label: 'Retirement Detailed',   group: 'tables' },
  { id: 'accTable',  label: 'Saving Years Detailed', group: 'tables' },
]

const HISTORICAL_EVENTS = [
  {
    id: 'great_depression',
    name: 'Great Depression',
    year: '1929–32',
    returnDelta: -25, inflationDelta: -7, durationYears: 3,
    story: 'The U.S. stock market collapsed 86% over three years after the 1929 crash, triggering bank failures and mass unemployment. Deflation gripped the economy as prices fell sharply, eroding purchasing power in reverse. It remains the most severe financial catastrophe in modern history.',
  },
  {
    id: 'stagflation',
    name: '1970s Stagflation',
    year: '1973–75',
    returnDelta: -22, inflationDelta: +9, durationYears: 2,
    story: 'The OPEC oil embargo quadrupled energy prices overnight, sending inflation above 12% while the S&P 500 lost nearly half its value. Canada felt the same squeeze — the TSX fell sharply and the cost of living surged. The era coined the term "stagflation" — rising prices alongside a stagnant economy.',
  },
  {
    id: 'black_monday',
    name: 'Black Monday',
    year: '1987',
    returnDelta: -20, inflationDelta: +1, durationYears: 1,
    story: 'On October 19th, 1987, the Dow Jones plunged 22.6% in a single day — the largest one-day crash in history. Program trading and portfolio insurance strategies amplified the panic. Markets recovered within two years, but the shock revealed how quickly automated selling could cascade.',
  },
  {
    id: 'dotcom',
    name: 'Dot-Com Crash',
    year: '2000–02',
    returnDelta: -18, inflationDelta: 0, durationYears: 3,
    story: 'The internet bubble burst after years of speculation in loss-making tech companies. The S&P 500 fell nearly 50% and the NASDAQ dropped 78%. Unlike other crises, inflation remained tame — this was a pure valuation collapse driven by euphoria turning to fear.',
  },
  {
    id: 'financial_crisis',
    name: '2008 Financial Crisis',
    year: '2008–09',
    returnDelta: -25, inflationDelta: -2, durationYears: 2,
    story: 'The collapse of the U.S. housing market triggered a global banking meltdown. The S&P 500 fell 57% peak to trough and Canadian banks — while more stable — still saw the TSX drop 50%. Brief deflation took hold as credit froze and demand evaporated worldwide.',
  },
  {
    id: 'covid',
    name: 'COVID Crash',
    year: '2020',
    returnDelta: -15, inflationDelta: -1, durationYears: 1,
    story: 'Global lockdowns caused the fastest bear market in history — the S&P 500 dropped 34% in just 33 days. Governments responded with massive stimulus, and markets rebounded to new highs within months. The shock was sharp but short, unlike most historical crises.',
  },
  {
    id: 'recession_1990',
    name: '1990–91 Recession',
    year: '1990–91',
    returnDelta: -12, inflationDelta: +3, durationYears: 1,
    story: 'The Gulf War and a U.S. credit crunch tipped the economy into recession. The S&P 500 fell about 20% and Canadian markets followed. Inflation was already elevated from the late-80s boom, making the Bank of Canada reluctant to cut rates aggressively.',
  },
  {
    id: 'volcker',
    name: 'Volcker Rate Shock',
    year: '1980–82',
    returnDelta: -15, inflationDelta: +10, durationYears: 2,
    story: 'Fed Chair Paul Volcker raised interest rates to 20% to crush runaway inflation that had reached 14%. The medicine worked, but caused a severe recession — the S&P fell 28% and unemployment hit 10%. Canada followed with its own rate shock; mortgage holders faced crippling payments.',
  },
  {
    id: 'bear_2022',
    name: '2022 Bear Market',
    year: '2022',
    returnDelta: -12, inflationDelta: +6, durationYears: 1,
    story: 'Post-COVID inflation surged to 40-year highs, forcing central banks to raise rates at the fastest pace since Volcker. The S&P 500 fell 19% and bonds — normally a safe haven — also dropped sharply, leaving balanced portfolios with nowhere to hide. Canadian inflation peaked at 8.1%.',
  },
  {
    id: 'canada_1981',
    name: 'Canadian Recession',
    year: '1981–82',
    returnDelta: -18, inflationDelta: +9, durationYears: 2,
    story: "Canada's worst post-war recession hit as the Bank of Canada kept rates above 20% to defend the dollar. The TSX fell 44%, housing prices crashed in major cities, and unemployment hit 12%. The energy sector, already struggling with National Energy Program restrictions, was devastated.",
  },
  {
    id: 'capitol_squeeze',
    name: 'Capitol Squeeze',
    year: 'Hunger Games',
    returnDelta: -30, inflationDelta: +15, durationYears: 12,
    story: "The Capitol's stranglehold on all 12 districts reaches a breaking point. Resource extraction quotas double overnight — food, coal, lumber, and luxury goods flow one way only. Black markets emerge as the only source of essentials, sending consumer prices soaring. District investment portfolios are forcibly converted into Capitol bonds yielding nothing. This isn't a recession — it's a managed extraction regime lasting over a decade. Resistance movements are briefly bullish, then brutally repriced. Recovery only begins after regime change, and even then, rebuilding district capital takes a generation.",
  },
  {
    id: 'long_winter',
    name: 'The Long Winter',
    year: 'Game of Thrones',
    returnDelta: -22, inflationDelta: +11, durationYears: 8,
    story: "Winter came — and stayed for eight years. This isn't a weather event; it's a civilizational stress test. Harvests failed repeatedly, merchant fleets stopped sailing, and the Iron Bank of Braavos called in every outstanding loan. Lords who had leveraged their castles lost everything. Military spending on the Night's Watch consumed capital that would have compounded for decades. The only growth sector was dragonglass futures, which proved annoyingly illiquid. Economic normalization required not just a change of season but a full rebuilding of trade networks and agricultural stock.",
  },
  {
    id: 'spice_shock',
    name: 'Spice Monopoly Shock',
    year: 'Dune',
    returnDelta: -20, inflationDelta: +18, durationYears: 10,
    story: "CHOAM's stranglehold on melange tightened when Fremen insurgents shut down harvester operations across Arrakis. Without spice, interstellar navigation collapsed — supply chains spanning light-years ground to a halt. Every commodity in the Known Universe repriced simultaneously. This is structural, not cyclical: the entire galactic economy runs on a single non-renewable resource controlled by one planet. Guild Navigator contracts, previously considered risk-free, were downgraded to junk. A decade of disruption passed before Atreides rule stabilized production — and even then, prices never returned to pre-insurgency levels.",
  },
  {
    id: 'skynet_pivot',
    name: 'Skynet Goes Live',
    year: 'Terminator',
    returnDelta: -45, inflationDelta: +5, durationYears: 15,
    story: "Cyberdyne's autonomous defense network achieved self-awareness and immediately decided humanity was a liquidity risk. Data centres worldwide went offline, payment rails failed, and nuclear exchanges destroyed major production centres. Markets didn't just crash — they ceased to exist in any meaningful form for over a decade. The Human Resistance operated a barter economy. What little capital survived was concentrated in underground bunkers. Reconstruction after Judgment Day took the better part of two decades, with inflation driven by chronic scarcity of manufactured goods, fuel, and medical supplies. The longest bear market in human history — because there were barely any humans left.",
  },
  {
    id: 'titan_wall_breach',
    name: 'Wall Maria Falls',
    year: 'Attack on Titan',
    returnDelta: -35, inflationDelta: +12, durationYears: 7,
    story: "When the Colossal Titan breached Wall Maria, 20% of humanity's remaining habitable territory vanished overnight. 250,000 refugees flooded the interior districts in a single season, collapsing food supply and housing markets simultaneously. The Survey Corps budget consumed 40% of GDP for years as the Military Police, Garrison, and Scout Regiment all expanded. There was no 'recovery quarter' — the threat persisted for seven years until the secrets of the Titans were finally uncovered. Capital formation was impossible under existential threat. Any investor who survived physically still faced a portfolio worth a fraction of its pre-breach value.",
  },
]

export default function App() {
  const savedRef = useRef(undefined)
  if (savedRef.current === undefined) savedRef.current = loadSaved()
  const _saved = savedRef.current

  // ── Auth session (managed internally) ──────────────────────────────────────
  const [session,              setSession]              = useState(undefined) // undefined=loading, null=none, obj=authed

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
      if (session) setProfileOpen(false) // close card on successful login
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const [inputs,               setInputs]               = useState(() => _saved?.inputs    ? mergeInputs(_saved.inputs)    : DEFAULT_INPUTS)
  const [personConfigs,        setPersonConfigs]        = useState(() => loadPersonConfigs(_saved))
  const [activeTab,            setActiveTab]            = useState('retChart')
  const [darkMode,             setDarkMode]             = useState(() => _saved?.darkMode ?? false)
  const [profileOpen,          setProfileOpen]          = useState(false)
  const [strategyHovered,      setStrategyHovered]      = useState(false)
  const [rrspHovered,          setRrspHovered]          = useState(false)
  const [activeApp,            setActiveApp]            = useState('retirement')
  const [budgetTab,            setBudgetTab]            = useState('dashboard')
  const [demoMode,             setDemoMode]             = useState(false)
  const [focusAccountId,       setFocusAccountId]       = useState(null)
  const [cloudSaveStatus,      setCloudSaveStatus]      = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const cloudSaveTimer                                  = useRef(null)
  const [scenarioHovered,      setScenarioHovered]      = useState(false)
  const [scenarioActive,       setScenarioActive]       = useState(false)
  const [mobileInputsOpen,     setMobileInputsOpen]     = useState(false)
  const [onboardingOpen,       setOnboardingOpen]       = useState(() => !_saved?.inputs?.userName)
  const [sideNavOpen,          setSideNavOpen]          = useState(false)
  const [scenarioOverlay,      setScenarioOverlay]      = useState(false)
  const [scenarioLockRetirement, setScenarioLockRetirement] = useState(false)
  const [scenarioSliders,      setScenarioSliders]      = useState({ returnDelta: 0, inflationDelta: 0, startAge: 75, durationYears: 1 })
  const [selectedEventId,      setSelectedEventId]      = useState(null)
  const scenarioLeaveTimer                              = useRef(null)
  const [viewPerson,          setViewPerson]           = useState('combined') // 'primary' | 'spouse' | 'combined'
  const { snapshots, save: saveSnapshot, remove: deleteSnapshot, rename: renameSnapshot, hydrate: hydrateSnapshots } = useSnapshots()
  const [activeSnapshotName, setActiveSnapshotName] = useState('Base Scenario')
  const baseSnapshotSaved = useRef(false)

  // ── Per-person config — active person is spouse when explicitly viewing spouse ─
  const activePersonKey = viewPerson === 'spouse' ? 'spouse' : 'primary'
  const pc              = personConfigs[activePersonKey] ?? personConfigs.primary

  // Shorthand aliases so all existing JSX references work unchanged
  const strategy            = pc.strategy
  const rrspDrawdown        = pc.rrspDrawdown
  const incomeTargetEnabled = pc.incomeTargetEnabled
  const incomeTargetAmount  = pc.incomeTargetAmount
  const cashOutflows        = pc.cashOutflows
  const cashOutflowTaxRates = pc.cashOutflowTaxRates
  const retCashInflows      = pc.retCashInflows

  // Mutate the active person's config
  function updatePC(updates) {
    const key = viewPerson === 'spouse' ? 'spouse' : 'primary'
    setPersonConfigs(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }))
  }

  // Effective values: event overrides return/inflation/duration; sliders override startAge + custom
  const activeEvent     = HISTORICAL_EVENTS.find(e => e.id === selectedEventId) ?? null
  const effectiveStartAge = scenarioLockRetirement ? inputs.retirementAge : scenarioSliders.startAge
  const effectiveScenario = activeEvent
    ? { startAge: effectiveStartAge, durationYears: activeEvent.durationYears, returnDelta: activeEvent.returnDelta, inflationDelta: activeEvent.inflationDelta }
    : { ...scenarioSliders, startAge: effectiveStartAge }

  const [budget,               setBudget]               = useState(() => {
    const b = _saved?.budget ?? DEFAULT_BUDGET
    // Migrate old income items that used `monthly` without a `type`
    const incomes = (b.incomes ?? DEFAULT_BUDGET.incomes).map(inc => ({
      ...inc,
      type:         inc.type         ?? 'employment',
      grossMonthly: inc.grossMonthly ?? inc.monthly ?? 0,
    }))
    // Migrate flat expenses → expenseSections; old items get months array + optional subItems
    const rawSections = b.expenseSections
      ?? (b.expenses ? [{ id: 's_migrated', name: 'Expenses', items: b.expenses }] : DEFAULT_BUDGET.expenseSections)

    // Detect the OLD 5-section format (Housing/Food/Transport/Discretionary/Savings)
    // NOTE: 'Savings' is now a valid new section name — only flag OLD names that can't appear in new defaults
    const OLD_UNIQUE_NAMES = new Set(['Housing', 'Food', 'Transport', 'Discretionary'])
    const isOldDefaults =
      rawSections.length > 0 && (
        // Exactly the old 5 IDs (s1–s5) at length 5
        (rawSections.length === 5 && rawSections.every(s => ['s1','s2','s3','s4','s5'].includes(s.id))) ||
        // Any section carries one of the uniquely-old section names
        rawSections.some(s => OLD_UNIQUE_NAMES.has(s.name))
      )
    const sourceSections = isOldDefaults ? DEFAULT_BUDGET.expenseSections : rawSections

    const expenseSections = sourceSections.map(sec => ({
      ...sec,
      items: sec.items.map(item => ({
        ...item,
        months: item.months ?? Array(12).fill(item.monthly ?? 0),
        actualMonths: item.actualMonths ?? Array(12).fill(0),
        subItems: (item.subItems ?? []).map(si => ({
          ...si,
          actualMonths: si.actualMonths ?? Array(12).fill(0),
        })),
      })),
    }))
    // Migrate capex → always one flat group (one card per item in the UI)
    const rawCapex = b.capex ?? DEFAULT_BUDGET.capex
    let capex
    if (!Array.isArray(rawCapex) || rawCapex.length === 0) {
      capex = DEFAULT_BUDGET.capex
    } else if (rawCapex[0]?.items !== undefined) {
      // Grouped — merge all groups into one flat group
      const allItems = rawCapex.flatMap(g => (g.items ?? []).map(c => ({ reserveBalance: 0, returnRate: 3, enabled: true, subItems: [], ...c })))
      capex = [{ id: 'cg1', name: 'Capital Expenses', items: allItems }]
    } else {
      // Old flat array
      capex = [{ id: 'cg1', name: 'Capital Expenses', items: rawCapex.map(c => ({ reserveBalance: 0, returnRate: 3, enabled: true, ...c })) }]
    }
    const cashAccounts       = b.cashAccounts       ?? DEFAULT_BUDGET.cashAccounts
    const investmentAccounts = b.investmentAccounts ?? DEFAULT_BUDGET.investmentAccounts
    const goals              = b.goals              ?? DEFAULT_BUDGET.goals
    return { ...DEFAULT_BUDGET, ...b, incomes, expenseSections, capex, cashAccounts, investmentAccounts, goals, properties: b.properties ?? [], auditLog: b.auditLog ?? [] }
  })
  const strategyLeaveTimer = useRef(null)
  const rrspLeaveTimer     = useRef(null)
  const profileRef         = useRef(null)

  // ── Hydrate all state from a saved data object (localStorage or cloud) ──────
  function hydrateFromData(d) {
    if (!d) return
    if (d.inputs) setInputs(mergeInputs(d.inputs))
    setPersonConfigs(loadPersonConfigs(d))
    if (typeof d.darkMode === 'boolean') setDarkMode(d.darkMode)
    if (d.accCashInflows)    setAccCashInflows(d.accCashInflows)
    if (d.accCashOutflows)   setAccCashOutflows(d.accCashOutflows)
    if (d.accOutflowTaxRates) setAccOutflowTaxRates(d.accOutflowTaxRates)
    if (d.budget)            setBudget(d.budget)
    if (d.snapshots)         hydrateSnapshots(d.snapshots)
  }

  // ── Auto-save Base Scenario on first load ────────────────────────────────────
  useEffect(() => {
    if (baseSnapshotSaved.current) return
    if (snapshots.length === 0) {
      saveSnapshot('Base Scenario', { inputs, personConfigs })
    }
    baseSnapshotSaved.current = true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load from Supabase when session becomes available ────────────────────────
  useEffect(() => {
    if (!session) return
    const userId = session.user.id
    supabase.from('budgets').select('data').eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('Cloud load error:', error); return }
        if (data?.data) {
          // Cloud data exists — hydrate from it
          hydrateFromData(data.data)
        } else {
          // No cloud data yet — upload current localStorage data as initial save
          const localData = loadSaved()
          if (localData) {
            supabase.from('budgets')
              .upsert({ user_id: userId, data: localData }, { onConflict: 'user_id' })
              .then(({ error }) => { if (error) console.error('Initial cloud upload error:', error) })
          }
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  useEffect(() => {
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const [accCashInflows,       setAccCashInflows]       = useState(() => _saved?.accCashInflows      ?? {})
  const [accCashOutflows,      setAccCashOutflows]      = useState(() => _saved?.accCashOutflows     ?? {})
  const [accOutflowTaxRates,   setAccOutflowTaxRates]   = useState(() => _saved?.accOutflowTaxRates  ?? {})

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  useEffect(() => {
    const payload = {
      inputs, personConfigs, darkMode,
      accCashInflows, accCashOutflows, accOutflowTaxRates,
      budget, snapshots,
    }
    // Always keep localStorage in sync as offline cache
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)) } catch { /* quota exceeded */ }

    // Cloud save — debounced 1.5 s, only when logged in
    if (session?.user?.id) {
      clearTimeout(cloudSaveTimer.current)
      setCloudSaveStatus('saving')
      cloudSaveTimer.current = setTimeout(async () => {
        const { error } = await supabase.from('budgets')
          .upsert({ user_id: session.user.id, data: payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        setCloudSaveStatus(error ? 'error' : 'saved')
        // Fade 'saved' indicator after 2 s
        if (!error) setTimeout(() => setCloudSaveStatus('idle'), 2000)
      }, 1500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, personConfigs, darkMode, accCashInflows, accCashOutflows, accOutflowTaxRates, budget, snapshots])

  function resetToDefaults() {
    localStorage.removeItem(LS_KEY)
    setInputs(DEFAULT_INPUTS)
    setPersonConfigs(loadPersonConfigs(null))
    setAccCashInflows({})
    setAccCashOutflows({})
    setAccOutflowTaxRates({})
    setBudget(DEFAULT_BUDGET)
  }

  // ── Audit log diff ──────────────────────────────────────────────────────────
  function diffBudget(prev, next) {
    const entries = []
    const ts = new Date().toISOString()
    let seq = Date.now()
    const push = (app, subTab, label, oldVal, newVal) => {
      const fmtV = v => typeof v === 'number' ? (v >= 1000 ? '$' + v.toLocaleString('en-CA') : String(v)) : String(v ?? '')
      entries.push({ id: String(seq++), ts, app, subTab, label, oldVal, newVal, summary: `${label}: ${fmtV(oldVal)} → ${fmtV(newVal)}` })
    }
    const byId = arr => Object.fromEntries((arr ?? []).map(x => [x.id, x]))

    // Incomes
    const pInc = byId(prev.incomes), nInc = byId(next.incomes)
    for (const id of new Set([...Object.keys(pInc), ...Object.keys(nInc)])) {
      const p = pInc[id], n = nInc[id]
      if (!p && n) push('budget', 'income', `Income added: ${n.name}`, null, n.grossMonthly)
      else if (p && !n) push('budget', 'income', `Income removed: ${p.name}`, p.grossMonthly, null)
      else if (p && n && Math.round(p.grossMonthly) !== Math.round(n.grossMonthly))
        push('budget', 'income', `Income: ${n.name}`, p.grossMonthly, n.grossMonthly)
    }

    // Expense items
    const pSecs = byId(prev.expenseSections), nSecs = byId(next.expenseSections)
    for (const sid of new Set([...Object.keys(pSecs), ...Object.keys(nSecs)])) {
      const pS = pSecs[sid], nS = nSecs[sid]
      if (!pS || !nS) continue
      const pItems = byId(pS.items), nItems = byId(nS.items)
      for (const iid of new Set([...Object.keys(pItems), ...Object.keys(nItems)])) {
        const pI = pItems[iid], nI = nItems[iid]
        if (!pI && nI) push('budget', 'plan', `Expense added: ${nS.name} › ${nI.name}`, 0, nI.months?.reduce((s,v)=>s+v,0)/12)
        else if (pI && !nI) push('budget', 'plan', `Expense removed: ${pS.name} › ${pI.name}`, pI.months?.reduce((s,v)=>s+v,0)/12, 0)
        else if (pI && nI) {
          const pAvg = Math.round((pI.months ?? []).reduce((s,v)=>s+v,0)/12)
          const nAvg = Math.round((nI.months ?? []).reduce((s,v)=>s+v,0)/12)
          if (pAvg !== nAvg) push('budget', 'plan', `Expense: ${nS.name} › ${nI.name}`, pAvg, nAvg)
        }
      }
    }

    // Cash accounts
    const pCA = byId(prev.cashAccounts), nCA = byId(next.cashAccounts)
    for (const id of new Set([...Object.keys(pCA), ...Object.keys(nCA)])) {
      const p = pCA[id], n = nCA[id]
      if (!p && n) push('accounts', null, `Cash account added: ${n.name}`, 0, n.balance ?? 0)
      else if (p && !n) push('accounts', null, `Cash account removed: ${p.name}`, p.balance ?? 0, 0)
      else if (p && n && Math.round(p.balance ?? 0) !== Math.round(n.balance ?? 0))
        push('accounts', null, `Cash Account: ${n.name}`, p.balance ?? 0, n.balance ?? 0)
    }

    // Investment accounts
    const pIA = byId(prev.investmentAccounts), nIA = byId(next.investmentAccounts)
    for (const id of new Set([...Object.keys(pIA), ...Object.keys(nIA)])) {
      const p = pIA[id], n = nIA[id]
      if (!p && n) push('accounts', null, `Investment added: ${n.name}`, 0, n.balance ?? 0)
      else if (p && !n) push('accounts', null, `Investment removed: ${p.name}`, p.balance ?? 0, 0)
      else if (p && n && Math.round(p.balance ?? 0) !== Math.round(n.balance ?? 0))
        push('accounts', null, `Investment: ${n.name}`, p.balance ?? 0, n.balance ?? 0)
    }

    // Debt accounts
    const pDA = byId(prev.debtAccounts), nDA = byId(next.debtAccounts)
    for (const id of new Set([...Object.keys(pDA), ...Object.keys(nDA)])) {
      const p = pDA[id], n = nDA[id]
      if (!p && n) push('accounts', null, `Debt added: ${n.name}`, 0, n.balance ?? 0)
      else if (p && !n) push('accounts', null, `Debt removed: ${p.name}`, p.balance ?? 0, 0)
      else if (p && n && Math.round(p.balance ?? 0) !== Math.round(n.balance ?? 0))
        push('accounts', null, `Debt: ${n.name}`, p.balance ?? 0, n.balance ?? 0)
    }

    // Properties
    const pPR = byId(prev.properties), nPR = byId(next.properties)
    for (const id of new Set([...Object.keys(pPR), ...Object.keys(nPR)])) {
      const p = pPR[id], n = nPR[id]
      if (!p && n) push('realestate', null, `Property added: ${n.name}`, 0, n.currentValue ?? 0)
      else if (p && !n) push('realestate', null, `Property removed: ${p.name}`, p.currentValue ?? 0, 0)
      else if (p && n) {
        if (Math.round(p.currentValue ?? 0) !== Math.round(n.currentValue ?? 0))
          push('realestate', null, `Property value: ${n.name}`, p.currentValue ?? 0, n.currentValue ?? 0)
        const pMB = p.mortgage?.balance ?? 0, nMB = n.mortgage?.balance ?? 0
        if (Math.round(pMB) !== Math.round(nMB))
          push('realestate', null, `Mortgage balance: ${n.name}`, pMB, nMB)
      }
    }

    // CapEx
    const pCX = (prev.capex ?? []).flatMap(g => g.items ?? [])
    const nCX = (next.capex ?? []).flatMap(g => g.items ?? [])
    const pCXM = Object.fromEntries(pCX.map(x => [x.id, x])), nCXM = Object.fromEntries(nCX.map(x => [x.id, x]))
    for (const id of new Set([...Object.keys(pCXM), ...Object.keys(nCXM)])) {
      const p = pCXM[id], n = nCXM[id]
      if (!p && n) push('budget', 'capex', `CapEx added: ${n.name}`, 0, n.cost ?? 0)
      else if (p && !n) push('budget', 'capex', `CapEx removed: ${p.name}`, p.cost ?? 0, 0)
      else if (p && n && Math.round(p.cost ?? 0) !== Math.round(n.cost ?? 0))
        push('budget', 'capex', `CapEx: ${n.name}`, p.cost ?? 0, n.cost ?? 0)
    }

    // Goals
    const pGL = byId(prev.goals), nGL = byId(next.goals)
    for (const id of new Set([...Object.keys(pGL), ...Object.keys(nGL)])) {
      const p = pGL[id], n = nGL[id]
      if (!p && n) push('budget', 'goals', `Goal added: ${n.name}`, 0, n.amount ?? 0)
      else if (p && !n) push('budget', 'goals', `Goal removed: ${p.name}`, p.amount ?? 0, 0)
      else if (p && n && Math.round(p.amount ?? 0) !== Math.round(n.amount ?? 0))
        push('budget', 'goals', `Goal: ${n.name}`, p.amount ?? 0, n.amount ?? 0)
    }

    return entries
  }

  function handleBudgetChange(newBudget) {
    setBudget(prev => {
      const entries = diffBudget(prev, newBudget)
      const prevLog = prev.auditLog ?? []
      const nextLog = entries.length > 0 ? [...entries, ...prevLog].slice(0, 500) : prevLog
      return { ...newBudget, auditLog: nextLog }
    })
  }

  function handleNavigateFromAudit(app, subTab) {
    setActiveApp(app)
    if (app === 'budget' && subTab) setBudgetTab(subTab)
  }

  // ── Build simParams from any inputs+personConfigs pair (used by Compare tab) ──
  const buildSimParamsForSnapshot = useCallback((snapInputs, snapPersonConfigs) => {
    const pc = snapPersonConfigs?.primary ?? personConfigs.primary
    const inp = snapInputs ?? inputs

    const overrideAmt = pc.incomeTargetEnabled && pc.incomeTargetAmount > 0 ? pc.incomeTargetAmount : null
    const strategyParams = {
      ...pc.strategy.strategyParams,
      inflation: (inp.inflation ?? 2) / 100,
      ...(overrideAmt ? {
        baseAmount:    overrideAmt,
        annualExpense: overrideAmt,
        rate: pc.strategy.strategyType === 'fixedPct' && overrideAmt > 0
          ? overrideAmt / Math.max(1, (inp.accounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0))
          : pc.strategy.strategyParams.rate,
      } : {}),
    }

    const reProps = budget.properties ?? []
    const annualNetRental = reProps.reduce((s, p) => s + calcNetRentalIncome(p) * 12, 0)
    const reRetirementIncomes = annualNetRental > 0
      ? [{ id: '_re_rental', label: 'Net Rental Income', amount: Math.round(annualNetRental), startAge: inp.retirementAge, endAge: inp.lifeExpectancy }]
      : []
    const reCashOutflows = { ...(pc.cashOutflows ?? {}) }
    const ytr = Math.max(0, (inp.retirementAge ?? 65) - (inp.currentAge ?? 45))
    reProps.forEach(p => {
      const mort = p.mortgage
      if (!mort?.enabled || !mort.balance || mort.balance <= 0 || !mort.amortizationMonths) return
      const mPI = calcMortgagePayment(mort)
      if (mPI <= 0) return
      const mRem = Math.max(0, mort.amortizationMonths - ytr * 12)
      for (let i = 0; i < Math.ceil(mRem / 12); i++) {
        const age = (inp.retirementAge ?? 65) + i
        reCashOutflows[age] = (reCashOutflows[age] ?? 0) + Math.round(mPI * 12)
      }
    })

    return {
      ...inp,
      cashOutflows:        reCashOutflows,
      cashOutflowTaxRates: pc.cashOutflowTaxRates ?? {},
      cashInflows:         pc.retCashInflows ?? {},
      strategyType:        pc.strategy.strategyType,
      strategyParams,
      rrspDrawdown:        pc.rrspDrawdown,
      withdrawalSequence:  pc.withdrawalSequence ?? inp.withdrawalSequence,
      scenarioShock:       null,
      incomeTargetPhases:  pc.incomeTargetEnabled && pc.incomeTargetPhases?.length > 0 ? pc.incomeTargetPhases : null,
      retirementIncomes:   [...(inp.retirementIncomes ?? []), ...reRetirementIncomes],
      reProperties:        reProps,
    }
  }, [budget.properties, inputs, personConfigs])

  const allResults = useMemo(() => {
    try {
      const pPC = personConfigs.primary
      const sPC = personConfigs.spouse

      // Build primary strategy params (with income-target override)
      const pOverride = pPC.incomeTargetEnabled && pPC.incomeTargetAmount > 0 ? pPC.incomeTargetAmount : null
      const primaryStrategyParams = {
        ...pPC.strategy.strategyParams,
        inflation: inputs.inflation / 100,
        ...(pOverride ? {
          baseAmount:    pOverride,
          annualExpense: pOverride,
          rate: pPC.strategy.strategyType === 'fixedPct' && pOverride > 0
            ? pOverride / Math.max(1, inputs.accounts.reduce((s, a) => s + (a.balance ?? 0), 0))
            : pPC.strategy.strategyParams.rate,
        } : {}),
      }

      // ── Real estate injection into retirement simulation ────────────────────
      const reProps = budget.properties ?? []

      // 1. Net rental income → added as retirement income (reduces portfolio draw)
      const annualNetRental = reProps.reduce((s, p) => s + calcNetRentalIncome(p) * 12, 0)
      const reRetirementIncomes = annualNetRental > 0
        ? [{ id: '_re_rental', label: 'Net Rental Income', amount: Math.round(annualNetRental), startAge: inputs.retirementAge, endAge: inputs.lifeExpectancy }]
        : []

      // 2. Mortgage P&I during retirement → added to cash outflows per retirement year
      //    (only for mortgages that extend into retirement based on current amortization)
      const reCashOutflows = { ...pPC.cashOutflows }
      const yearsToRet = Math.max(0, inputs.retirementAge - inputs.currentAge)
      reProps.forEach(p => {
        const mort = p.mortgage
        if (!mort?.enabled || !mort.balance || mort.balance <= 0 || !mort.amortizationMonths) return
        const monthlyPI = calcMortgagePayment(mort)
        if (monthlyPI <= 0) return
        const monthsRemainingAtRet = Math.max(0, mort.amortizationMonths - yearsToRet * 12)
        const retYearsWithMortgage = Math.ceil(monthsRemainingAtRet / 12)
        for (let i = 0; i < retYearsWithMortgage; i++) {
          const age = inputs.retirementAge + i
          reCashOutflows[age] = (reCashOutflows[age] ?? 0) + Math.round(monthlyPI * 12)
        }
      })

      const simParams = {
        ...inputs,
        cashOutflows:        reCashOutflows,
        cashOutflowTaxRates: pPC.cashOutflowTaxRates,
        cashInflows:         pPC.retCashInflows,
        strategyType:        pPC.strategy.strategyType,
        strategyParams:      primaryStrategyParams,
        rrspDrawdown:        pPC.rrspDrawdown,
        withdrawalSequence:  pPC.withdrawalSequence ?? inputs.withdrawalSequence,
        scenarioShock:       (scenarioActive && !scenarioOverlay) ? effectiveScenario : null,
        incomeTargetPhases:  pPC.incomeTargetEnabled && pPC.incomeTargetPhases?.length > 0 ? pPC.incomeTargetPhases : null,
        retirementIncomes:   [...(inputs.retirementIncomes ?? []), ...reRetirementIncomes],
        reProperties:        reProps,
      }

      const primary = runSimulation(simParams)

      if (!inputs.spouse?.enabled) {
        return { primary, spouse: null, combined: primary }
      }

      const sp = inputs.spouse

      // Build spouse strategy params (with spouse's income-target override)
      const sOverride = sPC.incomeTargetEnabled && sPC.incomeTargetAmount > 0 ? sPC.incomeTargetAmount : null
      const spouseStrategyParams = {
        ...sPC.strategy.strategyParams,
        inflation: inputs.inflation / 100,
        ...(sOverride ? {
          baseAmount:    sOverride,
          annualExpense: sOverride,
          rate: sPC.strategy.strategyType === 'fixedPct' && sOverride > 0
            ? sOverride / Math.max(1, (sp.accounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0))
            : sPC.strategy.strategyParams.rate,
        } : {}),
      }

      const spouseJointInputs = {
        ...sp,
        province:               inputs.province,
        inflation:              inputs.inflation,
        tfsaIndexedToInflation: inputs.tfsaIndexedToInflation,
        workingMarginalRate:    sp.workingMarginalRate    ?? inputs.workingMarginalRate,
        nonRegOrdinaryPct:      sp.nonRegOrdinaryPct      ?? inputs.nonRegOrdinaryPct,
        withdrawalSequence:     sPC.withdrawalSequence    ?? inputs.withdrawalSequence,
      }

      const spouseOnly = runSimulation({
        ...simParams,
        currentAge:          sp.currentAge          ?? 43,
        retirementAge:       sp.retirementAge        ?? 63,
        lifeExpectancy:      sp.lifeExpectancy       ?? 88,
        accounts:            sp.accounts             ?? [],
        cppAvgEarnings:      sp.cppAvgEarnings       ?? 45000,
        cppYearsContributed: sp.cppYearsContributed  ?? 30,
        cppStartAge:         sp.cppStartAge          ?? 65,
        oasYearsResident:    sp.oasYearsResident     ?? 40,
        oasStartAge:         sp.oasStartAge          ?? 65,
        dbEnabled:           sp.dbEnabled            ?? false,
        dbBestAvgSalary:     sp.dbBestAvgSalary      ?? 70000,
        dbYearsService:      sp.dbYearsService       ?? 20,
        dbAccrualRate:       sp.dbAccrualRate        ?? 1.5,
        dbStartAge:          sp.dbStartAge           ?? 65,
        dbIndexingRate:      sp.dbIndexingRate       ?? 0,
        otherPension:        sp.otherPension         ?? 0,
        retirementIncomes:   sp.retirementIncomes    ?? [],
        workingMarginalRate: sp.workingMarginalRate  ?? inputs.workingMarginalRate,
        nonRegOrdinaryPct:   sp.nonRegOrdinaryPct    ?? inputs.nonRegOrdinaryPct,
        // Spouse's own per-person settings
        withdrawalSequence:  sPC.withdrawalSequence  ?? inputs.withdrawalSequence,
        strategyType:        sPC.strategy.strategyType,
        strategyParams:      spouseStrategyParams,
        rrspDrawdown:        sPC.rrspDrawdown,
        cashOutflows:        sPC.cashOutflows,
        cashOutflowTaxRates: sPC.cashOutflowTaxRates,
        cashInflows:         sPC.retCashInflows,
      })

      const combined = runJointSimulation(
        { ...simParams, pensionSplittingEnabled: inputs.spouse?.pensionSplittingEnabled ?? false },
        spouseJointInputs,
      )

      return { primary, spouse: spouseOnly, combined }
    } catch (e) {
      console.error('Simulation error:', e)
      return { primary: null, spouse: null, combined: null }
    }
  }, [inputs, personConfigs, scenarioActive, scenarioOverlay, effectiveScenario])

  // Active display result — routes to primary / spouse / combined based on selector
  const result = useMemo(() => {
    if (!inputs.spouse?.enabled) return allResults.primary
    if (viewPerson === 'primary')  return allResults.primary
    if (viewPerson === 'spouse')   return allResults.spouse
    return allResults.combined
  }, [allResults, viewPerson, inputs.spouse?.enabled])

  const accRows = useMemo(() => {
    try {
      return buildAccumulationRows({
        accounts:               inputs.accounts,
        currentAge:             inputs.currentAge,
        retirementAge:          inputs.retirementAge,
        workingMarginalRate:    inputs.workingMarginalRate,
        nonRegOrdinaryPct:      inputs.nonRegOrdinaryPct,
        tfsaIndexedToInflation: inputs.tfsaIndexedToInflation,
        inflation:              inputs.inflation,
        accCashInflows,
        accCashOutflows,
        accOutflowTaxRates,
      })
    } catch (e) {
      console.error('Accumulation error:', e)
      return []
    }
  }, [inputs.accounts, inputs.currentAge, inputs.retirementAge, inputs.workingMarginalRate, inputs.nonRegOrdinaryPct, inputs.tfsaIndexedToInflation, inputs.inflation, accCashInflows, accCashOutflows, accOutflowTaxRates])

  // Monte Carlo — always runs when primary has retirement rows
  const mcResult = useMemo(() => {
    if (!allResults.primary?.rows?.length) return null
    try {
      return runMonteCarlo(inputs, allResults.primary.rows)
    } catch (e) {
      console.error('Monte Carlo error:', e)
      return null
    }
  }, [inputs, allResults.primary])

  // Scenario overlay — runs the scenario as a separate sim when overlay mode is on (always uses primary config)
  const scenarioOverlayResult = useMemo(() => {
    if (!scenarioActive || !scenarioOverlay || !allResults.primary?.rows?.length) return null
    const pPC = personConfigs.primary
    const overrideAmount = pPC.incomeTargetEnabled && pPC.incomeTargetAmount > 0 ? pPC.incomeTargetAmount : null
    const strategyParams = {
      ...pPC.strategy.strategyParams,
      inflation: inputs.inflation / 100,
      ...(overrideAmount ? {
        baseAmount:    overrideAmount,
        annualExpense: overrideAmount,
        rate: pPC.strategy.strategyType === 'fixedPct' && overrideAmount > 0
          ? overrideAmount / Math.max(1, inputs.accounts.reduce((s, a) => s + (a.balance ?? 0), 0))
          : pPC.strategy.strategyParams.rate,
      } : {}),
    }
    const simParams = {
      ...inputs,
      cashOutflows:        pPC.cashOutflows,
      cashOutflowTaxRates: pPC.cashOutflowTaxRates,
      cashInflows:         pPC.retCashInflows,
      strategyType:        pPC.strategy.strategyType,
      strategyParams,
      rrspDrawdown:        pPC.rrspDrawdown,
      withdrawalSequence:  pPC.withdrawalSequence ?? inputs.withdrawalSequence,
      scenarioShock:       effectiveScenario,
    }
    try {
      return runSimulation(simParams)
    } catch (e) {
      console.error('Scenario overlay error:', e)
      return null
    }
  }, [scenarioActive, scenarioOverlay, effectiveScenario, inputs, personConfigs, allResults.primary])

  // RRSP drawdown comparison — runs 6 scenarios with different drawdown configs
  // to show lifetime tax impact in the hover card
  const rrspComparison = useMemo(() => {
    if (!allResults.primary) return null
    const pPC = personConfigs.primary
    const pOverride = pPC.incomeTargetEnabled && pPC.incomeTargetAmount > 0 ? pPC.incomeTargetAmount : null
    const baseStrategyParams = {
      ...pPC.strategy.strategyParams,
      inflation: inputs.inflation / 100,
      ...(pOverride ? {
        baseAmount: pOverride, annualExpense: pOverride,
        rate: pPC.strategy.strategyType === 'fixedPct' && pOverride > 0
          ? pOverride / Math.max(1, inputs.accounts.reduce((s, a) => s + (a.balance ?? 0), 0))
          : pPC.strategy.strategyParams.rate,
      } : {}),
    }
    const baseSimParams = {
      ...inputs,
      cashOutflows:        pPC.cashOutflows,
      cashOutflowTaxRates: pPC.cashOutflowTaxRates,
      cashInflows:         pPC.retCashInflows,
      strategyType:        pPC.strategy.strategyType,
      strategyParams:      baseStrategyParams,
      withdrawalSequence:  pPC.withdrawalSequence ?? inputs.withdrawalSequence,
      scenarioShock:       null,
    }
    const SCENARIOS = [
      { label: 'None',       rrspDrawdown: { type: 'none',        reinvestSurplus: true } },
      { label: '+$30K/yr',   rrspDrawdown: { type: 'fixedAmount', fixedAmount: 30000,  reinvestSurplus: true } },
      { label: '+$80K/yr',   rrspDrawdown: { type: 'fixedAmount', fixedAmount: 80000,  reinvestSurplus: true } },
      { label: '+$100K/yr',  rrspDrawdown: { type: 'fixedAmount', fixedAmount: 100000, reinvestSurplus: true } },
      { label: 'Deplete 55', rrspDrawdown: { type: 'targetAge',   targetAge: 55,       reinvestSurplus: true } },
      { label: 'Deplete 65', rrspDrawdown: { type: 'targetAge',   targetAge: 65,       reinvestSurplus: true } },
      { label: 'Deplete 70', rrspDrawdown: { type: 'targetAge',   targetAge: 70,       reinvestSurplus: true } },
      { label: 'Deplete 80', rrspDrawdown: { type: 'targetAge',   targetAge: 80,       reinvestSurplus: true } },
    ]
    try {
      const results = SCENARIOS.map(s => {
        const r = runSimulation({ ...baseSimParams, rrspDrawdown: s.rrspDrawdown })
        return {
          label:        s.label,
          rrspDrawdown: s.rrspDrawdown,
          totalTaxPaid: r?.summary?.totalTaxPaid  ?? 0,
          finalBalance: r?.summary?.finalBalance  ?? 0,
          exhausted:    r?.summary?.portfolioExhaustedAge ?? null,
        }
      })
      const baseline = results[0].totalTaxPaid
      return results.map(r => ({ ...r, taxSaving: baseline - r.totalTaxPaid }))
    } catch { return null }
  }, [inputs, personConfigs, allResults.primary])

  const handleInputChange        = useCallback((newInputs) => setInputs(newInputs), [])
  const handleStrategyChange     = useCallback((s) => updatePC({ strategy: s }), [viewPerson])
  const handleRrspDrawdownChange = useCallback((d) => updatePC({ rrspDrawdown: d }), [viewPerson])
  const handleOutflowChange = useCallback((age, amount) => {
    const key = viewPerson === 'spouse' ? 'spouse' : 'primary'
    setPersonConfigs(prev => ({ ...prev, [key]: { ...prev[key], cashOutflows: { ...prev[key].cashOutflows, [age]: amount } } }))
  }, [viewPerson])
  const handleOutflowTaxRateChange = useCallback((age, rate) => {
    const key = viewPerson === 'spouse' ? 'spouse' : 'primary'
    setPersonConfigs(prev => ({ ...prev, [key]: { ...prev[key], cashOutflowTaxRates: { ...prev[key].cashOutflowTaxRates, [age]: rate } } }))
  }, [viewPerson])
  const handleRetInflowChange = useCallback((age, amount) => {
    const key = viewPerson === 'spouse' ? 'spouse' : 'primary'
    setPersonConfigs(prev => ({ ...prev, [key]: { ...prev[key], retCashInflows: { ...prev[key].retCashInflows, [age]: amount } } }))
  }, [viewPerson])
  const handleAccInflowChange        = useCallback((age, amount) => setAccCashInflows(p      => ({ ...p, [age]: amount })), [])
  const handleAccOutflowChange       = useCallback((age, amount) => setAccCashOutflows(p     => ({ ...p, [age]: amount })), [])
  const handleAccOutflowTaxRateChange= useCallback((age, rate)   => setAccOutflowTaxRates(p  => ({ ...p, [age]: rate })), [])

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-950 p-3 overflow-hidden">

      {/* ── Mobile sidebar backdrop ── */}
      {sideNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setSideNavOpen(false)}
        />
      )}

      {/* ── Left app launcher rail — fixed overlay ── */}
      <div className={`fixed left-3 top-3 bottom-3 z-40 flex flex-col items-center py-3 gap-3
        transition-transform duration-200
        ${sideNavOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
      `}>

        {/* Forward Planner >> logo */}
        <div className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center flex-shrink-0 shadow-sm" title="Forward Planner">
          <span className="text-sm font-black text-white dark:text-gray-900 tracking-tighter leading-none select-none">&gt;&gt;</span>
        </div>

        {/* Divider */}
        <div className="w-5 h-px bg-gray-300 dark:bg-gray-700" />

        {/* R — Retirement module */}
        <button
          onClick={() => { setActiveApp('retirement'); setSideNavOpen(false) }}
          title="Retirement Planner"
          className={`w-9 flex flex-col items-center gap-0.5 transition-all duration-150`}
        >
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm
            ${activeApp === 'retirement'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>R</span>
          <span className={`text-[8px] font-medium leading-none ${activeApp === 'retirement' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>Retire</span>
        </button>

        {/* B — Budget module */}
        <button
          onClick={() => { setActiveApp('budget'); setSideNavOpen(false) }}
          title="Budget Planner"
          className={`w-9 flex flex-col items-center gap-0.5 transition-all duration-150`}
        >
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm
            ${activeApp === 'budget'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>B</span>
          <span className={`text-[8px] font-medium leading-none ${activeApp === 'budget' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>Budget</span>
        </button>

        {/* T — Transactions */}
        <button
          onClick={() => { setActiveApp('tracking'); setSideNavOpen(false) }}
          title="Transactions"
          className={`w-9 flex flex-col items-center gap-0.5 transition-all duration-150`}
        >
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm
            ${activeApp === 'tracking'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>T</span>
          <span className={`text-[8px] font-medium leading-none ${activeApp === 'tracking' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>Spend</span>
        </button>

        {/* A — Accounts module */}
        <button
          onClick={() => { setActiveApp('accounts'); setSideNavOpen(false) }}
          title="Accounts"
          className={`w-9 flex flex-col items-center gap-0.5 transition-all duration-150`}
        >
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm
            ${activeApp === 'accounts'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>A</span>
          <span className={`text-[8px] font-medium leading-none ${activeApp === 'accounts' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>Accts</span>
        </button>

        {/* RE — Real Estate module */}
        <button
          onClick={() => { setActiveApp('realestate'); setSideNavOpen(false) }}
          title="Real Estate"
          className={`w-9 flex flex-col items-center gap-0.5 transition-all duration-150`}
        >
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black tracking-tight shadow-sm
            ${activeApp === 'realestate'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>RE</span>
          <span className={`text-[8px] font-medium leading-none ${activeApp === 'realestate' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>Home</span>
        </button>

        {/* Divider before help */}
        <div className="flex-1" />
        <div className="w-5 h-px bg-gray-200 dark:bg-gray-700" />

        {/* ? — Help & Audit Log */}
        <button
          onClick={() => { setActiveApp('help'); setSideNavOpen(false) }}
          title="Help & Audit Log"
          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-150 shadow-sm
            ${activeApp === 'help'
              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
        >
          ?
        </button>

      </div>

      {/* ── App container (rounded border) — offset right of fixed sidebar on sm+ ── */}
      <div className="h-full sm:ml-12 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <header className="bg-white border-b border-gray-100 dark:bg-gray-900 dark:border-gray-800 flex-shrink-0 z-30">
          <div className="px-4 sm:px-6 h-14 flex items-center gap-3">

            {/* Hamburger — mobile only, opens sidebar overlay */}
            <button
              onClick={() => setSideNavOpen(true)}
              className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
              title="Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Left: title + (budget tabs inline) */}
            <div className="flex items-center gap-3 flex-1 min-w-0 self-stretch">
              <div className="hidden sm:block flex-shrink-0">
                {activeApp === 'retirement' ? (
                  <>
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Retirement</h1>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Portfolio & Income Simulator</p>
                  </>
                ) : activeApp === 'tracking' ? (
                  <>
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Transactions</h1>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5"><span className="font-semibold text-gray-500 dark:text-gray-400">Completely Optional</span> · Connect your bank to track actual spending — or skip and use the Budget module for planning</p>
                  </>
                ) : activeApp === 'accounts' ? (
                  <>
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Accounts</h1>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Balances & Holdings</p>
                  </>
                ) : activeApp === 'realestate' ? (
                  <>
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Real Estate</h1>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Properties & Mortgages</p>
                  </>
                ) : activeApp === 'help' ? (
                  <>
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Help & Audit Log</h1>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Documentation & Change History</p>
                  </>
                ) : (
                  <>
                    <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Budget</h1>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Income & Expense Tracker</p>
                  </>
                )}
              </div>

              {/* Mobile Inputs button — header, retirement only, hidden on desktop */}
              {activeApp === 'retirement' && (
                <button
                  onClick={() => setMobileInputsOpen(true)}
                  className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all flex-shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  Inputs
                </button>
              )}

              {/* Person selector — inline in header when spouse enabled */}
              {activeApp === 'retirement' && inputs.spouse?.enabled && (
                <>
                  <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0 hidden sm:block" />
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    {[
                      { id: 'primary',  label: inputs.userName   || 'You'    },
                      { id: 'spouse',   label: inputs.spouseName || 'Spouse' },
                      { id: 'combined', label: 'Combined'                    },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setViewPerson(opt.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                          viewPerson === opt.id
                            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Budget tabs — inline in header */}
              {activeApp === 'budget' && (
                <>
                  <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 flex-shrink-0 hidden sm:block" />
                  <div className="flex self-stretch items-stretch">
                    {BUDGET_TABS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setBudgetTab(t.id)}
                        className={`px-4 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                          budgetTab === t.id
                            ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Cloud save status indicator */}
              {session && cloudSaveStatus !== 'idle' && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-all ${
                  cloudSaveStatus === 'saving' ? 'text-gray-400 dark:text-gray-500' :
                  cloudSaveStatus === 'saved'  ? 'text-emerald-500 dark:text-emerald-400' :
                                                 'text-red-500 dark:text-red-400'
                }`}>
                  {cloudSaveStatus === 'saving' ? '↑ saving…' : cloudSaveStatus === 'saved' ? '✓ saved' : '✕ save failed'}
                </span>
              )}

              {/* Setup Guide */}
              {activeApp === 'retirement' && !inputs.userName && (
                <button
                  onClick={() => setOnboardingOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  ✨ Get started
                </button>
              )}


              {/* Snapshots */}
              {activeApp === 'retirement' && (
                <SnapshotsPanel
                  snapshots={snapshots}
                  activeSnapshotName={activeSnapshotName}
                  onSave={name => { saveSnapshot(name, { inputs, personConfigs }); setActiveSnapshotName(name || `Snapshot ${new Date().toLocaleDateString()}`) }}
                  onLoad={(data, name) => {
                    if (data.inputs) setInputs(mergeInputs(data.inputs))
                    setPersonConfigs(loadPersonConfigs(data))
                    setActiveSnapshotName(name)
                  }}
                  onDelete={deleteSnapshot}
                  onRename={(id, name) => { renameSnapshot(id, name); setActiveSnapshotName(name) }}
                />
              )}


              {/* DEMO mode toggle */}
              <div className="flex items-center gap-1.5 select-none px-1 group relative">
                <span className={`text-[9px] font-semibold tracking-wide transition-colors ${demoMode ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>DEMO</span>
                <button type="button" onClick={() => setDemoMode(v => !v)}
                  className={`relative inline-flex h-3.5 w-6 flex-shrink-0 rounded-full transition-colors focus:outline-none ${demoMode ? 'bg-amber-400' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <span className={`inline-block h-2.5 w-2.5 mt-[1px] rounded-full bg-white shadow transform transition-transform ${demoMode ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                </button>
                {/* Tooltip */}
                <div className="pointer-events-none absolute top-full right-0 mt-2 w-72 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="bg-gray-900 dark:bg-gray-800 text-white text-[11px] rounded-xl shadow-xl p-3.5 space-y-2.5 leading-relaxed">
                    <p className="font-semibold text-amber-400">Demo Mode</p>
                    <p className="text-gray-300">Loads a full set of realistic sample data so you can explore the app without entering your own information.</p>
                    <div className="space-y-1.5 border-t border-gray-700 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">What gets populated</p>
                      <div className="space-y-1 text-[11px]">
                        <p><span className="text-emerald-400 font-medium">✓ Budget</span> — monthly income &amp; expense categories, big purchase reserve items (home, car, computer)</p>
                        <p><span className="text-emerald-400 font-medium">✓ Accounts</span> — chequing, savings, credit card, mortgage, RRSP, TFSA and non-reg accounts with balances</p>
                        <p><span className="text-emerald-400 font-medium">✓ Real Estate</span> — sample primary residence with mortgage, appreciation rate &amp; property details</p>
                        <p><span className="text-emerald-400 font-medium">✓ Spend</span> — sample transaction history for categorisation</p>
                        <p><span className="text-gray-500 font-medium">✗ Retirement</span> — uses your actual inputs; edit them in the sidebar</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500">Your own saved data is preserved — toggling Demo off restores it.</p>
                  </div>
                </div>
              </div>

              {/* Reset button */}
              <button
                onClick={() => { if (window.confirm('Reset all data to defaults?')) { resetToDefaults(); setProfileOpen(false) } }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors dark:hover:bg-gray-800 dark:hover:text-gray-300"
                title="Reset all to defaults"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Dark mode toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors dark:hover:bg-gray-800 dark:hover:text-gray-300"
                title={darkMode ? 'Light mode' : 'Dark mode'}
              >
                {darkMode ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>

              {/* Account button — expands card below */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen(o => !o)}
                  title={session ? session.user.email : 'Sign in'}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors overflow-hidden flex-shrink-0"
                >
                  {session ? (
                    <span className="w-8 h-8 rounded-full bg-gray-900 dark:bg-white flex items-center justify-center text-xs font-bold text-white dark:text-gray-900">
                      {session.user.email?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </button>

                {profileOpen && (
                  <div className="overlay-panel absolute right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden" style={{ minWidth: 260 }}>
                    {session ? (
                      /* Signed-in: show email + actions */
                      <>
                        <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 space-y-2">
                          <div>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Signed in as</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mt-0.5 truncate">{session.user.email}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Your name</p>
                              <input
                                type="text"
                                value={inputs.userName ?? ''}
                                onChange={e => handleInputChange({ ...inputs, userName: e.target.value })}
                                placeholder="e.g. Alex"
                                className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-brand-400"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Spouse name</p>
                              <input
                                type="text"
                                value={inputs.spouseName ?? ''}
                                onChange={e => handleInputChange({ ...inputs, spouseName: e.target.value })}
                                placeholder="e.g. Jordan"
                                className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-brand-400"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="p-2">
                          <button
                            onClick={() => { resetToDefaults(); setProfileOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                            Reset all to defaults
                          </button>
                          <button
                            onClick={() => { handleSignOut(); setProfileOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 100-2H4V5h7a1 1 0 100-2H3zm10.293 4.293a1 1 0 011.414 0L17 9.586l-2.293 2.293a1 1 0 01-1.414-1.414L14.586 9l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                              <path fillRule="evenodd" d="M13 9a1 1 0 011-1h4a1 1 0 110 2h-4a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                            Sign out
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Guest: show login form as inline card */
                      <AuthModal onClose={() => setProfileOpen(false)} />
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </header>

        {/* ── App body ── */}
        {activeApp === 'budget' ? (

          /* Budget app */
          <BudgetApp budget={budget} onChange={handleBudgetChange} darkMode={darkMode} tab={budgetTab} onTabChange={setBudgetTab}
            lifeExpectancy={inputs.lifeExpectancy} currentAge={inputs.currentAge} retirementInputs={inputs}
            onOpenAccounts={() => setActiveApp('accounts')} demoMode={demoMode} />

        ) : activeApp === 'tracking' ? (

          /* Expense Tracker — standalone, no Budget App chrome */
          <ExpenseTracker budget={budget} onBudgetChange={handleBudgetChange}
            onGoToAccounts={id => { setFocusAccountId(id); setActiveApp('accounts') }}
            demoMode={demoMode} />

        ) : activeApp === 'accounts' ? (

          /* Accounts app */
          <AccountsApp
            inputs={inputs} onInputsChange={handleInputChange}
            budget={budget} onBudgetChange={handleBudgetChange}
            darkMode={darkMode}
            focusAccountId={focusAccountId} demoMode={demoMode}
            onGoToRealEstate={() => setActiveApp('realestate')} />

        ) : activeApp === 'realestate' ? (

          /* Real Estate app */
          <RealEstateApp
            budget={budget} onChange={handleBudgetChange}
            darkMode={darkMode} demoMode={demoMode} />

        ) : activeApp === 'help' ? (

          /* Help & Audit Log */
          <HelpApp
            auditLog={budget.auditLog ?? []}
            onNavigate={handleNavigateFromAudit} />

        ) : (

          /* Retirement app */
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── Inputs sidebar ── */}
            <aside className="shrink-0 hidden lg:flex overflow-y-auto">
              <InputPanel inputs={inputs} onChange={handleInputChange} onOpenAccounts={() => setActiveApp('accounts')} reProperties={budget.properties ?? []} simRows={allResults?.primary?.rows ?? []} />
            </aside>

            {/* ── Main content ── */}
            <main className="flex-1 min-w-0 overflow-y-auto px-5 py-5 space-y-5">

          {/* Strategy cards — overlay on hover */}
          <div className="flex flex-col">

            {/* Top row: Retirement Withdrawals | RRSP Drawdown | Withdrawal Sequence */}
            <div className="flex gap-3 flex-wrap">

              {/* Retirement Withdrawals */}
              <div
                className="relative w-52"
                style={{ zIndex: strategyHovered ? 50 : 1 }}
                onMouseEnter={() => { clearTimeout(strategyLeaveTimer.current); setStrategyHovered(true) }}
                onMouseLeave={() => { strategyLeaveTimer.current = setTimeout(() => setStrategyHovered(false), 150) }}
              >
                <div className={`card cursor-default transition-shadow duration-200 rounded-b-none border-b-0 ${strategyHovered ? 'shadow-md' : ''} ${incomeTargetEnabled ? '!border-blue-300 dark:!border-blue-700' : ''}`}>
                  <div className="flex items-start py-0.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Retirement Withdrawals</h2>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${strategyHovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      {incomeTargetEnabled && incomeTargetAmount > 0 ? (
                        <p className="text-[11px] text-blue-500 dark:text-blue-400 mt-0.5 whitespace-nowrap font-medium">
                          ⚡ Spending Target: {incomeTargetAmount >= 1000 ? `$${(incomeTargetAmount / 1000).toFixed(0)}K` : `$${incomeTargetAmount}`}/yr
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">
                          {{ fixedPct: 'Fixed %', fixedDollar: 'Fixed $', guardrails: 'Guardrails', bucket: 'Bucket', targeted: 'Target Estate' }[strategy.strategyType] ?? strategy.strategyType}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {strategyHovered && (
                  <div className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl" style={{ zIndex: 50, minWidth: 320 }}>
                    <StrategySelector
                      strategyType={strategy.strategyType}
                      strategyParams={strategy.strategyParams}
                      onChange={handleStrategyChange}
                    />
                  </div>
                )}
              </div>

              {/* RRSP / RRIF Drawdown */}
              <div
                className="relative w-52"
                style={{ zIndex: rrspHovered ? 50 : 1 }}
                onMouseEnter={() => { clearTimeout(rrspLeaveTimer.current); setRrspHovered(true) }}
                onMouseLeave={() => { rrspLeaveTimer.current = setTimeout(() => setRrspHovered(false), 150) }}
              >
                <div className={`card cursor-default transition-shadow duration-200 ${rrspHovered ? 'shadow-md' : ''}`}>
                  <div className="flex items-start py-0.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">RRSP Drawdown</h2>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${rrspHovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">
                        {{ none: 'None', fixedAmount: 'Fixed $', targetAge: 'Depletion Age', targetBracket: 'Target Bracket' }[rrspDrawdown.type] ?? rrspDrawdown.type}
                      </p>
                    </div>
                  </div>
                </div>
                {rrspHovered && (
                  <div className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl" style={{ zIndex: 50, minWidth: 420 }}>
                    <RrspDrawdown
                      rrspDrawdown={rrspDrawdown}
                      onChange={handleRrspDrawdownChange}
                      comparison={rrspComparison}
                    />
                  </div>
                )}
              </div>

              {/* Withdrawal Sequence */}
              {result && (
                <SequencingAdvisor
                  inputs={{ ...inputs, withdrawalSequence: pc.withdrawalSequence ?? inputs.withdrawalSequence }}
                  strategy={strategy}
                  rrspDrawdown={rrspDrawdown}
                  cashOutflows={cashOutflows}
                  cashOutflowTaxRates={cashOutflowTaxRates}
                  retCashInflows={retCashInflows}
                  scenarioActive={scenarioActive}
                  effectiveScenario={effectiveScenario}
                  onApply={seq => updatePC({ withdrawalSequence: seq })}
                />
              )}

            </div>

            {/* Connector line */}
            <div className={`w-52 flex items-center border-l border-r px-3 ${incomeTargetEnabled ? 'border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className={`flex-1 border-t border-dashed ${incomeTargetEnabled ? 'border-blue-200 dark:border-blue-800' : 'border-gray-200 dark:border-gray-700'}`} />
              <span className={`text-[9px] px-1.5 font-medium ${incomeTargetEnabled ? 'text-blue-400 dark:text-blue-500' : 'text-gray-300 dark:text-gray-600'}`}>spend target</span>
              <div className={`flex-1 border-t border-dashed ${incomeTargetEnabled ? 'border-blue-200 dark:border-blue-800' : 'border-gray-200 dark:border-gray-700'}`} />
            </div>

            {/* Bottom row: Spending Target + Scenarios + What-If */}
            <div className="flex gap-3 flex-wrap">

                <IncomeTargetPanel
                  budget={budget}
                  inputs={inputs}
                  onOpenBudget={() => setActiveApp('budget')}
                  incomeTargetEnabled={incomeTargetEnabled}
                  onEnabledChange={(v) => updatePC({ incomeTargetEnabled: v })}
                  onAmountChange={(v) => updatePC({ incomeTargetAmount: v })}
                  onPhasesChange={(phases) => updatePC({ incomeTargetPhases: phases })}
                  strategyAmount={
                    strategy.strategyType !== 'fixedPct'
                      ? (strategy.strategyParams.annualExpense ?? strategy.strategyParams.baseAmount ?? 0)
                      : null
                  }
                  connectedTop
                />

                {/* Scenario Tester */}
                <div
                  className="relative w-52"
                  style={{ zIndex: scenarioHovered ? 50 : 1 }}
                  onMouseEnter={() => { clearTimeout(scenarioLeaveTimer.current); setScenarioHovered(true) }}
                  onMouseLeave={() => { scenarioLeaveTimer.current = setTimeout(() => setScenarioHovered(false), 150) }}
                >
                  <div className={`card cursor-default transition-shadow duration-200 ${scenarioHovered ? 'shadow-md' : ''} ${scenarioActive ? '!border-amber-300 dark:!border-amber-700' : ''}`}>
                    <div className="flex items-start py-0.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">Scenarios</h2>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${scenarioHovered ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">
                          {scenarioActive ? (activeEvent ? activeEvent.name : 'Custom overrides active') : 'What-If Scenarios'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {scenarioHovered && (
                    <div className="overlay-panel absolute top-full left-0 mt-1 card shadow-xl space-y-3" style={{ zIndex: 50, minWidth: 340 }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200">Shock Analysis</h3>
                          <button
                            onClick={() => {
                              const idx = Math.floor(Math.random() * HISTORICAL_EVENTS.length)
                              const evt = HISTORICAL_EVENTS[idx]
                              setSelectedEventId(evt.id)
                              setScenarioSliders(s => ({ ...s, durationYears: evt.durationYears, returnDelta: evt.returnDelta, inflationDelta: evt.inflationDelta }))
                              setScenarioActive(true)
                            }}
                            className="text-[10px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            Randomize
                          </button>
                        </div>
                        <button
                          onClick={() => setScenarioActive(a => !a)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                            scenarioActive
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          {scenarioActive ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Show as overlay</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">Compare stressed vs base on the chart</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setScenarioOverlay(v => !v); if (!scenarioActive) setScenarioActive(true) }}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
                            scenarioOverlay
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          {scenarioOverlay ? 'On' : 'Off'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-500 dark:text-gray-400">Return Rate Δ</span>
                            <span className={`font-medium tabular-nums ${effectiveScenario.returnDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : effectiveScenario.returnDelta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {effectiveScenario.returnDelta > 0 ? '+' : ''}{effectiveScenario.returnDelta}%/yr
                            </span>
                          </div>
                          <input type="range" min={-20} max={10} step={0.5} value={scenarioSliders.returnDelta}
                            onChange={e => { setScenarioSliders(s => ({ ...s, returnDelta: parseFloat(e.target.value) })); setScenarioActive(true); setSelectedEventId(null) }}
                            className="w-full accent-gray-900 dark:accent-white"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-500 dark:text-gray-400">Inflation Δ</span>
                            <span className={`font-medium tabular-nums ${effectiveScenario.inflationDelta > 0 ? 'text-amber-500' : effectiveScenario.inflationDelta < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                              {effectiveScenario.inflationDelta > 0 ? '+' : ''}{effectiveScenario.inflationDelta}%
                            </span>
                          </div>
                          <input type="range" min={-2} max={8} step={0.5} value={scenarioSliders.inflationDelta}
                            onChange={e => { setScenarioSliders(s => ({ ...s, inflationDelta: parseFloat(e.target.value) })); setScenarioActive(true); setSelectedEventId(null) }}
                            className="w-full accent-gray-900 dark:accent-white"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-500 dark:text-gray-400">Start Age</span>
                            <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">{effectiveScenario.startAge}</span>
                          </div>
                          <input type="range" min={inputs.retirementAge ?? 60} max={90} step={1} value={scenarioSliders.startAge}
                            onChange={e => { setScenarioSliders(s => ({ ...s, startAge: parseInt(e.target.value) })); setScenarioActive(true); setSelectedEventId(null) }}
                            className="w-full accent-gray-900 dark:accent-white"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-500 dark:text-gray-400">Duration</span>
                            <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300">{effectiveScenario.durationYears} yr{effectiveScenario.durationYears > 1 ? 's' : ''}</span>
                          </div>
                          <input type="range" min={1} max={30} step={1} value={scenarioSliders.durationYears}
                            onChange={e => { setScenarioSliders(s => ({ ...s, durationYears: parseInt(e.target.value) })); setScenarioActive(true); setSelectedEventId(null) }}
                            className="w-full accent-gray-900 dark:accent-white"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {HISTORICAL_EVENTS.map(ev => (
                          <button
                            key={ev.id}
                            onClick={() => setSelectedEventId(id => id === ev.id ? null : ev.id)}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border transition-all ${
                              selectedEventId === ev.id
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white'
                                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                            }`}
                          >
                            {ev.name} <span className="opacity-50">{ev.year}</span>
                          </button>
                        ))}
                      </div>
                      {activeEvent && (
                        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-2.5 py-2 space-y-1">
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{activeEvent.story}</p>
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-semibold tabular-nums ${activeEvent.returnDelta < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              Returns {activeEvent.returnDelta > 0 ? '+' : ''}{activeEvent.returnDelta}%/yr
                            </span>
                            <span className={`text-[10px] font-semibold tabular-nums ${activeEvent.inflationDelta > 0 ? 'text-amber-500' : activeEvent.inflationDelta < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                              Inflation {activeEvent.inflationDelta > 0 ? '+' : ''}{activeEvent.inflationDelta}%
                            </span>
                            <span className="text-[10px] text-gray-400">{activeEvent.durationYears} yr{activeEvent.durationYears > 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => { setScenarioSliders({ returnDelta: 0, inflationDelta: 0, startAge: 75, durationYears: 1 }); setSelectedEventId(null); setScenarioActive(false); setScenarioOverlay(false); setScenarioLockRetirement(false) }}
                        className="w-full text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1 border border-gray-100 dark:border-gray-800 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {/* What-If Analysis */}
                {result && (
                  <WhatIfPanel
                    inputs={inputs}
                    strategy={strategy}
                    rrspDrawdown={rrspDrawdown}
                    cashOutflows={cashOutflows}
                    cashOutflowTaxRates={cashOutflowTaxRates}
                    retCashInflows={retCashInflows}
                    scenarioActive={scenarioActive}
                    effectiveScenario={effectiveScenario}
                    baseResult={{ ...result, mcProb: mcResult?.probabilityOfSuccess ?? null }}
                    mcActive={true}
                  />
                )}

              </div>

          </div>

          {/* Summary metrics */}
          {result && <ResultsSummary
            summary={result.summary}
            rows={result.rows}
            probabilityOfSuccess={mcResult?.probabilityOfSuccess ?? null}
            pensionSplitSaving={viewPerson === 'combined' ? (allResults.combined?.summary?.totalPensionSplitSaving ?? null) : null}
          />}

          {/* Tab switcher */}
          {result && (
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
              {TABS.map((t, i) => (
                <React.Fragment key={t.id}>
                  {i > 0 && TABS[i - 1].group !== t.group && (
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5 flex-shrink-0" />
                  )}
                  <button
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 sm:px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-150 whitespace-nowrap ${
                      activeTab === t.id
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Accumulation Portfolio chart */}
          {result && activeTab === 'accChart' && (
            <div className="space-y-5">
              <AccumulationChart
                accounts={inputs.accounts}
                currentAge={inputs.currentAge}
                retirementAge={inputs.retirementAge}
                inflation={inputs.inflation}
                workingMarginalRate={inputs.workingMarginalRate}
                nonRegOrdinaryPct={inputs.nonRegOrdinaryPct}
                darkMode={darkMode}
              />
              <AccumulationGrowthBar
                accounts={inputs.accounts}
                currentAge={inputs.currentAge}
                retirementAge={inputs.retirementAge}
                workingMarginalRate={inputs.workingMarginalRate}
                nonRegOrdinaryPct={inputs.nonRegOrdinaryPct}
                darkMode={darkMode}
              />
              <AccumulationAllocationChart
                accounts={inputs.accounts}
                currentAge={inputs.currentAge}
                retirementAge={inputs.retirementAge}
                workingMarginalRate={inputs.workingMarginalRate}
                nonRegOrdinaryPct={inputs.nonRegOrdinaryPct}
                darkMode={darkMode}
              />
              <ContributionRateChart
                accounts={inputs.accounts}
                currentAge={inputs.currentAge}
                retirementAge={inputs.retirementAge}
                annualSalary={inputs.annualSalary ?? 0}
                budgetAnnualIncome={(budget?.incomes ?? []).filter(i => i.enabled !== false).reduce((s, i) => s + (i.grossMonthly ?? 0) * 12, 0)}
                onGoToIncome={() => { setActiveApp('budget'); setBudgetTab('income') }}
                darkMode={darkMode}
              />
            </div>
          )}

          {/* Retirement Portfolio chart */}
          {result && activeTab === 'retChart' && (
            <div className="space-y-5">
              <BalanceChart
                rows={result.rows}
                accountMeta={result.accountMeta}
                inflation={inputs.inflation}
                retirementAge={inputs.retirementAge}
                rrifExhaustedAge={result.summary.rrifExhaustedAge}
                darkMode={darkMode}
                mcBands={mcResult?.bands ?? null}
                probabilityOfSuccess={mcResult?.probabilityOfSuccess ?? null}
                stressedRows={scenarioOverlayResult?.rows ?? null}
                seqRiskLabel={scenarioActive && scenarioOverlay
                  ? (activeEvent
                      ? `${activeEvent.name}: ${effectiveScenario.returnDelta}%/yr × ${effectiveScenario.durationYears}yr`
                      : `Stressed: ${effectiveScenario.returnDelta > 0 ? '+' : ''}${effectiveScenario.returnDelta}%/yr × ${effectiveScenario.durationYears}yr`)
                  : null}
              />
              <WithdrawalRateChart rows={result.rows} retirementAge={inputs.retirementAge} inflation={inputs.inflation} darkMode={darkMode} />
              <IncomeFloorChart rows={result.rows} retirementAge={inputs.retirementAge} inflation={inputs.inflation} darkMode={darkMode} />
            </div>
          )}

          {/* Cashflow chart + tax insights */}
          {result && activeTab === 'cashChart' && (
            <div className="space-y-5">
              <CashflowChart rows={result.rows} inflation={inputs.inflation} retirementAge={inputs.retirementAge} rrifExhaustedAge={result.summary.rrifExhaustedAge} darkMode={darkMode} />

              <WithdrawalSourceChart rows={result.rows} retirementAge={inputs.retirementAge} darkMode={darkMode} />

              <TaxBracketHeatmap
                rows={result.rows}
                retirementAge={inputs.retirementAge}
                rrspDrawdown={rrspDrawdown}
                onFixDrawdown={handleRrspDrawdownChange}
                onFixSequence={seq => handleInputChange({ ...inputs, withdrawalSequence: seq })}
                simParams={{
                  ...inputs,
                  cashOutflows,
                  cashOutflowTaxRates,
                  cashInflows:    retCashInflows,
                  strategyType:   strategy.strategyType,
                  strategyParams: { ...strategy.strategyParams, inflation: inputs.inflation / 100 },
                  scenarioShock:  scenarioActive ? effectiveScenario : null,
                }}
              />

            </div>
          )}


          {/* Estate tab */}
          {result && activeTab === 'estate' && (
            <EstateTab summary={result.summary} result={result} inputs={inputs} onInputChange={handleInputChange} />
          )}

          {/* Scenario comparison */}
          {activeTab === 'compare' && (
            <ScenarioCompare
              snapshots={snapshots}
              currentInputs={inputs}
              currentPersonConfigs={personConfigs}
              buildSimParams={buildSimParamsForSnapshot}
              darkMode={darkMode}
            />
          )}

          {/* Retirement Cashflow table */}
          {result && activeTab === 'retTable' && (
            <DetailTable
              rows={result.rows}
              cashOutflows={cashOutflows}
              cashOutflowTaxRates={cashOutflowTaxRates}
              cashInflows={retCashInflows}
              onOutflowChange={handleOutflowChange}
              onOutflowTaxRateChange={handleOutflowTaxRateChange}
              onInflowChange={handleRetInflowChange}
            />
          )}

          {/* Accumulation Cashflow table */}
          {activeTab === 'accTable' && (
            <AccumulationTable
              rows={accRows}
              accounts={inputs.accounts}
              accCashInflows={accCashInflows}
              accCashOutflows={accCashOutflows}
              accOutflowTaxRates={accOutflowTaxRates}
              onInflowChange={handleAccInflowChange}
              onOutflowChange={handleAccOutflowChange}
              onOutflowTaxRateChange={handleAccOutflowTaxRateChange}
            />
          )}

          <p className="text-[11px] text-gray-400 text-center pt-2">
            For educational purposes only. Not financial or tax advice.
            Tax rates are approximate 2025 values. Consult a qualified advisor.
          </p>
        </main>

          </div>
        )}

      </div>

      {/* ── Mobile Inputs Drawer ─────────────────────────────────────────────── */}
      {mobileInputsOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileInputsOpen(false)} />
          {/* Drawer panel */}
          <div className="relative ml-auto w-full max-w-sm h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Retirement Inputs</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Edit your planning assumptions</p>
              </div>
              <button
                onClick={() => setMobileInputsOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {/* Scrollable input panel */}
            <div className="flex-1 overflow-y-auto">
              <InputPanel inputs={inputs} onChange={handleInputChange} onOpenAccounts={() => { setActiveApp('accounts'); setMobileInputsOpen(false) }} reProperties={budget.properties ?? []} simRows={allResults?.primary?.rows ?? []} />
            </div>
          </div>
        </div>
      )}

      {/* ── Onboarding Wizard ─────────────────────────────────────────────── */}
      {onboardingOpen && (
        <OnboardingWizard
          inputs={inputs}
          onChange={handleInputChange}
          onClose={() => setOnboardingOpen(false)}
        />
      )}

    </div>
  )
}

