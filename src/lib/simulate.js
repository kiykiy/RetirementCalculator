// ─── Main Retirement Simulation Loop ─────────────────────────────────────────
import { calcTax, rrif_minimum, cgInclusion } from './tax.js'
import { createStrategy } from './strategies.js'

// ─── CPP / OAS / DB helpers ───────────────────────────────────────────────────

const YMPE_2025     = 68500
const CPP_MAX_2025  = 17460
const OAS_FULL_2025 = 8713

// ─── Province probate fees ────────────────────────────────────────────────────
// Applied only to non-registered assets (RRSP/RRIF/TFSA bypass via named beneficiary)
const PROBATE = {
  ON: v => v <= 50000 ? 0 : (v - 50000) * 0.015,
  BC: v => v <= 25000 ? 0 : v <= 50000 ? (v - 25000) * 0.006 : 150 + (v - 50000) * 0.014,
  AB: () => 525,
  SK: v => v * 0.007,
  MB: v => v * 0.007,
  QC: () => 0,
  NS: v => v * 0.015,
  NB: v => v * 0.005,
  PE: v => v * 0.004,
  NL: v => v * 0.005,
  YT: v => Math.min(140, v * 0.0025),
  NT: v => v <= 10000 ? 25 : 25 + (v - 10000) * 0.003,
  NU: v => v <= 10000 ? 25 : 25 + (v - 10000) * 0.003,
}

// Compute estate taxes and net inheritance from final account balances.
// spousalRollover = true → RRIF/RRSP rolls to spouse tax-free (deferred).
export function calcEstateTax({ finalAccounts, province = 'ON', spousalRollover = false }) {
  const rrifAccs   = finalAccounts.filter(a => a.taxType === 'rrif')
  const nonRegAccs = finalAccounts.filter(a => a.taxType === 'nonreg')
  const tfsaAccs   = finalAccounts.filter(a => a.taxType === 'tfsa')

  const rrifBalance   = rrifAccs.reduce((s, a) => s + a.balance, 0)
  const nonRegBalance = nonRegAccs.reduce((s, a) => s + a.balance, 0)
  const tfsaBalance   = tfsaAccs.reduce((s, a) => s + a.balance, 0)
  const nonRegGain    = Math.max(0, nonRegAccs.reduce((s, a) => s + Math.max(0, a.balance - (a.costBasis ?? 0)), 0))
  const nonRegBasis   = nonRegAccs.reduce((s, a) => s + (a.costBasis ?? 0), 0)

  // RRIF/RRSP: fully taxable as income at death (unless spousal rollover)
  let rrifTax = 0, rrifEffRate = 0
  if (rrifBalance > 0 && !spousalRollover) {
    const res = calcTax({ rrif: rrifBalance, province })
    rrifTax     = res.total
    rrifEffRate = res.effectiveRate
  }

  // Non-reg: capital gains on accrued growth (50% inclusion)
  let nonRegTax = 0
  if (nonRegGain > 0) {
    const res = calcTax({ capitalGain: nonRegGain, province })
    nonRegTax = res.total
  }

  // Probate on non-reg assets only
  const probateFee = Math.round((PROBATE[province] ?? PROBATE.ON)(nonRegBalance))

  const grossEstate = rrifBalance + nonRegBalance + tfsaBalance
  const totalTax    = rrifTax + nonRegTax
  const netEstate   = Math.max(0, grossEstate - totalTax - probateFee)

  return {
    grossEstate:    Math.round(grossEstate),
    rrifBalance:    Math.round(rrifBalance),
    rrifTax:        Math.round(rrifTax),
    rrifEffRate,
    nonRegBalance:  Math.round(nonRegBalance),
    nonRegGain:     Math.round(nonRegGain),
    nonRegBasis:    Math.round(nonRegBasis),
    nonRegTax:      Math.round(nonRegTax),
    tfsaBalance:    Math.round(tfsaBalance),
    totalTax:       Math.round(totalTax),
    probateFee,
    netEstate:      Math.round(netEstate),
  }
}

// ─── Asset class assumptions (for advanced portfolio mix) ─────────────────────
export const ASSET_CLASSES = {
  canadianEquity: { label: 'Canadian Equity', ret: 7.5, std: 14.0 },
  usEquity:       { label: 'US Equity',        ret: 9.5, std: 16.0 },
  intlEquity:     { label: 'Intl Equity',      ret: 7.0, std: 17.0 },
  fixedIncome:    { label: 'Fixed Income',     ret: 3.5, std:  6.0 },
  cash:           { label: 'Cash / GIC',       ret: 4.5, std:  1.0 },
}

export function getMixStats(mix) {
  const total = Object.values(mix).reduce((s, v) => s + v, 0)
  if (total === 0) return { ret: 0, std: 0 }
  let ret = 0, variance = 0
  for (const [key, pct] of Object.entries(mix)) {
    const w  = pct / total
    const ac = ASSET_CLASSES[key]
    if (ac) { ret += w * ac.ret; variance += w * w * ac.std * ac.std }
  }
  return { ret, std: Math.sqrt(variance) }
}

function getAccReturnRate(acc) {
  if (acc.advancedMode && acc.mix) return getMixStats(acc.mix).ret
  return acc.returnRate ?? 6
}

function getAccStdDev(acc) {
  if (acc.advancedMode && acc.mix) return getMixStats(acc.mix).std
  return 12  // default balanced-portfolio std dev
}

// ─── TFSA annual contribution limit ──────────────────────────────────────────
// Base: $7,000 in 2026. When indexed, grows with CPI rounded to nearest $500.
export function calcTfsaLimit(year, inflationRate = 2.5, indexed = false) {
  const BASE_LIMIT = 7000
  const BASE_YEAR  = 2026
  if (!indexed || year <= BASE_YEAR) return BASE_LIMIT
  const projected = BASE_LIMIT * Math.pow(1 + inflationRate / 100, year - BASE_YEAR)
  return Math.round(projected / 500) * 500
}

export function calcCPP({ avgEarnings, yearsContributed, startAge }) {
  const base = Math.min(avgEarnings, YMPE_2025) / YMPE_2025
             * CPP_MAX_2025
             * Math.min(yearsContributed, 39) / 39
  const months = (startAge - 65) * 12
  const factor = months >= 0 ? 1 + months * 0.007 : 1 + months * 0.006
  return Math.round(base * factor)
}

export function calcOAS({ yearsResident, startAge }) {
  const partial = Math.min(Math.max(yearsResident, 0), 40) / 40
  const base    = OAS_FULL_2025 * partial
  const deferred = Math.max(0, (startAge - 65) * 12)
  return Math.round(base * (1 + deferred * 0.006))
}

export function calcDB({ bestAvgSalary, yearsService, accrualRate, startAge, indexingRate }, age) {
  if (age < startAge) return 0
  const base = bestAvgSalary * (accrualRate / 100) * yearsService
  return Math.round(base * Math.pow(1 + indexingRate / 100, age - startAge))
}

// ─── Accumulation cashflow rows ───────────────────────────────────────────────

export function buildAccumulationRows({
  accounts, currentAge, retirementAge,
  workingMarginalRate = 40, nonRegOrdinaryPct = 0,
  accCashInflows = {}, accCashOutflows = {}, accOutflowTaxRates = {},
  tfsaIndexedToInflation = false, inflation = 2.5,
}) {
  const ordinaryFrac = nonRegOrdinaryPct / 100
  const margRate     = workingMarginalRate / 100
  const balances     = accounts.map(a => a.balance)
  const rows         = []

  for (let age = currentAge; age <= retirementAge; age++) {
    const year       = new Date().getFullYear() + (age - currentAge)
    const isLastYear = age === retirementAge
    const tfsaLimit  = calcTfsaLimit(year, inflation, tfsaIndexedToInflation)

    const accountBalances = Object.fromEntries(
      accounts.map((acc, i) => [acc.id, Math.round(balances[i])])
    )
    const totalBalance = balances.reduce((s, b) => s + b, 0)

    let grossReturn   = 0
    let nonRegTaxDrag = 0
    const perAccountReturn = {}
    const perAccountContrib = {}

    accounts.forEach((acc, i) => {
      const returnAmt = balances[i] * (getAccReturnRate(acc) / 100)
      grossReturn += returnAmt
      perAccountReturn[acc.id] = Math.round(returnAmt)
      if (acc.taxType === 'nonreg' && returnAmt > 0) {
        nonRegTaxDrag += returnAmt * ordinaryFrac * margRate
      }
    })

    const contribution        = isLastYear ? 0 : accounts.reduce((s, a) => {
      const c = a.taxType === 'tfsa' ? Math.min(a.annualContribution, tfsaLimit) : a.annualContribution
      perAccountContrib[a.id] = isLastYear ? 0 : Math.round(c)
      return s + c
    }, 0)
    const cashInflow          = accCashInflows[age]   || 0
    const cashOutflowNet      = accCashOutflows[age]  || 0
    const outflowTaxRate      = accOutflowTaxRates[age] || 0
    const cashOutflowGross    = cashOutflowNet > 0 && outflowTaxRate > 0
      ? Math.round(cashOutflowNet / (1 - outflowTaxRate))
      : cashOutflowNet

    rows.push({
      age, year,
      accountBalances,
      perAccountReturn,
      perAccountContrib,
      totalBalance:  Math.round(totalBalance),
      contribution:  Math.round(contribution),
      grossReturn:   Math.round(grossReturn),
      nonRegTaxDrag: Math.round(nonRegTaxDrag),
      netGrowth:     Math.round(grossReturn - nonRegTaxDrag + contribution),
      cashInflow:    Math.round(cashInflow),
      cashOutflow:   Math.round(cashOutflowGross),
      tfsaLimit,
      tfsaIndexedToInflation,
    })

    if (!isLastYear) {
      // Apply returns + contributions (TFSA contributions capped at annual limit)
      accounts.forEach((acc, i) => {
        const returnAmt      = balances[i] * (getAccReturnRate(acc) / 100)
        const afterTaxReturn = acc.taxType === 'nonreg'
          ? returnAmt * (1 - ordinaryFrac * margRate)
          : returnAmt
        const contrib = acc.taxType === 'tfsa'
          ? Math.min(acc.annualContribution, tfsaLimit)
          : acc.annualContribution
        balances[i] += afterTaxReturn + contrib
      })
      // Apply inflow — goes to non-reg if available, else distributed proportionally
      if (cashInflow > 0) {
        const nonRegIdx = accounts.reduce((arr, a, i) => a.taxType === 'nonreg' ? [...arr, i] : arr, [])
        if (nonRegIdx.length > 0) {
          const nonRegTotal = nonRegIdx.reduce((s, i) => s + balances[i], 0)
          nonRegIdx.forEach(i => {
            const share = nonRegTotal > 0 ? balances[i] / nonRegTotal : 1 / nonRegIdx.length
            balances[i] += cashInflow * share
          })
        } else {
          const total = balances.reduce((s, b) => s + b, 0)
          balances.forEach((b, i) => { balances[i] += total > 0 ? cashInflow * (b / total) : cashInflow / balances.length })
        }
      }
      // Apply gross outflow — deducted proportionally from all accounts
      if (cashOutflowGross > 0) {
        const total = balances.reduce((s, b) => s + b, 0)
        if (total > 0) {
          const scale = Math.max(0, 1 - cashOutflowGross / total)
          balances.forEach((_, i) => { balances[i] *= scale })
        }
      }
    }
  }
  return rows
}

// ─── Main simulation ──────────────────────────────────────────────────────────

export function runSimulation(inputs) {
  const {
    currentAge,
    retirementAge,
    lifeExpectancy,
    accounts,
    inflation,
    scenarioShock = null,   // { startAge, durationYears, returnDelta, inflationDelta }
    cppAvgEarnings, cppYearsContributed, cppStartAge,
    oasYearsResident, oasStartAge,
    dbEnabled, dbBestAvgSalary, dbYearsService, dbAccrualRate, dbStartAge, dbIndexingRate,
    dbSalaryGrowthEnabled = false,
    dbSalaryGrowthRate    = 0,
    otherPension,
    province,
    strategyType,
    strategyParams,
    cashOutflows        = {},
    cashOutflowTaxRates = {},
    cashInflows         = {},
    workingMarginalRate = 40,
    nonRegOrdinaryPct   = 0,
    rrspDrawdown = { type: 'none' },
    tfsaIndexedToInflation = false,
    retirementIncomes = [],
    withdrawalSequence = ['nonreg', 'tfsa', 'rrif'],
    incomeTargetPhases = null,   // [{ years, amount }] — phase-based spending override
    // Real estate (injected from App.jsx)
    reProperties = [],
  } = inputs

  const ordinaryFrac = nonRegOrdinaryPct / 100
  const cgFrac       = 1 - ordinaryFrac
  const margRate     = workingMarginalRate / 100

  // ── Project each account to retirement ───────────────────────────────────────
  const yearsToRet = Math.max(0, retirementAge - currentAge)

  // ── DB pension salary growth projection ──────────────────────────────────────
  const _dbGrowthRate     = dbSalaryGrowthRate ?? 2
  const projectedDbSalary = (dbEnabled && dbSalaryGrowthEnabled && _dbGrowthRate > 0)
    ? Math.round(dbBestAvgSalary * Math.pow(1 + _dbGrowthRate / 100, yearsToRet))
    : dbBestAvgSalary

  const simAccounts = accounts.map(acc => {
    const r = getAccReturnRate(acc) / 100
    const effectiveR = acc.taxType === 'nonreg'
      ? r * (1 - ordinaryFrac * margRate)
      : r
    const growth    = Math.pow(1 + effectiveR, yearsToRet)
    const contribFV = yearsToRet > 0 && effectiveR > 0
      ? acc.annualContribution * (growth - 1) / effectiveR
      : acc.annualContribution * yearsToRet
    const bal = acc.balance * growth + contribFV
    return {
      id:         acc.id,
      name:       acc.name,
      taxType:    acc.taxType,
      returnRate: getAccReturnRate(acc),   // effective rate (mix-weighted if advanced)
      balance:    bal,
      costBasis:  acc.taxType === 'nonreg' ? bal * 0.6 : 0,
    }
  })

  const portfolioAtRetirement = simAccounts.reduce((s, a) => s + a.balance, 0)
  const retirementSnapshot    = simAccounts.map(a => ({ id: a.id, name: a.name, balance: Math.round(a.balance) }))

  const weightedReturn = portfolioAtRetirement > 0
    ? simAccounts.reduce((s, a) => s + a.returnRate * a.balance, 0) / portfolioAtRetirement / 100
    : 0.05

  const retirementYear = new Date().getFullYear() + (retirementAge - currentAge)

  // ── Pre-compute government income per age (for strategy solver) ──────────────
  // The targeted strategy needs to know how much CPP/OAS/pension covers each year
  // so it only draws the remaining shortfall from the portfolio when solving.
  const govIncomeByAge = {}
  for (let age = retirementAge; age <= lifeExpectancy; age++) {
    const cpp    = age >= cppStartAge ? calcCPP({ avgEarnings: cppAvgEarnings, yearsContributed: cppYearsContributed, startAge: cppStartAge }) : 0
    const oas    = age >= oasStartAge ? calcOAS({ yearsResident: oasYearsResident, startAge: oasStartAge }) : 0
    const db     = dbEnabled ? calcDB({ bestAvgSalary: projectedDbSalary, yearsService: dbYearsService, accrualRate: dbAccrualRate, startAge: dbStartAge, indexingRate: dbIndexingRate }, age) : 0
    const retInc = retirementIncomes
      .filter(ri => age >= (ri.startAge ?? retirementAge) && age <= (ri.endAge ?? lifeExpectancy))
      .reduce((s, ri) => s + (ri.amount ?? 0), 0)
    govIncomeByAge[age] = cpp + oas + db + otherPension + retInc
  }

  // ── Account-level balances at retirement (for strategy solver) ──────────────
  const rrifAtRet   = simAccounts.filter(a => a.taxType === 'rrif').reduce((s, a) => s + a.balance, 0)
  const tfsaAtRet   = simAccounts.filter(a => a.taxType === 'tfsa').reduce((s, a) => s + a.balance, 0)
  const nonRegAtRet = simAccounts.filter(a => a.taxType === 'nonreg').reduce((s, a) => s + a.balance, 0)
  const rrifRetRate = rrifAtRet > 0
    ? simAccounts.filter(a => a.taxType === 'rrif').reduce((s, a) => s + a.returnRate * a.balance, 0) / rrifAtRet / 100
    : weightedReturn
  const nonRegCBFrac = nonRegAtRet > 0
    ? simAccounts.filter(a => a.taxType === 'nonreg').reduce((s, a) => s + a.costBasis, 0) / nonRegAtRet
    : 0.6

  // Estimate average effective tax rate for the solver (uses midpoint income)
  const midGovInc = govIncomeByAge[Math.round((retirementAge + (strategyParams?.targetAge ?? lifeExpectancy)) / 2)] ?? 0
  const estTaxResult = calcTax({
    rrif: Math.max(0, portfolioAtRetirement * 0.04),
    cpp: midGovInc * 0.3, oas: midGovInc * 0.3, pension: midGovInc * 0.4,
    capitalGain: 0, ordinaryNonReg: 0, province,
  })

  // ── Strategy ─────────────────────────────────────────────────────────────────
  const strategy = createStrategy(
    strategyType,
    { ...strategyParams, inflation: inflation / 100 },
    {
      retirementAge,
      portfolioTotal: portfolioAtRetirement,
      annualReturn: weightedReturn,
      govIncomeByAge,
      rrifBalance:    rrifAtRet,
      tfsaBalance:    tfsaAtRet,
      nonRegBalance:  nonRegAtRet,
      rrifReturnRate: rrifRetRate,
      rrspDrawdown,
      estimatedTaxRate: estTaxResult.effectiveRate || 0.25,
      tfsaAnnualLimit: calcTfsaLimit(retirementYear, inflation, tfsaIndexedToInflation),
      nonRegCostBasisFrac: nonRegCBFrac,
    }
  )

  // ── Proportional withdrawal from a typed group ────────────────────────────────
  function withdrawFrom(accs, needed) {
    const total = accs.reduce((s, a) => s + a.balance, 0)
    if (total <= 0 || needed <= 0) return { actual: 0, capitalGain: 0 }
    const actual = Math.min(total, needed)
    let capitalGain = 0
    accs.forEach(acc => {
      const take = actual * (acc.balance / total)
      if (acc.taxType === 'nonreg' && acc.balance > 0) {
        const acbFrac = acc.costBasis / acc.balance
        capitalGain += take * Math.max(0, 1 - acbFrac)
        acc.costBasis = Math.max(0, acc.costBasis - take * acbFrac)
      }
      acc.balance -= take
    })
    return { actual, capitalGain }
  }

  // ── Simulation loop ──────────────────────────────────────────────────────────
  const rows = []
  const inf          = inflation / 100

  for (let age = retirementAge; age <= lifeExpectancy; age++) {
    const year = new Date().getFullYear() + (age - currentAge)

    // Apply scenario shock if active for this age
    const shockOn = scenarioShock &&
      age >= scenarioShock.startAge &&
      age <  scenarioShock.startAge + (scenarioShock.durationYears ?? 1)
    const ageReturnAdj  = shockOn ? (scenarioShock.returnDelta    ?? 0) / 100 : 0
    const ageInf        = shockOn ? inf + (scenarioShock.inflationDelta ?? 0) / 100 : inf

    const portfolioBefore = simAccounts.reduce((s, a) => s + a.balance, 0)
    if (portfolioBefore <= 0) {
      rows.push(makeEmptyRow(age, year, simAccounts))
      continue
    }

    simAccounts.forEach(acc => { acc.balance *= (1 + acc.returnRate / 100 + ageReturnAdj) })

    const rrifAccs   = simAccounts.filter(a => a.taxType === 'rrif')
    const tfsaAccs   = simAccounts.filter(a => a.taxType === 'tfsa')
    const nonRegAccs = simAccounts.filter(a => a.taxType === 'nonreg')

    const rrifTotal   = rrifAccs.reduce((s, a) => s + a.balance, 0)
    const tfsaTotal   = tfsaAccs.reduce((s, a) => s + a.balance, 0)
    const nonRegTotal = nonRegAccs.reduce((s, a) => s + a.balance, 0)
    const portfolioAfterGrowth = rrifTotal + tfsaTotal + nonRegTotal

    const rrif_min = rrif_minimum(age, rrifTotal)

    const annualCpp = age >= cppStartAge
      ? calcCPP({ avgEarnings: cppAvgEarnings, yearsContributed: cppYearsContributed, startAge: cppStartAge }) : 0
    const annualOas = age >= oasStartAge
      ? calcOAS({ yearsResident: oasYearsResident, startAge: oasStartAge }) : 0
    const annualDb  = dbEnabled
      ? calcDB({ bestAvgSalary: projectedDbSalary, yearsService: dbYearsService, accrualRate: dbAccrualRate, startAge: dbStartAge, indexingRate: dbIndexingRate }, age) : 0
    // Retirement income sources (rental, part-time, etc.) — taxable ordinary income
    const retIncomeThisAge = retirementIncomes
      .filter(ri => age >= (ri.startAge ?? retirementAge) && age <= (ri.endAge ?? lifeExpectancy))
      .reduce((s, ri) => s + (ri.amount ?? 0), 0)
    const annualPension = annualDb + otherPension + retIncomeThisAge
    const govIncome     = annualCpp + annualOas + annualPension

    // ── RRSP/RRIF drawdown target ──────────────────────────────────────────────
    const weightedRrifReturn = rrifTotal > 0
      ? rrifAccs.reduce((s, a) => s + a.returnRate * a.balance, 0) / rrifTotal / 100
      : weightedReturn
    let rrifDrawdownTarget = rrif_min
    if (rrspDrawdown.type === 'fixedAmount') {
      rrifDrawdownTarget = Math.max(rrif_min, rrspDrawdown.fixedAmount || 0)
    } else if (rrspDrawdown.type === 'targetAge') {
      // +1 so the RRIF is drained TO ZERO during the target age year itself
      // (without +1 the last PMT fires at targetAge-1, depleting one year early)
      const n = (rrspDrawdown.targetAge || retirementAge) - age + 1
      const r = weightedRrifReturn
      if (n > 0 && rrifTotal > 0) {
        const pmt = r > 0
          ? rrifTotal * r / (1 - Math.pow(1 + r, -n))
          : rrifTotal / n
        rrifDrawdownTarget = Math.max(rrif_min, Math.round(pmt))
      }
    } else if (rrspDrawdown.type === 'targetBracket') {
      const targetIncome  = rrspDrawdown.targetAnnualIncome || 0
      const bracketTarget = Math.max(0, targetIncome - govIncome)
      rrifDrawdownTarget  = Math.max(rrif_min, bracketTarget)
    }

    let strategyTarget = strategy({ age, year, retirementYear, portfolioTotal: portfolioAfterGrowth, inflation: ageInf })

    // Phase-based spending override — inflation-adjusted from retirement age
    if (incomeTargetPhases?.length > 0) {
      const yearsIntoRet = age - retirementAge
      let phaseAmount = incomeTargetPhases[incomeTargetPhases.length - 1].amount
      let cumYears = 0
      for (const phase of incomeTargetPhases) {
        cumYears += phase.years
        if (yearsIntoRet < cumYears) { phaseAmount = phase.amount; break }
      }
      strategyTarget = Math.round(phaseAmount * Math.pow(1 + ageInf, yearsIntoRet))
    }

    const cashOutflowNet  = cashOutflows[age] || 0
    const outflowTaxRate  = cashOutflowTaxRates[age] || 0
    const cashOutflow     = cashOutflowNet > 0 && outflowTaxRate > 0
      ? Math.round(cashOutflowNet / (1 - outflowTaxRate))
      : cashOutflowNet
    const cashInflow      = cashInflows[age] || 0

    // ── PHASE 1: RRSP/RRIF drawdown (settled first, independently of spending) ──
    // The RRIF drawdown target applies ONLY to RRIF accounts. If the RRIF is
    // depleted, the excess target does NOT cascade to non-reg/TFSA.
    let withdrawn = 0, rrifWithdrawn = 0, tfsaWithdrawn = 0, nonRegWithdrawn = 0, capitalGainRealized = 0

    const { actual: rrifDrawAmt } = withdrawFrom(rrifAccs, rrifDrawdownTarget)
    rrifWithdrawn += rrifDrawAmt; withdrawn += rrifDrawAmt

    // ── PHASE 2: Spending withdrawal from remaining accounts ──────────────────
    // How much MORE does the portfolio need to supply for spending (beyond what
    // the RRIF draw + govIncome + cashInflow already cover)?
    // cashInflow offsets spending need; any surplus inflow is reinvested in Phase 4.
    const grossSpendingNeed = Math.max(0, strategyTarget + cashOutflow - govIncome)
    const spendingNeed      = Math.max(0, grossSpendingNeed - cashInflow)
    const spendingShortfall = Math.max(0, spendingNeed - rrifWithdrawn)

    // Draw shortfall in user-specified sequence order
    const accsMap = { rrif: rrifAccs, tfsa: tfsaAccs, nonreg: nonRegAccs }
    let shortfallLeft = spendingShortfall
    for (const taxType of withdrawalSequence) {
      if (shortfallLeft <= 0) break
      const accs = accsMap[taxType]
      if (!accs) continue
      const { actual, capitalGain: cg } = withdrawFrom(accs, shortfallLeft)
      shortfallLeft -= actual
      withdrawn     += actual
      if (taxType === 'rrif')    { rrifWithdrawn    += actual }
      if (taxType === 'tfsa')    { tfsaWithdrawn    += actual }
      if (taxType === 'nonreg')  { nonRegWithdrawn  += actual; capitalGainRealized += cg }
    }

    // Split non-reg gain: ordinary income vs capital gains per user setting
    const ordinaryNonReg    = capitalGainRealized * ordinaryFrac
    const capitalGainForTax = capitalGainRealized * cgFrac

    const taxResult = calcTax({
      rrif: rrifWithdrawn,
      cpp: annualCpp,
      oas: annualOas,
      capitalGain: capitalGainForTax,
      ordinaryNonReg,
      pension: annualPension,
      province,
    })

    const grossIncome    = rrifWithdrawn + annualCpp + annualOas + annualPension
                         + cgInclusion(capitalGainForTax) + ordinaryNonReg
    const netIncome      = Math.max(0, withdrawn + govIncome - taxResult.total)
    const withdrawalRate = portfolioAfterGrowth > 0 ? withdrawn / portfolioAfterGrowth * 100 : 0

    // ── PHASE 3: Reinvest RRIF surplus (excess drawdown beyond spending) ──────
    // When RRIF drawdown exceeds spending needs, the after-tax surplus is either
    // reinvested (TFSA first → non-reg) or kept as additional income.
    const tfsaAnnualLimit       = calcTfsaLimit(year, inflation, tfsaIndexedToInflation)
    let   tfsaContributedThisYear = 0

    // Surplus = total income exceeds total spending.
    // Total income sources: govIncome + RRIF draw.  Total spending: strategyTarget + cashOutflow.
    const rrifSurplusGross = Math.max(0, govIncome + rrifWithdrawn - (strategyTarget + cashOutflow))
    let incomeSurplusTfsa   = 0
    let incomeSurplusNonReg = 0
    if (rrifSurplusGross > 0 && (rrspDrawdown.reinvestSurplus ?? true)) {
      const rrifSurplusAfterTax = Math.round(rrifSurplusGross * (1 - taxResult.effectiveRate))
      // TFSA first (up to annual contribution limit)
      const tfsaRoom = Math.max(0, tfsaAnnualLimit - tfsaContributedThisYear)
      if (tfsaAccs.length > 0 && tfsaRoom > 0) {
        incomeSurplusTfsa = Math.min(rrifSurplusAfterTax, tfsaRoom)
        tfsaContributedThisYear += incomeSurplusTfsa
        const tot = tfsaAccs.reduce((s, a) => s + a.balance, 0)
        tfsaAccs.forEach(acc => {
          acc.balance += incomeSurplusTfsa * (tot > 0 ? acc.balance / tot : 1 / tfsaAccs.length)
        })
      }
      // Remainder → non-reg
      const incomeRemainder = rrifSurplusAfterTax - incomeSurplusTfsa
      if (incomeRemainder > 0 && nonRegAccs.length > 0) {
        incomeSurplusNonReg = incomeRemainder
        const tot = nonRegAccs.reduce((s, a) => s + a.balance, 0)
        nonRegAccs.forEach(acc => {
          const added = incomeSurplusNonReg * (tot > 0 ? acc.balance / tot : 1 / nonRegAccs.length)
          acc.balance  += added
          acc.costBasis += added
        })
      }
    }

    // ── PHASE 4: Cash inflow allocation ─────────────────────────────────────────
    // Inflow first covers spending shortfall; surplus → TFSA (up to remaining limit), excess → Non-Reg
    const inflowForSpending = Math.round(Math.min(cashInflow, grossSpendingNeed))
    const inflowSurplus     = Math.round(Math.max(0, cashInflow - grossSpendingNeed))
    let inflowSurplusTfsa   = 0
    let inflowSurplusNonReg = 0
    let inflowInvestedTo    = null

    if (inflowSurplus > 0) {
      // TFSA first (capped at remaining annual limit after income surplus used some room)
      const tfsaRoom = Math.max(0, tfsaAnnualLimit - tfsaContributedThisYear)
      if (tfsaAccs.length > 0 && tfsaRoom > 0) {
        inflowSurplusTfsa = Math.min(inflowSurplus, tfsaRoom)
        if (inflowSurplusTfsa > 0) {
          tfsaContributedThisYear += inflowSurplusTfsa
          const tot = tfsaAccs.reduce((s, a) => s + a.balance, 0)
          tfsaAccs.forEach(acc => {
            acc.balance += inflowSurplusTfsa * (tot > 0 ? acc.balance / tot : 1 / tfsaAccs.length)
          })
          inflowInvestedTo = 'TFSA'
        }
      }
      // Remainder (over TFSA limit, or no TFSA) → Non-Reg
      const remaining = inflowSurplus - inflowSurplusTfsa
      if (remaining > 0 && nonRegAccs.length > 0) {
        inflowSurplusNonReg = remaining
        const tot = nonRegAccs.reduce((s, a) => s + a.balance, 0)
        nonRegAccs.forEach(acc => {
          const added = inflowSurplusNonReg * (tot > 0 ? acc.balance / tot : 1 / nonRegAccs.length)
          acc.balance  += added
          acc.costBasis += added
        })
        inflowInvestedTo = inflowSurplusTfsa > 0 ? 'TFSA + Non-Reg' : 'Non-Reg'
      }
    }

    // ── Non-Reg → TFSA annual optimization ───────────────────────────────────
    // After spending and surplus allocations, transfer excess non-reg balance
    // to TFSA (up to any remaining annual room) to convert taxable returns to
    // tax-free. Capital gains triggered on the withdrawal reduce the net deposit,
    // so we gross-up the withdrawal target so the NET amount fills the TFSA room.
    const tfsaRoomRemaining = Math.max(0, tfsaAnnualLimit - tfsaContributedThisYear)
    let nonRegToTfsaGross = 0
    let nonRegToTfsaNet   = 0
    let nonRegToTfsaTax   = 0
    if (tfsaRoomRemaining > 0 && tfsaAccs.length > 0 && nonRegAccs.length > 0) {
      const nonRegBal = nonRegAccs.reduce((s, a) => s + a.balance, 0)
      const nonRegCB  = nonRegAccs.reduce((s, a) => s + (a.costBasis ?? 0), 0)
      if (nonRegBal > 0) {
        // Gross-up: solve for the withdrawal amount such that after capital-gains
        // tax the net deposit equals tfsaRoomRemaining.
        //   net = gross × (1 − gainFrac × taxPerGain)
        //   gross = tfsaRoomRemaining / (1 − gainFrac × taxPerGain)
        const blendedAcbFrac = Math.min(1, nonRegCB / nonRegBal)
        const gainFrac       = 1 - blendedAcbFrac
        const taxPerGain     = (cgFrac * 0.5 + ordinaryFrac) * taxResult.effectiveRate
        const netFrac        = Math.max(0.01, 1 - gainFrac * taxPerGain)
        const grossTarget    = Math.min(nonRegBal, Math.ceil(tfsaRoomRemaining / netFrac))
        const { actual: xferGross, capitalGain: xferCG } = withdrawFrom(nonRegAccs, grossTarget)
        if (xferGross > 0) {
          const taxOnXfer = Math.round(
            (xferCG * cgFrac * 0.5 + xferCG * ordinaryFrac) * taxResult.effectiveRate
          )
          nonRegToTfsaGross = xferGross
          nonRegToTfsaTax   = taxOnXfer
          // Clamp to room so rounding never causes an over-contribution
          nonRegToTfsaNet   = Math.min(tfsaRoomRemaining, Math.max(0, xferGross - taxOnXfer))
          tfsaContributedThisYear += nonRegToTfsaNet
          const tot = tfsaAccs.reduce((s, a) => s + a.balance, 0)
          tfsaAccs.forEach(acc => {
            acc.balance += nonRegToTfsaNet * (tot > 0 ? acc.balance / tot : 1 / tfsaAccs.length)
          })
        }
      }
    }

    rows.push({
      age, year,
      accountBalances: Object.fromEntries(simAccounts.map(a => [a.id, Math.round(a.balance)])),
      rrifTotal:       Math.round(rrifAccs.reduce((s, a) => s + a.balance, 0)),
      tfsaTotal:       Math.round(tfsaAccs.reduce((s, a) => s + a.balance, 0)),
      nonRegTotal:     Math.round(nonRegAccs.reduce((s, a) => s + a.balance, 0)),
      portfolioTotal:  Math.round(simAccounts.reduce((s, a) => s + a.balance, 0)),
      grossWithdrawal: Math.round(withdrawn),
      rrifWithdrawn:   Math.round(rrifWithdrawn),
      tfsaWithdrawn:   Math.round(tfsaWithdrawn),
      nonRegWithdrawn: Math.round(nonRegWithdrawn),
      rrif_min:        Math.round(rrif_min),
      rrifTarget:      Math.round(rrifDrawdownTarget),
      cpp:             Math.round(annualCpp),
      oas:             Math.round(annualOas - taxResult.oasClawback),
      oasClawback:     Math.round(taxResult.oasClawback),
      dbPension:       Math.round(annualDb),
      otherPension:    Math.round(otherPension),
      pension:         Math.round(annualPension),
      cashOutflow:          Math.round(cashOutflow),
      cashInflow:           Math.round(cashInflow),
      inflowForSpending,
      inflowSurplus,
      inflowSurplusTfsa,
      inflowSurplusNonReg,
      inflowInvestedTo,
      tfsaAnnualLimit,
      tfsaIndexedToInflation,
      incomeSurplusTfsa,
      incomeSurplusNonReg,
      nonRegToTfsaGross,
      nonRegToTfsaTax,
      nonRegToTfsaNet,
      capitalGain:     Math.round(capitalGainRealized),
      grossIncome:     Math.round(grossIncome),
      federalTax:      taxResult.federal,
      provincialTax:   taxResult.provincial,
      totalTax:        taxResult.total,
      netIncome:       Math.round(netIncome),
      effectiveRate:   taxResult.effectiveRate,
      withdrawalRate:  Math.round(withdrawalRate * 10) / 10,
    })
  }

  // ── Real Estate equity projection ────────────────────────────────────────────
  // Track property values & mortgage balances over retirement years
  // (appreciation + paydown). Added to each row and used in estate calc.
  const reState = (reProperties ?? []).map(p => {
    const mort = p.mortgage?.enabled ? p.mortgage : null
    let mortBal = mort ? (mort.balance ?? 0) : 0
    // First pay down during working years (yearsToRet already computed above)
    const mortR = mort ? (mort.rate ?? 0) / 100 / 12 : 0
    const mortPmt = mort ? (() => {
      if (!mort.balance || !mort.amortizationMonths) return 0
      const r = mortR, n = mort.amortizationMonths
      if (n <= 0) return 0
      return r === 0 ? mort.balance / n : mort.balance * r / (1 - Math.pow(1 + r, -n))
    })() : 0
    // Pay down mortgage through working years
    for (let m = 0; m < yearsToRet * 12 && mortBal > 0.01; m++) {
      const interest = mortBal * mortR
      mortBal = Math.max(0, mortBal - (mortPmt - interest))
    }
    return {
      propValue: (p.currentValue ?? 0) * Math.pow(1 + (p.appreciation ?? 3) / 100, yearsToRet),
      mortBal:   Math.max(0, mortBal),
      mortR,
      mortPmt,
      appreciation: (p.appreciation ?? 3) / 100,
    }
  })

  // Annotate each simulation row with real estate equity
  // Track mortgage balances year-to-year (not recalculating from start each time)
  const reMortBalances = reState.map(rs => rs.mortBal) // running mortgage balances
  rows.forEach((row, i) => {
    const yr = i + 1 // year into retirement
    let reEquity = 0
    reState.forEach((rs, j) => {
      const projVal = rs.propValue * Math.pow(1 + rs.appreciation, yr)
      // Pay down mortgage for this single year (12 months) from prior year's balance
      let bal = reMortBalances[j]
      for (let m = 0; m < 12 && bal > 0.01; m++) {
        bal = Math.max(0, bal - (rs.mortPmt - bal * rs.mortR))
      }
      reMortBalances[j] = bal
      reEquity += projVal - Math.max(0, bal)
    })
    row.realEstateEquity = Math.round(reEquity)
    row.totalWealth      = row.portfolioTotal + Math.round(reEquity)
  })

  // ── Summary ──────────────────────────────────────────────────────────────────
  const lastFunded = [...rows].reverse().find(r => r.portfolioTotal > 0 || r.netIncome > 0)

  // Snapshot final account balances (after last withdrawal) for estate calculation
  const finalAccounts = simAccounts.map(a => ({
    id:        a.id,
    name:      a.name,
    taxType:   a.taxType,
    balance:   Math.max(0, a.balance),
    costBasis: Math.max(0, a.costBasis ?? 0),
  }))

  // Real estate equity at end of life (reMortBalances already paid down through all retirement years)
  const reEquityAtDeath = reState.reduce((sum, rs, j) => {
    const projVal = rs.propValue * Math.pow(1 + rs.appreciation, rows.length)
    return sum + projVal - Math.max(0, reMortBalances[j])
  }, 0)

  const summary = {
    yearsInRetirement:     rows.length,
    portfolioAtRetirement: Math.round(portfolioAtRetirement),
    accountsAtRetirement:  retirementSnapshot,
    finalBalance:          lastFunded ? lastFunded.portfolioTotal : 0,
    totalGrossWithdrawal:  rows.reduce((s, r) => s + r.grossWithdrawal, 0),
    totalTaxPaid:          rows.reduce((s, r) => s + r.totalTax, 0),
    totalNetIncome:        rows.reduce((s, r) => s + r.netIncome, 0),
    avgEffectiveRate:      rows.length > 0 ? rows.reduce((s, r) => s + r.effectiveRate, 0) / rows.length : 0,
    portfolioExhaustedAge: rows.find(r => r.portfolioTotal <= 0)?.age || null,
    rrifExhaustedAge:      rows.find(r => r.rrifTotal      <= 0)?.age || null,
    finalAccounts,
    reEquityAtDeath:       Math.round(reEquityAtDeath),
  }

  const accountMeta = simAccounts.map(a => ({ id: a.id, name: a.name, taxType: a.taxType }))

  return { rows, summary, accountMeta }
}

// ─── Monte Carlo simulation ───────────────────────────────────────────────────

function randn() {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Runs `runs` stochastic retirement-phase iterations using the withdrawals from
// the deterministic simulation. Each year applies a normally-distributed return
// drawn from the portfolio's weighted mean return + weighted std dev.
// Returns { bands: [{age, p10, p50, p90}], probabilityOfSuccess }.
export function runMonteCarlo(inputs, deterministicRows, runs = 1000) {
  if (!deterministicRows?.length) return null
  const startBalance = deterministicRows[0]?.portfolioTotal ?? 0
  if (startBalance <= 0) return null

  // Weighted return + std dev from input accounts (pre-retirement balances as weights)
  const totalInputBal = inputs.accounts.reduce((s, a) => s + (a.balance || 0), 0)
  let wRet = 0, wVariance = 0
  if (totalInputBal > 0) {
    for (const acc of inputs.accounts) {
      const w   = acc.balance / totalInputBal
      const ret = getAccReturnRate(acc) / 100
      const std = getAccStdDev(acc) / 100
      wRet      += w * ret
      wVariance += w * w * std * std
    }
  } else {
    wRet = 0.06; wVariance = 0.12 * 0.12
  }
  const wStd = Math.sqrt(wVariance)

  const withdrawals = deterministicRows.map(r => r.grossWithdrawal ?? 0)
  const ages        = deterministicRows.map(r => r.age)
  const nYears      = deterministicRows.length

  const allRuns = []
  for (let run = 0; run < runs; run++) {
    let balance  = startBalance
    let exhausted = false
    const portfolioByAge = []
    for (let i = 0; i < nYears; i++) {
      const r = wRet + wStd * randn()
      balance = Math.max(0, balance * (1 + r) - withdrawals[i])
      if (balance <= 0 && !exhausted) exhausted = true
      portfolioByAge.push(balance)
    }
    allRuns.push({ portfolioByAge, exhausted })
  }

  const bands = ages.map((age, i) => {
    const values = allRuns.map(r => r.portfolioByAge[i]).sort((a, b) => a - b)
    const n = values.length
    return {
      age,
      p10: values[Math.floor(n * 0.10)] ?? 0,
      p50: values[Math.floor(n * 0.50)] ?? 0,
      p90: values[Math.floor(n * 0.90)] ?? 0,
    }
  })

  const probabilityOfSuccess = allRuns.filter(r => !r.exhausted).length / runs
  return { bands, probabilityOfSuccess }
}

// ─── Pension income splitting optimizer ───────────────────────────────────────
// Canadian election: transfer up to 50% of eligible pension income to spouse
// to minimize combined household tax.
// Eligible at 65+: RRIF/RRSP withdrawals + DB pension + other pension (NOT CPP/OAS)
// Eligible before 65: DB pension + other registered pension income only.
function optimalPensionSplit(pRow, sRow, province) {
  const age = pRow.age ?? 0
  const eligibleIncome = age >= 65
    ? (pRow.rrifWithdrawn ?? 0) + (pRow.dbPension ?? 0) + (pRow.otherPension ?? 0)
    : (pRow.dbPension ?? 0) + (pRow.otherPension ?? 0)

  if (eligibleIncome <= 0) return { splitAmount: 0, taxSaving: 0 }

  const pBase = {
    rrif:           pRow.rrifWithdrawn  ?? 0,
    cpp:            pRow.cpp            ?? 0,
    oas:            pRow.oas            ?? 0,
    capitalGain:    pRow.capitalGain    ?? 0,
    ordinaryNonReg: pRow.ordinaryNonReg ?? 0,
    pension:        (pRow.dbPension ?? 0) + (pRow.otherPension ?? 0),
  }
  const sBase = {
    rrif:           sRow.rrifWithdrawn  ?? 0,
    cpp:            sRow.cpp            ?? 0,
    oas:            sRow.oas            ?? 0,
    capitalGain:    sRow.capitalGain    ?? 0,
    ordinaryNonReg: sRow.ordinaryNonReg ?? 0,
    pension:        (sRow.dbPension ?? 0) + (sRow.otherPension ?? 0),
  }

  const baseTax = calcTax({ ...pBase, province }).total + calcTax({ ...sBase, province }).total
  let bestSplit = 0
  let bestTax   = baseTax

  for (let pct = 1; pct <= 50; pct++) {
    const transfer    = Math.round(eligibleIncome * pct / 100)
    // Remove from primary's income (rrif first, then registered pension)
    const fromRrif    = Math.min(transfer, pBase.rrif)
    const fromPension = Math.min(transfer - fromRrif, pBase.pension)

    const pTax = calcTax({
      ...pBase,
      rrif:    pBase.rrif    - fromRrif,
      pension: pBase.pension - fromPension,
      province,
    }).total
    const sTax = calcTax({
      ...sBase,
      pension: sBase.pension + transfer,
      province,
    }).total

    if (pTax + sTax < bestTax) {
      bestTax   = pTax + sTax
      bestSplit = transfer
    }
  }

  return { splitAmount: bestSplit, taxSaving: Math.max(0, baseTax - bestTax) }
}

// ─── Joint (spousal) simulation ───────────────────────────────────────────────
// Runs primary and spouse simulations independently then merges rows on a shared
// calendar-year timeline. Primary handles all household spending; spouse runs with
// zero spending so assets grow without double-counting drawdowns.
export function runJointSimulation(primaryInputs, spouseInputs, sharedParams = {}) {
  const pResult = runSimulation({ ...primaryInputs, ...sharedParams })
  if (!pResult) return null

  const sResult = runSimulation({
    ...primaryInputs,
    ...spouseInputs,
    ...sharedParams,
    strategyType:   'fixedAmount',
    strategyParams: { baseAmount: 0, annualExpense: 0, inflation: (primaryInputs.inflation ?? 2.5) / 100 },
    rrspDrawdown:   { type: 'none', reinvestSurplus: true },
    scenarioShock:  null,
  })
  if (!sResult) return pResult

  const ageDiff = spouseInputs.currentAge - primaryInputs.currentAge
  const pensionSplittingEnabled = !!(primaryInputs.pensionSplittingEnabled)
  const province = primaryInputs.province ?? 'ON'

  const combinedRows = pResult.rows.map(pRow => {
    const spouseAge   = pRow.age + ageDiff
    const sRow        = sResult.rows.find(r => r.age === spouseAge)
    const spouseAlive = sRow != null && spouseAge <= spouseInputs.lifeExpectancy

    const spousePf   = spouseAlive ? (sRow.portfolioTotal ?? 0) : 0
    const spouseRrif = spouseAlive ? (sRow.rrifTotal      ?? 0) : 0
    const spouseTfsa = spouseAlive ? (sRow.tfsaTotal      ?? 0) : 0
    const spouseNreg = spouseAlive ? (sRow.nonRegTotal    ?? 0) : 0

    // Pension income splitting — only when enabled and spouse is alive
    let pensionSplitAmount = 0
    let pensionSplitTaxSaving = 0
    if (pensionSplittingEnabled && spouseAlive && sRow) {
      const split = optimalPensionSplit(pRow, sRow, province)
      pensionSplitAmount   = split.splitAmount
      pensionSplitTaxSaving = split.taxSaving
    }

    return {
      ...pRow,
      portfolioTotal:  (pRow.portfolioTotal ?? 0) + spousePf,
      rrifTotal:       (pRow.rrifTotal      ?? 0) + spouseRrif,
      tfsaTotal:       (pRow.tfsaTotal      ?? 0) + spouseTfsa,
      nonRegTotal:     (pRow.nonRegTotal    ?? 0) + spouseNreg,
      spousePortfolio: spousePf,
      spouseAge,
      spouseAlive,
      pensionSplitAmount,
      pensionSplitTaxSaving,
    }
  })

  // Append spouse-only rows if spouse outlives primary
  const spouseAgeAtPrimaryDeath = primaryInputs.lifeExpectancy + ageDiff
  const extraRows = sResult.rows.filter(r => r.age > spouseAgeAtPrimaryDeath)
  let phantomAge = primaryInputs.lifeExpectancy + 1
  extraRows.forEach(sRow => {
    combinedRows.push({
      ...sRow,
      age:             phantomAge++,
      rrifWithdrawn:   0,
      tfsaWithdrawn:   0,
      nonRegWithdrawn: 0,
      spousePortfolio: sRow.portfolioTotal,
      spouseAge:       sRow.age,
      spouseAlive:     true,
      primaryAlive:    false,
    })
  })

  const totalPensionSplitSaving = combinedRows.reduce((s, r) => s + (r.pensionSplitTaxSaving ?? 0), 0)

  return {
    ...pResult,
    rows:          combinedRows,
    summary:       {
      ...pResult.summary,
      finalBalance:          combinedRows[combinedRows.length - 1]?.portfolioTotal ?? 0,
      totalPensionSplitSaving: Math.round(totalPensionSplitSaving),
    },
    isJoint:       true,
    spouseResult:  sResult,
    primaryResult: pResult,
  }
}

function makeEmptyRow(age, year, accounts) {
  return {
    age, year,
    accountBalances: Object.fromEntries(accounts.map(a => [a.id, 0])),
    rrifTotal: 0, tfsaTotal: 0, nonRegTotal: 0, portfolioTotal: 0,
    grossWithdrawal: 0, rrifWithdrawn: 0, tfsaWithdrawn: 0, nonRegWithdrawn: 0,
    rrif_min: 0, rrifTarget: 0, cpp: 0, oas: 0, oasClawback: 0, dbPension: 0, otherPension: 0,
    pension: 0, cashOutflow: 0, cashInflow: 0, inflowForSpending: 0, inflowSurplus: 0,
    inflowSurplusTfsa: 0, inflowSurplusNonReg: 0, inflowInvestedTo: null, tfsaAnnualLimit: 7000,
    incomeSurplusTfsa: 0, incomeSurplusNonReg: 0, nonRegToTfsaGross: 0, nonRegToTfsaNet: 0,
    capitalGain: 0, grossIncome: 0, federalTax: 0, provincialTax: 0,
    totalTax: 0, netIncome: 0, effectiveRate: 0, withdrawalRate: 0,
  }
}
