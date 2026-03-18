// ─── Main Retirement Simulation Loop ─────────────────────────────────────────
import { calcTax, rrif_minimum } from './tax.js'
import { createStrategy } from './strategies.js'

// ─── CPP / OAS / DB helpers ───────────────────────────────────────────────────

const YMPE_2025     = 68500
const CPP_MAX_2025  = 17460
const OAS_FULL_2025 = 8713

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

export function buildAccumulationRows({ accounts, currentAge, retirementAge, workingMarginalRate = 40, nonRegOrdinaryPct = 0 }) {
  const ordinaryFrac = nonRegOrdinaryPct / 100
  const margRate     = workingMarginalRate / 100
  const balances     = accounts.map(a => a.balance)
  const rows         = []

  for (let age = currentAge; age <= retirementAge; age++) {
    const year       = new Date().getFullYear() + (age - currentAge)
    const isLastYear = age === retirementAge

    const accountBalances = Object.fromEntries(
      accounts.map((acc, i) => [acc.id, Math.round(balances[i])])
    )
    const totalBalance = balances.reduce((s, b) => s + b, 0)

    let grossReturn   = 0
    let nonRegTaxDrag = 0

    accounts.forEach((acc, i) => {
      const returnAmt = balances[i] * (acc.returnRate / 100)
      grossReturn += returnAmt
      if (acc.taxType === 'nonreg' && returnAmt > 0) {
        nonRegTaxDrag += returnAmt * ordinaryFrac * margRate
      }
    })

    const contribution = isLastYear ? 0 : accounts.reduce((s, a) => s + a.annualContribution, 0)

    rows.push({
      age, year,
      accountBalances,
      totalBalance:  Math.round(totalBalance),
      contribution:  Math.round(contribution),
      grossReturn:   Math.round(grossReturn),
      nonRegTaxDrag: Math.round(nonRegTaxDrag),
      netGrowth:     Math.round(grossReturn - nonRegTaxDrag + contribution),
    })

    if (!isLastYear) {
      accounts.forEach((acc, i) => {
        const returnAmt      = balances[i] * (acc.returnRate / 100)
        const afterTaxReturn = acc.taxType === 'nonreg'
          ? returnAmt * (1 - ordinaryFrac * margRate)
          : returnAmt
        balances[i] += afterTaxReturn + acc.annualContribution
      })
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
    cppAvgEarnings, cppYearsContributed, cppStartAge,
    oasYearsResident, oasStartAge,
    dbEnabled, dbBestAvgSalary, dbYearsService, dbAccrualRate, dbStartAge, dbIndexingRate,
    otherPension,
    province,
    strategyType,
    strategyParams,
    cashOutflows = {},
    workingMarginalRate = 40,
    nonRegOrdinaryPct   = 0,
    rrspDrawdown = { type: 'none' },
  } = inputs

  const ordinaryFrac = nonRegOrdinaryPct / 100
  const cgFrac       = 1 - ordinaryFrac
  const margRate     = workingMarginalRate / 100

  // ── Project each account to retirement ───────────────────────────────────────
  const yearsToRet = Math.max(0, retirementAge - currentAge)

  const simAccounts = accounts.map(acc => {
    const r = acc.returnRate / 100
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
      returnRate: acc.returnRate,
      balance:    bal,
      costBasis:  acc.taxType === 'nonreg' ? bal * 0.6 : 0,
    }
  })

  const portfolioAtRetirement = simAccounts.reduce((s, a) => s + a.balance, 0)
  const retirementSnapshot    = simAccounts.map(a => ({ id: a.id, name: a.name, balance: Math.round(a.balance) }))

  const weightedReturn = portfolioAtRetirement > 0
    ? simAccounts.reduce((s, a) => s + a.returnRate * a.balance, 0) / portfolioAtRetirement / 100
    : 0.05

  // ── Strategy ─────────────────────────────────────────────────────────────────
  const strategy = createStrategy(
    strategyType,
    { ...strategyParams, inflation: inflation / 100 },
    { retirementAge, portfolioTotal: portfolioAtRetirement, annualReturn: weightedReturn }
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
  const retirementYear = new Date().getFullYear() + (retirementAge - currentAge)

  for (let age = retirementAge; age <= lifeExpectancy; age++) {
    const year = new Date().getFullYear() + (age - currentAge)

    const portfolioBefore = simAccounts.reduce((s, a) => s + a.balance, 0)
    if (portfolioBefore <= 0) {
      rows.push(makeEmptyRow(age, year, simAccounts))
      continue
    }

    simAccounts.forEach(acc => { acc.balance *= (1 + acc.returnRate / 100) })

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
      ? calcDB({ bestAvgSalary: dbBestAvgSalary, yearsService: dbYearsService, accrualRate: dbAccrualRate, startAge: dbStartAge, indexingRate: dbIndexingRate }, age) : 0
    const annualPension = annualDb + otherPension
    const govIncome     = annualCpp + annualOas + annualPension

    // ── RRSP/RRIF drawdown target ──────────────────────────────────────────────
    const weightedRrifReturn = rrifTotal > 0
      ? rrifAccs.reduce((s, a) => s + a.returnRate * a.balance, 0) / rrifTotal / 100
      : weightedReturn
    let rrifDrawdownTarget = rrif_min
    if (rrspDrawdown.type === 'fixedAmount') {
      rrifDrawdownTarget = Math.max(rrif_min, rrspDrawdown.fixedAmount || 0)
    } else if (rrspDrawdown.type === 'targetAge') {
      const n = (rrspDrawdown.targetAge || retirementAge) - age
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

    const strategyTarget = strategy({ age, year, retirementYear, portfolioTotal: portfolioAfterGrowth, inflation: inf })

    const cashOutflow    = cashOutflows[age] || 0
    const portfolioTarget = Math.max(rrifDrawdownTarget, strategyTarget - govIncome + cashOutflow)

    let withdrawn = 0, rrifWithdrawn = 0, tfsaWithdrawn = 0, nonRegWithdrawn = 0, capitalGainRealized = 0

    const { actual: rrifMinAmt }               = withdrawFrom(rrifAccs,   rrifDrawdownTarget)
    rrifWithdrawn += rrifMinAmt; withdrawn += rrifMinAmt

    const { actual: tfsaAmt }                  = withdrawFrom(tfsaAccs,   Math.max(0, portfolioTarget - withdrawn))
    tfsaWithdrawn += tfsaAmt; withdrawn += tfsaAmt

    const { actual: nonRegAmt, capitalGain: cg } = withdrawFrom(nonRegAccs, Math.max(0, portfolioTarget - withdrawn))
    nonRegWithdrawn += nonRegAmt; capitalGainRealized += cg; withdrawn += nonRegAmt

    const { actual: rrifExtra }                = withdrawFrom(rrifAccs,   Math.max(0, portfolioTarget - withdrawn))
    rrifWithdrawn += rrifExtra; withdrawn += rrifExtra

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
                         + capitalGainForTax * 0.5 + ordinaryNonReg
    const netIncome      = Math.max(0, withdrawn + govIncome - taxResult.total)
    const withdrawalRate = portfolioAfterGrowth > 0 ? withdrawn / portfolioAfterGrowth * 100 : 0

    // ── RRIF surplus reinvestment into non-reg ────────────────────────────────
    // When RRSP drawdown forces more RRIF withdrawal than needed for spending,
    // the after-tax excess is reinvested into non-registered accounts.
    const spendingPortfolioNeed = Math.max(0, strategyTarget - govIncome + cashOutflow)
    const rrifExcessGross = Math.max(0, rrifWithdrawn - spendingPortfolioNeed)
    let rrifSurplusReinvested = 0
    if (rrifExcessGross > 0 && nonRegAccs.length > 0 && (rrspDrawdown.reinvestSurplus ?? true)) {
      rrifSurplusReinvested = Math.round(rrifExcessGross * (1 - taxResult.effectiveRate))
      const totalNonRegBal = nonRegAccs.reduce((s, a) => s + a.balance, 0)
      nonRegAccs.forEach(acc => {
        const share = totalNonRegBal > 0 ? acc.balance / totalNonRegBal : 1 / nonRegAccs.length
        const added = rrifSurplusReinvested * share
        acc.balance  += added
        acc.costBasis += added  // full cost basis — after-tax cash reinvested
      })
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
      rrifSurplusReinvested: rrifSurplusReinvested,
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

  // ── Summary ──────────────────────────────────────────────────────────────────
  const lastFunded = [...rows].reverse().find(r => r.portfolioTotal > 0 || r.netIncome > 0)

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
  }

  const accountMeta = simAccounts.map(a => ({ id: a.id, name: a.name, taxType: a.taxType }))

  return { rows, summary, accountMeta }
}

function makeEmptyRow(age, year, accounts) {
  return {
    age, year,
    accountBalances: Object.fromEntries(accounts.map(a => [a.id, 0])),
    rrifTotal: 0, tfsaTotal: 0, nonRegTotal: 0, portfolioTotal: 0,
    grossWithdrawal: 0, rrifWithdrawn: 0, tfsaWithdrawn: 0, nonRegWithdrawn: 0,
    rrif_min: 0, rrifTarget: 0, cpp: 0, oas: 0, oasClawback: 0, dbPension: 0, otherPension: 0,
    pension: 0, cashOutflow: 0, rrifSurplusReinvested: 0, capitalGain: 0, grossIncome: 0, federalTax: 0, provincialTax: 0,
    totalTax: 0, netIncome: 0, effectiveRate: 0, withdrawalRate: 0,
  }
}
