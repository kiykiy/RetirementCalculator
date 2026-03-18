// ─── Drawdown Strategy Implementations ───────────────────────────────────────
// Each strategy returns a `getWithdrawal(context)` function.
// context = { age, year, retirementYear, portfolioTotal, lastWithdrawal,
//             inflation, initialPortfolio, initialWithdrawal, params }

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
// The solve runs once on first call; subsequent calls return the solved amount.
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
  } = simOptions

  let solvedBase = null  // real (today's dollars) annual withdrawal

  function simulate(baseWithdrawal) {
    let balance = initialPortfolio
    for (let age = retirementAge; age < targetAge; age++) {
      balance *= (1 + annualReturn)
      const yearsIn = age - retirementAge
      const w = baseWithdrawal * Math.pow(1 + inflation, yearsIn)
      balance -= w
      if (balance < 0) return -1
    }
    return balance
  }

  // Binary search
  function solve() {
    let lo = 0
    let hi = initialPortfolio * 0.30   // max 30% per year
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
