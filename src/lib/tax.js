// ─── Canadian Tax Engine (2025 rates) ────────────────────────────────────────

// Federal brackets 2025
const FEDERAL_BRACKETS = [
  { min: 0,       max: 57375,   rate: 0.15   },
  { min: 57375,   max: 114750,  rate: 0.205  },
  { min: 114750,  max: 158519,  rate: 0.26   },
  { min: 158519,  max: 220000,  rate: 0.29   },
  { min: 220000,  max: Infinity,rate: 0.33   },
]

const FEDERAL_BPA = 15705   // Basic Personal Amount 2025
const FEDERAL_BPA_CREDIT = FEDERAL_BPA * 0.15

// Provincial brackets & basic personal amounts 2025
// Format: { brackets: [{min,max,rate}], bpa, surtax? }
const PROVINCIAL_TAX = {
  AB: {
    bpa: 21003,
    brackets: [
      { min: 0,       max: 148269, rate: 0.10  },
      { min: 148269,  max: 177922, rate: 0.12  },
      { min: 177922,  max: 237230, rate: 0.13  },
      { min: 237230,  max: 355845, rate: 0.14  },
      { min: 355845,  max: Infinity, rate: 0.15 },
    ],
  },
  BC: {
    bpa: 11981,
    brackets: [
      { min: 0,       max: 45654,  rate: 0.0506 },
      { min: 45654,   max: 91310,  rate: 0.077  },
      { min: 91310,   max: 104835, rate: 0.105  },
      { min: 104835,  max: 127299, rate: 0.1229 },
      { min: 127299,  max: 172602, rate: 0.147  },
      { min: 172602,  max: 240716, rate: 0.168  },
      { min: 240716,  max: Infinity, rate: 0.205 },
    ],
  },
  ON: {
    bpa: 11865,
    brackets: [
      { min: 0,       max: 51446,  rate: 0.0505 },
      { min: 51446,   max: 102894, rate: 0.0915 },
      { min: 102894,  max: 150000, rate: 0.1116 },
      { min: 150000,  max: 220000, rate: 0.1216 },
      { min: 220000,  max: Infinity, rate: 0.1316 },
    ],
    // Ontario surtax: 20% on provincial tax > $5,315; +36% on prov tax > $6,802
    surtax: { t1: 5315, r1: 0.20, t2: 6802, r2: 0.36 },
  },
  QC: {
    bpa: 17183,
    brackets: [
      { min: 0,       max: 51780,  rate: 0.14  },
      { min: 51780,   max: 103545, rate: 0.19  },
      { min: 103545,  max: 126000, rate: 0.24  },
      { min: 126000,  max: Infinity, rate: 0.2575 },
    ],
  },
  SK: {
    bpa: 17661,
    brackets: [
      { min: 0,       max: 49720,  rate: 0.105 },
      { min: 49720,   max: 142058, rate: 0.125 },
      { min: 142058,  max: Infinity, rate: 0.145 },
    ],
  },
  MB: {
    bpa: 15780,
    brackets: [
      { min: 0,       max: 47000,  rate: 0.108 },
      { min: 47000,   max: 100000, rate: 0.1275 },
      { min: 100000,  max: Infinity, rate: 0.174 },
    ],
  },
  NS: {
    bpa: 8481,
    brackets: [
      { min: 0,       max: 29590,  rate: 0.0879 },
      { min: 29590,   max: 59180,  rate: 0.1495 },
      { min: 59180,   max: 93000,  rate: 0.1667 },
      { min: 93000,   max: 150000, rate: 0.175  },
      { min: 150000,  max: Infinity, rate: 0.21  },
    ],
  },
  NB: {
    bpa: 12458,
    brackets: [
      { min: 0,       max: 47715,  rate: 0.094  },
      { min: 47715,   max: 95431,  rate: 0.14   },
      { min: 95431,   max: 176756, rate: 0.16   },
      { min: 176756,  max: Infinity, rate: 0.195 },
    ],
  },
  PEI: {
    bpa: 12000,
    brackets: [
      { min: 0,       max: 32656,  rate: 0.096  },
      { min: 32656,   max: 64313,  rate: 0.1337 },
      { min: 64313,   max: 105000, rate: 0.167  },
      { min: 105000,  max: 140000, rate: 0.18   },
      { min: 140000,  max: Infinity, rate: 0.187 },
    ],
  },
  NL: {
    bpa: 10818,
    brackets: [
      { min: 0,       max: 43198,  rate: 0.087  },
      { min: 43198,   max: 86395,  rate: 0.145  },
      { min: 86395,   max: 154244, rate: 0.158  },
      { min: 154244,  max: 215943, rate: 0.178  },
      { min: 215943,  max: 275870, rate: 0.198  },
      { min: 275870,  max: 551739, rate: 0.208  },
      { min: 551739,  max: Infinity, rate: 0.213 },
    ],
  },
  YT: {
    bpa: 15705,
    brackets: [
      { min: 0,       max: 57375,  rate: 0.064  },
      { min: 57375,   max: 114750, rate: 0.09   },
      { min: 114750,  max: 500000, rate: 0.109  },
      { min: 500000,  max: Infinity, rate: 0.128 },
    ],
  },
  NT: {
    bpa: 16593,
    brackets: [
      { min: 0,       max: 50597,  rate: 0.059  },
      { min: 50597,   max: 101198, rate: 0.086  },
      { min: 101198,  max: 164525, rate: 0.122  },
      { min: 164525,  max: Infinity, rate: 0.1405 },
    ],
  },
  NU: {
    bpa: 17925,
    brackets: [
      { min: 0,       max: 53268,  rate: 0.04   },
      { min: 53268,   max: 106537, rate: 0.07   },
      { min: 106537,  max: 173205, rate: 0.09   },
      { min: 173205,  max: Infinity, rate: 0.115 },
    ],
  },
}

export const PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland & Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PEI', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
]

// OAS clawback 2025: 15% on net income above $90,997
const OAS_CLAWBACK_THRESHOLD = 90997
const OAS_CLAWBACK_RATE = 0.15

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcBracketTax(taxableIncome, brackets) {
  let tax = 0
  for (const b of brackets) {
    if (taxableIncome <= b.min) break
    const slice = Math.min(taxableIncome, b.max) - b.min
    tax += slice * b.rate
  }
  return Math.max(0, tax)
}

function getMarginalRate(taxableIncome, brackets) {
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableIncome > brackets[i].min) return brackets[i].rate
  }
  return brackets[0].rate
}

// ─── Main tax calculator ──────────────────────────────────────────────────────

/**
 * Calculate Canadian income tax.
 * @param {object} params
 * @param {number} params.rrif        RRIF / RRSP withdrawals (fully taxable)
 * @param {number} params.cpp         CPP income
 * @param {number} params.oas         OAS income (before clawback)
 * @param {number} params.capitalGain Realized capital gains (50% inclusion)
 * @param {number} params.pension     Other pension income
 * @param {string} params.province    Province code e.g. "ON"
 * @returns {{ federal, provincial, oasClawback, total, effectiveRate, marginalRate, netOas }}
 */
export function calcTax({ rrif = 0, cpp = 0, oas = 0, capitalGain = 0, ordinaryNonReg = 0, pension = 0, province = 'ON' }) {
  const cgInclusion = capitalGain * 0.5

  // Net income (before OAS clawback)
  // ordinaryNonReg: non-reg gains taxed as regular income (100% inclusion)
  const netIncome = rrif + cpp + oas + cgInclusion + pension + ordinaryNonReg

  // OAS clawback
  const oasClawback = Math.min(oas, Math.max(0, (netIncome - OAS_CLAWBACK_THRESHOLD) * OAS_CLAWBACK_RATE))
  const netOas = oas - oasClawback

  // Taxable income (clawback reduces OAS deduction)
  const taxableIncome = Math.max(0, netIncome - oasClawback)

  // Federal tax
  const fedGross = calcBracketTax(taxableIncome, FEDERAL_BRACKETS)
  const fedBpaCr = Math.min(FEDERAL_BPA_CREDIT, fedGross)
  const federal = Math.max(0, fedGross - fedBpaCr)

  // Provincial tax
  const prov = PROVINCIAL_TAX[province] || PROVINCIAL_TAX['ON']
  let provGross = calcBracketTax(taxableIncome, prov.brackets)
  const provBpaCr = prov.bpa * prov.brackets[0].rate
  provGross = Math.max(0, provGross - provBpaCr)

  // Ontario surtax
  let surtax = 0
  if (prov.surtax) {
    const s = prov.surtax
    if (provGross > s.t2) surtax = (provGross - s.t2) * s.r2 + (s.t2 - s.t1) * s.r1
    else if (provGross > s.t1) surtax = (provGross - s.t1) * s.r1
  }
  const provincial = provGross + surtax

  const total = federal + provincial + oasClawback
  const effectiveRate = netIncome > 0 ? total / netIncome : 0
  const marginalRate = getMarginalRate(taxableIncome, FEDERAL_BRACKETS) +
                       getMarginalRate(taxableIncome, prov.brackets)

  return {
    federal: Math.round(federal),
    provincial: Math.round(provincial),
    oasClawback: Math.round(oasClawback),
    total: Math.round(total),
    effectiveRate,
    marginalRate: Math.min(marginalRate, 0.55),
    netOas: Math.round(netOas),
    taxableIncome: Math.round(taxableIncome),
  }
}

// ─── RRIF Minimum Withdrawal Factors ─────────────────────────────────────────
// CRA prescribed factors

const RRIF_FACTORS = {
  71: 0.0528, 72: 0.0540, 73: 0.0553, 74: 0.0567, 75: 0.0582,
  76: 0.0598, 77: 0.0617, 78: 0.0636, 79: 0.0658, 80: 0.0682,
  81: 0.0708, 82: 0.0738, 83: 0.0771, 84: 0.0808, 85: 0.0851,
  86: 0.0899, 87: 0.0955, 88: 0.1021, 89: 0.1099, 90: 0.1192,
  91: 0.1306, 92: 0.1449, 93: 0.1634, 94: 0.1879, 95: 0.2000,
}

/**
 * Returns the mandatory RRIF minimum withdrawal for a given age and RRIF balance.
 * Mandatory starting age is 72 in Canada (converted from RRSP by end of age 71).
 */
export function rrif_minimum(age, rrifBalance) {
  if (age < 72) return 0
  const factor = RRIF_FACTORS[Math.min(age, 95)] || 0.2
  return rrifBalance * factor
}
