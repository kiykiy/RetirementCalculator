// ─── Drawdown Strategy Implementations ───────────────────────────────────────
// Each strategy returns a `getWithdrawal(context)` function.
// context = { age, year, retirementYear, portfolioTotal, lastWithdrawal,
//             inflation, initialPortfolio, initialWithdrawal, params }

// ── RRIF minimum factors (mirrors tax.js) ───────────────────────────────────
const RRIF_FACTORS = {
  71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582,
  76: 0.0598, 77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682,
  81: 0.0708, 82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851,
  86: 0.0899, 87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192,
  91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879, 95: 0.2000,
}
function rrifMinimum(age, bal) {
  if (age < 72 || bal <= 0) return 0
  return bal * (RRIF_FACTORS[Math.min(age, 95)] || 0.2)
}

// ── 1. Fixed Percentage ───────────────────────────────────────────────────────
export function fixedPercentageStrategy(params) {
  const { rate = 0.04 } = params
  return function ({ portfolioTotal }) {
    return portfolioTotal * rate
  }
}

// ── 2. Fixed Dollar (Inflation-Adjusted) ─────────────────────────────────────
export function fixedDollarStrategy(params) {
  const { baseAmount = 60000 } = params
  return function ({ year, retirementYear, inflation }) {
    const yearsIn = year - retirementYear
    return baseAmount * Math.pow(1 + inflation, yearsIn)
  }
}

// ── 3. Dynamic Guardrails (Guyton-Klinger) ────────────────────────────────────
// Adjusts withdrawal by ±10% when withdrawal rate breaches guardrail bands.
export function guardrailsStrategy(params) {
  const {
    initialRate = 0.05,       // starting withdrawal rate
    upperGuardrail = 0.06,    // if rate exceeds this → cut 10%
    lowerGuardrail = 0.04,    // if rate falls below this → raise 10%
    adjustmentFactor = 0.10,  // amount to adjust by
    floorMultiplier = 0.80,   // floor as fraction of initial withdrawal
    ceilingMultiplier = 1.20, // ceiling as fraction of initial withdrawal
  } = params

  let currentWithdrawal = null
  let initialWithdrawal = null

  return function ({ portfolioTotal, year, retirementYear, inflation }) {
    if (currentWithdrawal === null || year === retirementYear) {
      // First year — set initial withdrawal
      currentWithdrawal = portfolioTotal * initialRate
      initialWithdrawal = currentWithdrawal
      return currentWithdrawal
    }

    // Inflation-adjust the floor & ceiling each year
    const yearsIn = year - retirementYear
    const inflFactor = Math.pow(1 + inflation, yearsIn)
    const floor   = initialWithdrawal * floorMultiplier  * inflFactor
    const ceiling = initialWithdrawal * ceilingMultiplier * inflFactor

    const currentRate = portfolioTotal > 0 ? currentWithdrawal / portfolioTotal : 0

    if (currentRate > upperGuardrail) {
      currentWithdrawal = Math.max(floor, currentWithdrawal * (1 - adjustmentFactor))
    } else if (currentRate < lowerGuardrail) {
      currentWithdrawal = Math.min(ceiling, currentWithdrawal * (1 + adjustmentFactor))
    }

    return currentWithdrawal
  }
}

// ── 4. Bucket Strategy ────────────────────────────────────────────────────────
// Three buckets: cash, bonds, equities.
// Returns withdrawal amount; bucket balances are tracked externally via state.
export function bucketStrategy(params) {
  const {
    cashYears   = 2,
    bondYears   = 5,
    annualExpense = 60000,
    bondReturn  = 0.04,
    equityReturn = 0.07,
    inflation   = 0.025,
  } = params

  // State lives inside closure
  let buckets = null

  return function (context) {
    const { year, retirementYear, portfolioTotal } = context

    // Initialise buckets on first call
    if (buckets === null || year === retirementYear) {
      const yearsIn = year - retirementYear
      const expense = annualExpense * Math.pow(1 + inflation, yearsIn)
      const cash  = expense * cashYears
      const bonds = expense * bondYears
      const equity = Math.max(0, portfolioTotal - cash - bonds)
      buckets = { cash, bonds, equity }
    }

    const yearsIn = year - retirementYear
    const expense = annualExpense * Math.pow(1 + inflation, yearsIn)

    // Grow bonds & equity
    buckets.bonds  *= (1 + bondReturn)
    buckets.equity *= (1 + equityReturn)

    // Draw from cash first
    let remaining = expense
    const fromCash = Math.min(buckets.cash, remaining)
    buckets.cash -= fromCash
    remaining -= fromCash

    // Refill cash from bonds if low
    const cashTarget = expense * cashYears
    if (buckets.cash < cashTarget) {
      const needed = cashTarget - buckets.cash
      const fromBonds = Math.min(buckets.bonds, needed)
      buckets.bonds -= fromBonds
      buckets.cash  += fromBonds
    }

    // Refill bonds from equity if low
    const bondsTarget = expense * bondYears
    if (buckets.bonds < bondsTarget) {
      const needed = bondsTarget - buckets.bonds
      const fromEquity = Math.min(buckets.equity, needed)
      buckets.equity -= fromEquity
      buckets.bonds  += fromEquity
    }

    // If cash still short, draw from bonds then equity
    if (remaining > 0) {
      const fromBonds = Math.min(buckets.bonds, remaining)
      buckets.bonds -= fromBonds
      remaining -= fromBonds
    }
    if (remaining > 0) {
      const fromEquity = Math.min(buckets.equity, remaining)
      buckets.equity -= fromEquity
    }

    return expense
  }
}

// ── 5. Targeted Ending Balance ────────────────────────────────────────────────
// Binary-searches for the constant real withdrawal that leaves `targetBalance`
// at `targetAge`, then returns that amount inflation-adjusted each year.
//
// The solver mirrors the real simulation's 4-phase withdrawal logic:
//   Phase 1: RRIF drawdown (minimums or accelerated drawdown)
//   Phase 2: Remaining spending shortfall from other accounts
//   Phase 3: RRIF surplus reinvested after tax (TFSA → non-reg)
//   Phase 4: Non-Reg → TFSA annual transfer tax leakage
// This ensures the solved withdrawal closely matches actual portfolio outcomes.
export function targetedEndingBalanceStrategy(params, simOptions) {
  const {
    targetAge     = 90,
    targetBalance = 0,
    inflation     = 0.025,
  } = params

  const {
    retirementAge,
    portfolioTotal: initialPortfolio,
    annualReturn,
    govIncomeByAge = {},
    // Account-level detail for accurate RRIF/tax modelling
    rrifBalance:    initRrif    = 0,
    tfsaBalance:    initTfsa    = 0,
    nonRegBalance:  initNonReg  = 0,
    rrifReturnRate              = 0,   // decimal, e.g. 0.05
    rrspDrawdown                = { type: 'none' },
    estimatedTaxRate            = 0.25, // approximate marginal rate on RRIF draws
    tfsaAnnualLimit             = 7000,
    nonRegCostBasisFrac         = 0.6,  // ACB / balance ratio for non-reg
  } = simOptions

  let solvedBase = null

  function simulate(baseWithdrawal) {
    // Track three pools separately to model RRIF minimums + surplus tax leakage
    let rrif   = initRrif
    let tfsa   = initTfsa
    let nonReg = initNonReg
    const rrifR   = rrifReturnRate || annualReturn
    const otherR  = annualReturn

    for (let age = retirementAge; age <= targetAge; age++) {
      // ── Growth ──
      rrif   *= (1 + rrifR)
      tfsa   *= (1 + otherR)
      nonReg *= (1 + otherR)

      const portfolio = rrif + tfsa + nonReg
      const yearsIn   = age - retirementAge
      const totalSpend = baseWithdrawal * Math.pow(1 + inflation, yearsIn)
      const govInc     = govIncomeByAge[age] ?? 0
      const spendFromPortfolio = Math.max(0, totalSpend - govInc)

      // ── Phase 1: RRIF drawdown ──
      const rrifMin = rrifMinimum(age, rrif)
      let rrifDraw  = rrifMin
      if (rrspDrawdown.type === 'targetAge') {
        const n = (rrspDrawdown.targetAge || retirementAge) - age + 1
        if (n > 0 && rrif > 0) {
          const pmt = rrifR > 0
            ? rrif * rrifR / (1 - Math.pow(1 + rrifR, -n))
            : rrif / n
          rrifDraw = Math.max(rrifMin, pmt)
        }
      } else if (rrspDrawdown.type === 'fixedAmount') {
        rrifDraw = Math.max(rrifMin, rrspDrawdown.fixedAmount || 0)
      } else if (rrspDrawdown.type === 'targetBracket') {
        const bracketTarget = Math.max(0, (rrspDrawdown.targetAnnualIncome || 0) - govInc)
        rrifDraw = Math.max(rrifMin, bracketTarget)
      }
      rrifDraw = Math.min(rrifDraw, rrif) // can't draw more than balance
      rrif -= rrifDraw

      // ── Phase 2: Spending shortfall from non-reg then TFSA ──
      const shortfall = Math.max(0, spendFromPortfolio - rrifDraw)
      const fromNonReg = Math.min(nonReg, shortfall)
      nonReg -= fromNonReg
      const fromTfsa = Math.min(tfsa, Math.max(0, shortfall - fromNonReg))
      tfsa -= fromTfsa
      // If still short, draw extra from RRIF
      const fromRrifExtra = Math.min(rrif, Math.max(0, shortfall - fromNonReg - fromTfsa))
      rrif -= fromRrifExtra

      // ── Phase 3: RRIF surplus reinvestment (after tax) ──
      const totalRrifDraw  = rrifDraw + fromRrifExtra
      const rrifSurplus    = Math.max(0, govInc + totalRrifDraw - totalSpend)
      if (rrifSurplus > 0) {
        const afterTax = rrifSurplus * (1 - estimatedTaxRate)
        // Deposit surplus to TFSA first (up to limit), rest to non-reg
        const toTfsa   = Math.min(afterTax, tfsaAnnualLimit)
        const toNonReg = afterTax - toTfsa
        tfsa   += toTfsa
        nonReg += toNonReg
      }

      // ── Phase 4: Non-Reg → TFSA transfer tax leakage ──
      // Each year, transferring up to TFSA limit from non-reg triggers
      // capital gains tax, resulting in a small portfolio loss.
      const tfsaRoom = Math.max(0, tfsaAnnualLimit - (rrifSurplus > 0 ? Math.min(rrifSurplus * (1 - estimatedTaxRate), tfsaAnnualLimit) : 0))
      if (tfsaRoom > 0 && nonReg > 0) {
        const xfer     = Math.min(nonReg, tfsaRoom)
        const gainFrac = Math.max(0, 1 - nonRegCostBasisFrac)
        const taxOnXfer = xfer * gainFrac * 0.5 * estimatedTaxRate // 50% inclusion rate
        const netXfer   = Math.max(0, xfer - taxOnXfer)
        nonReg -= xfer
        tfsa   += netXfer
        // Tax leakage = taxOnXfer (portfolio shrinks by this amount)
      }

      const total = rrif + tfsa + nonReg
      if (total < -1) return -1
    }
    return rrif + tfsa + nonReg
  }

  function solve() {
    let lo = 0
    let hi = initialPortfolio * 0.50
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      const end = simulate(mid)
      if (end > targetBalance) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }

  return function ({ year, retirementYear, inflation: inf }) {
    if (solvedBase === null || year === retirementYear) {
      solvedBase = solve()
    }
    const yearsIn = year - retirementYear
    return solvedBase * Math.pow(1 + inf, yearsIn)
  }
}

// ─── Strategy factory ─────────────────────────────────────────────────────────
export function createStrategy(type, params, simOptions) {
  switch (type) {
    case 'fixedPct':     return fixedPercentageStrategy(params)
    case 'fixedDollar':  return fixedDollarStrategy(params)
    case 'guardrails':   return guardrailsStrategy(params)
    case 'bucket':       return bucketStrategy(params)
    case 'targeted':     return targetedEndingBalanceStrategy(params, simOptions)
    default:             return fixedPercentageStrategy({ rate: 0.04 })
  }
}
