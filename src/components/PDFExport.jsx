import { useState } from 'react'
import jsPDF from 'jspdf'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function pct(n) { return `${(n * 100).toFixed(1)}%` }

function getScore(summary, inputs) {
  if (!summary) return null
  let score = 100
  const exhausted = !!summary.portfolioExhaustedAge
  const lifeExp   = inputs.lifeExpectancy ?? 90
  const retAge    = inputs.retirementAge  ?? 65
  const retYears  = lifeExp - retAge

  // -40 if portfolio runs out
  if (exhausted) {
    const yearsShort = lifeExp - summary.portfolioExhaustedAge
    score -= Math.min(40, yearsShort * 2.5)
  }

  // -10 if final balance < 1 year of withdrawals
  const annualWithdrawal = summary.totalGrossWithdrawal / Math.max(1, retYears)
  if ((summary.finalBalance ?? 0) < annualWithdrawal) score -= 10

  // -10 if avg tax rate > 30%
  if ((summary.avgEffectiveRate ?? 0) > 0.30) score -= 10

  // -5 if no TFSA
  const tfsaBalance = summary.finalAccounts?.find(a => a.taxType === 'tfsa')?.balance ?? 0
  if (tfsaBalance === 0) score -= 5

  return Math.max(0, Math.round(score))
}

function getScoreLabel(score) {
  if (score >= 90) return { label: 'Excellent', color: [16, 185, 129] }
  if (score >= 75) return { label: 'On Track',  color: [59, 130, 246] }
  if (score >= 55) return { label: 'Fair',       color: [245, 158, 11] }
  return                  { label: 'Needs Work', color: [239, 68,  68] }
}

function getRecommendations(summary, inputs, result) {
  const recs = []
  if (!summary) return recs

  const lifeExp  = inputs.lifeExpectancy  ?? 90
  const retAge   = inputs.retirementAge   ?? 65
  const retYears = lifeExp - retAge

  if (summary.portfolioExhaustedAge) {
    const gap = lifeExp - summary.portfolioExhaustedAge
    recs.push({
      icon: '⚠',
      title: 'Portfolio Shortfall Detected',
      body: `Your portfolio is projected to run out at age ${summary.portfolioExhaustedAge} — ${gap} years before your life expectancy. Consider increasing contributions, delaying retirement by 1–2 years, or reducing planned withdrawals.`,
    })
  }

  if ((inputs.cppStartAge ?? 65) < 70) {
    recs.push({
      icon: '📅',
      title: 'Consider Delaying CPP to Age 70',
      body: `Delaying CPP from ${inputs.cppStartAge ?? 65} to 70 increases your benefit by ${((70 - (inputs.cppStartAge ?? 65)) * 8.4).toFixed(0)}%. If you have other income to bridge the gap, this is one of the highest-return, risk-free decisions available.`,
    })
  }

  const rrifBal = summary.finalAccounts?.find(a => a.taxType === 'rrif')?.balance ?? 0
  const tfsaBal = summary.finalAccounts?.find(a => a.taxType === 'tfsa')?.balance ?? 0
  if (rrifBal > 500_000 && tfsaBal < rrifBal * 0.2) {
    recs.push({
      icon: '💡',
      title: 'Consider RRSP Meltdown Strategy',
      body: `You have ${fmt(rrifBal)} in RRIF/RRSP at end of life. Early systematic withdrawals into lower tax brackets — combined with reinvestment in TFSA — could significantly reduce your estate's tax burden.`,
    })
  }

  if ((summary.avgEffectiveRate ?? 0) > 0.28) {
    recs.push({
      icon: '🏦',
      title: 'Tax Efficiency Opportunity',
      body: `Your average tax rate in retirement is ${pct(summary.avgEffectiveRate ?? 0)}. Optimizing your withdrawal sequence (non-reg → TFSA → RRIF) or income splitting with a spouse could meaningfully reduce lifetime taxes paid.`,
    })
  }

  if ((summary.reEquityAtDeath ?? 0) > 200_000) {
    recs.push({
      icon: '🏠',
      title: 'Real Estate Equity Available',
      body: `You have ${fmt(summary.reEquityAtDeath)} in projected real estate equity at end of life. A HELOC or reverse mortgage could provide a tax-efficient income supplement if needed, preserving your investment portfolio longer.`,
    })
  }

  if (recs.length === 0) {
    recs.push({
      icon: '✅',
      title: 'Your Plan Looks Strong',
      body: 'Your retirement projection shows a healthy portfolio through life expectancy with reasonable tax efficiency. Continue monitoring annually and review after major life events.',
    })
  }

  return recs.slice(0, 3)
}

// ─── PDF generator ───────────────────────────────────────────────────────────

function generatePDF({ inputs, result, score, scoreLabel, recs, rows, darkMode }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297
  const MARGIN = 18
  const CONTENT_W = W - MARGIN * 2
  const summary = result?.summary

  // Brand colour
  const BRAND  = [16, 120, 200]
  const DARK   = [17, 24, 39]
  const MID    = [75, 85, 99]
  const LIGHT  = [156, 163, 175]
  const BORDER = [229, 231, 235]
  const GREEN  = [16, 185, 129]
  const RED    = [239, 68, 68]
  const AMBER  = [245, 158, 11]

  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── PAGE 1: Cover ──────────────────────────────────────────────────────────

  // Header band
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 52, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('Retirement Plan Summary', MARGIN, 22)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  const name = inputs.userName ? `Prepared for ${inputs.userName}` : 'Personal Retirement Plan'
  doc.text(name, MARGIN, 31)
  doc.text(today, MARGIN, 38)

  // Readiness score circle
  const cx = W - MARGIN - 22, cy = 26
  doc.setFillColor(255, 255, 255)
  doc.circle(cx, cy, 18, 'F')
  doc.setTextColor(...scoreLabel.color)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(String(score), cx, cy + 2, { align: 'center' })
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(scoreLabel.label, cx, cy + 8, { align: 'center' })
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text('Readiness Score', cx, cy + 13, { align: 'center' })

  // Key metrics grid
  let y = 62
  doc.setTextColor(...MID)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('KEY METRICS', MARGIN, y)
  y += 6

  const metrics = [
    { label: 'Current Age',          value: String(inputs.currentAge ?? '—') },
    { label: 'Retirement Age',        value: String(inputs.retirementAge ?? '—') },
    { label: 'Years to Retirement',   value: String(Math.max(0, (inputs.retirementAge ?? 65) - (inputs.currentAge ?? 45))) },
    { label: 'Life Expectancy',       value: String(inputs.lifeExpectancy ?? '—') },
    { label: 'Portfolio at Retirement', value: fmt(summary?.portfolioAtRetirement) },
    { label: 'Final Balance',         value: fmt(summary?.finalBalance) },
    { label: 'Total Tax Paid',        value: fmt(summary?.totalTaxPaid) },
    { label: 'Avg Tax Rate',          value: pct(summary?.avgEffectiveRate ?? 0) },
    { label: 'RE Equity at Death',    value: fmt(summary?.reEquityAtDeath) },
    { label: 'Portfolio Status',      value: summary?.portfolioExhaustedAge ? `Exhausted at ${summary.portfolioExhaustedAge}` : 'Funded to life expectancy' },
  ]

  const COL_W = CONTENT_W / 2
  metrics.forEach((m, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const mx = MARGIN + col * COL_W
    const my = y + row * 10

    doc.setFillColor(248, 249, 250)
    doc.roundedRect(mx, my, COL_W - 3, 8, 1, 1, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MID)
    doc.text(m.label, mx + 3, my + 3.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(m.value, mx + COL_W - 6, my + 3.5, { align: 'right' })
  })

  y += Math.ceil(metrics.length / 2) * 10 + 8

  // Income sources
  doc.setTextColor(...MID)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('INCOME SOURCES IN RETIREMENT', MARGIN, y)
  y += 5

  const incomes = []
  if ((inputs.cppAvgEarnings ?? 0) > 0) {
    const cppEst = Math.round(Math.min(1306.57, (inputs.cppAvgEarnings ?? 0) / 64900 * 1306.57 * ((inputs.cppYearsContributed ?? 35) / 39)))
    const adj = (inputs.cppStartAge ?? 65) < 65
      ? cppEst * (1 - 0.006 * (65 - (inputs.cppStartAge ?? 65)) * 12)
      : cppEst * (1 + 0.007 * ((inputs.cppStartAge ?? 65) - 65) * 12)
    incomes.push({ label: `CPP (age ${inputs.cppStartAge ?? 65})`, value: Math.round(adj * 12) })
  }
  incomes.push({ label: `OAS (age ${inputs.oasStartAge ?? 65})`, value: Math.round(698.60 * ((inputs.oasYearsResident ?? 40) / 40) * 12) })
  if (inputs.dbEnabled && inputs.dbBestAvgSalary) {
    const db = Math.round(inputs.dbBestAvgSalary * (inputs.dbAccrualRate ?? 1.5) / 100 * (inputs.dbYearsService ?? 25))
    incomes.push({ label: 'Workplace Pension (DB)', value: db })
  }

  incomes.forEach((inc, i) => {
    const mx = MARGIN + (i % 3) * (CONTENT_W / 3)
    const my = y + Math.floor(i / 3) * 10
    doc.setFillColor(240, 253, 244)
    doc.roundedRect(mx, my, CONTENT_W / 3 - 3, 8, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MID)
    doc.text(inc.label, mx + 3, my + 3.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 120, 60)
    doc.text(fmt(inc.value) + '/yr', mx + CONTENT_W / 3 - 6, my + 3.5, { align: 'right' })
  })

  y += Math.ceil(incomes.length / 3) * 10 + 4

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(...LIGHT)
  doc.setFont('helvetica', 'normal')
  doc.text('This report is for planning purposes only. Consult a qualified financial advisor before making financial decisions.', MARGIN, H - 10)
  doc.text('Page 1 of 4', W - MARGIN, H - 10, { align: 'right' })

  // ── PAGE 2: Portfolio Projection ──────────────────────────────────────────

  doc.addPage()

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 16, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Portfolio Projection', MARGIN, 10.5)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Page 2 of 4', W - MARGIN, 10.5, { align: 'right' })

  y = 26
  if (rows?.length) {
    // Draw a simple bar chart of portfolioTotal by age
    const chartH = 80
    const chartW = CONTENT_W
    const maxVal = Math.max(...rows.map(r => r.portfolioTotal ?? 0))
    const retAge = inputs.retirementAge ?? 65
    const lifeExp = inputs.lifeExpectancy ?? 90
    const visRows = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 25)) === 0)

    // Axes
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, y + chartH, MARGIN + chartW, y + chartH) // x-axis
    doc.line(MARGIN, y, MARGIN, y + chartH)                   // y-axis

    // Y gridlines + labels
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0]
    yTicks.forEach(t => {
      const gy = y + chartH - t * chartH
      doc.setDrawColor(...BORDER)
      doc.setLineDash([1, 2])
      if (t > 0) doc.line(MARGIN, gy, MARGIN + chartW, gy)
      doc.setLineDash([])
      doc.setTextColor(...LIGHT)
      doc.setFontSize(6)
      const v = maxVal * t
      doc.text(v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${(v/1_000).toFixed(0)}K`, MARGIN - 1, gy + 1, { align: 'right' })
    })

    // Bars
    const barW = chartW / visRows.length * 0.7
    visRows.forEach((r, i) => {
      const bh = maxVal > 0 ? (r.portfolioTotal / maxVal) * chartH : 0
      const bx = MARGIN + (i / visRows.length) * chartW + barW * 0.2
      const by = y + chartH - bh

      const [R, G, B] = r.portfolioTotal > 0 ? BRAND : [239, 68, 68]
      doc.setFillColor(R, G, B)
      if (bh > 0) doc.rect(bx, by, barW, bh, 'F')
    })

    // RE equity line overlay
    const hasRE = rows.some(r => (r.realEstateEquity ?? 0) > 0)
    if (hasRE) {
      doc.setDrawColor(...AMBER)
      doc.setLineWidth(0.8)
      doc.setLineDash([2, 2])
      let prevX = null, prevY = null
      visRows.forEach((r, i) => {
        const tw = (r.totalWealth ?? r.portfolioTotal) ?? 0
        const bx = MARGIN + (i / visRows.length) * chartW + barW * 0.2 + barW / 2
        const by = y + chartH - (maxVal > 0 ? (tw / maxVal) * chartH : 0)
        if (prevX !== null) doc.line(prevX, prevY, bx, by)
        prevX = bx; prevY = by
      })
      doc.setLineDash([])
      doc.setLineWidth(0.3)
    }

    // X-axis age labels (every 5 years)
    doc.setTextColor(...MID)
    doc.setFontSize(6.5)
    visRows.forEach((r, i) => {
      if (r.age % 5 === 0) {
        const bx = MARGIN + (i / visRows.length) * chartW + barW * 0.7
        doc.text(String(r.age), bx, y + chartH + 4, { align: 'center' })
      }
    })

    // Legend
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, y + chartH + 8, 5, 3, 'F')
    doc.setTextColor(...MID)
    doc.setFontSize(7)
    doc.text('Portfolio Total', MARGIN + 6.5, y + chartH + 10.5)

    if (hasRE) {
      doc.setFillColor(...AMBER)
      doc.rect(MARGIN + 45, y + chartH + 8, 5, 3, 'F')
      doc.text('Total Wealth (incl. RE)', MARGIN + 51.5, y + chartH + 10.5)
    }

    if (summary?.portfolioExhaustedAge) {
      doc.setFontSize(7)
      doc.setTextColor(...RED)
      doc.text(`⚠ Portfolio exhausted at age ${summary.portfolioExhaustedAge}`, MARGIN + CONTENT_W / 2, y + chartH + 10.5, { align: 'center' })
    }

    y += chartH + 18
  }

  // Year-by-year table (condensed)
  doc.setTextColor(...MID)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('YEAR-BY-YEAR SNAPSHOT', MARGIN, y)
  y += 5

  const headers = ['Age', 'Portfolio', 'Gross Draw', 'Tax', 'Net Income', 'Eff. Rate']
  const colW2 = CONTENT_W / headers.length
  doc.setFillColor(...BRAND)
  doc.rect(MARGIN, y, CONTENT_W, 6, 'F')
  headers.forEach((h, i) => {
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(h, MARGIN + i * colW2 + colW2 / 2, y + 4, { align: 'center' })
  })
  y += 6

  // Show every 5 years
  const tableRows = (rows ?? []).filter((r, i) => i === 0 || r.age % 5 === 0)
  tableRows.forEach((r, i) => {
    const rowY = y + i * 7
    if (rowY > H - 18) return
    doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 250 : 255)
    doc.rect(MARGIN, rowY, CONTENT_W, 6, 'F')
    const cells = [
      String(r.age),
      fmt(r.portfolioTotal),
      fmt(r.grossWithdrawal),
      fmt(r.totalTax),
      fmt(r.netIncome),
      `${((r.effectiveRate ?? 0) * 100).toFixed(1)}%`,
    ]
    cells.forEach((c, j) => {
      doc.setTextColor(...(r.portfolioTotal <= 0 ? RED : DARK))
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(c, MARGIN + j * colW2 + colW2 / 2, rowY + 4, { align: 'center' })
    })
  })

  doc.setFontSize(7)
  doc.setTextColor(...LIGHT)
  doc.text('This report is for planning purposes only.', MARGIN, H - 10)
  doc.text('Page 2 of 4', W - MARGIN, H - 10, { align: 'right' })

  // ── PAGE 3: Estate Summary ─────────────────────────────────────────────────

  doc.addPage()

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 16, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Estate Summary', MARGIN, 10.5)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Page 3 of 4', W - MARGIN, 10.5, { align: 'right' })

  y = 26

  if (summary?.finalAccounts?.length) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MID)
    doc.text('FINAL ACCOUNT BALANCES', MARGIN, y)
    y += 5

    summary.finalAccounts.forEach((acc, i) => {
      if (acc.balance <= 0) return
      const rowY = y
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 250 : 255)
      doc.rect(MARGIN, rowY, CONTENT_W, 7, 'F')
      const typeLabels = { rrif: 'RRIF/RRSP — fully taxable', tfsa: 'TFSA — tax-free', nonreg: 'Non-Registered — capital gains' }
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MID)
      doc.text(acc.name, MARGIN + 3, rowY + 4.5)
      doc.setTextColor(...LIGHT)
      doc.text(typeLabels[acc.taxType] ?? '', MARGIN + 50, rowY + 4.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      doc.text(fmt(acc.balance), MARGIN + CONTENT_W - 3, rowY + 4.5, { align: 'right' })
      y += 7
    })

    // RE equity
    if ((summary.reEquityAtDeath ?? 0) > 0) {
      doc.setFillColor(240, 253, 244)
      doc.rect(MARGIN, y, CONTENT_W, 7, 'F')
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MID)
      doc.text('Real Estate Equity', MARGIN + 3, y + 4.5)
      doc.setTextColor(...LIGHT)
      doc.text('Principal residence — generally tax-free', MARGIN + 50, y + 4.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(16, 120, 60)
      doc.text(fmt(summary.reEquityAtDeath), MARGIN + CONTENT_W - 3, y + 4.5, { align: 'right' })
      y += 7
    }

    y += 4

    // Tax breakdown box
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MID)
    doc.text('ESTATE TAX ESTIMATE', MARGIN, y)
    y += 5

    const province = inputs.province ?? 'ON'
    const PROBATE  = { ON: 14.5, BC: 14, AB: 525, SK: 350, MB: 7, NB: 5, NS: 16.23, PE: 400, NL: 6, QC: 0 }
    const rrifBal  = (summary.finalAccounts.find(a => a.taxType === 'rrif')?.balance ?? 0)
    const rrifTax  = rrifBal > 0 ? Math.round(rrifBal * 0.43) : 0 // ~43% marginal

    const nonRegBal  = summary.finalAccounts.find(a => a.taxType === 'nonreg')?.balance ?? 0
    const nonRegBasis = nonRegBal * 0.5
    const gain = nonRegBal - nonRegBasis
    const taxableGain = gain <= 250_000 ? gain * 0.5 : 250_000 * 0.5 + (gain - 250_000) * (2/3)
    const nonRegTax = Math.round(taxableGain * 0.33)

    const tfsaBal  = summary.finalAccounts.find(a => a.taxType === 'tfsa')?.balance ?? 0
    const grossEst = rrifBal + nonRegBal + tfsaBal
    const probateFeeRate = (PROBATE[province] ?? 14.5) / 1000
    const probateFee = Math.round(Math.max(0, nonRegBal - 50000) * probateFeeRate)
    const totalTax = rrifTax + nonRegTax + probateFee
    const netEstate = grossEst - totalTax + (summary.reEquityAtDeath ?? 0)

    const taxItems = [
      { label: 'RRIF/RRSP at death (deemed income)', value: `-${fmt(rrifTax)}`, note: '~43% marginal', color: RED },
      { label: `Non-reg capital gains`, value: `-${fmt(nonRegTax)}`, note: 'Inclusion rate applied', color: RED },
      { label: `Probate fees (${province})`, value: `-${fmt(probateFee)}`, note: 'On non-registered assets', color: AMBER },
      { label: 'TFSA to beneficiary', value: '✓ Tax-free', note: '', color: GREEN },
      { label: 'Real estate (principal residence)', value: '✓ Exempt', note: '', color: GREEN },
    ]

    taxItems.forEach((t, i) => {
      const rowY = y
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 250 : 255)
      doc.rect(MARGIN, rowY, CONTENT_W, 7, 'F')
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MID)
      doc.text(t.label, MARGIN + 3, rowY + 4.5)
      if (t.note) {
        doc.setTextColor(...LIGHT)
        doc.setFontSize(6.5)
        doc.text(t.note, MARGIN + 90, rowY + 4.5)
      }
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...t.color)
      doc.text(t.value, MARGIN + CONTENT_W - 3, rowY + 4.5, { align: 'right' })
      y += 7
    })

    y += 3
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, y, CONTENT_W, 9, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Estimated Total Estate to Heirs', MARGIN + 3, y + 6)
    doc.text(fmt(netEstate), MARGIN + CONTENT_W - 3, y + 6, { align: 'right' })
    y += 12

    doc.setFontSize(7)
    doc.setTextColor(...LIGHT)
    doc.text('Estate estimates are simplified. Actual tax depends on income in year of death, probate jurisdiction, and beneficiary designations.', MARGIN, y, { maxWidth: CONTENT_W })
  }

  doc.setFontSize(7)
  doc.setTextColor(...LIGHT)
  doc.text('This report is for planning purposes only.', MARGIN, H - 10)
  doc.text('Page 3 of 4', W - MARGIN, H - 10, { align: 'right' })

  // ── PAGE 4: Recommendations ────────────────────────────────────────────────

  doc.addPage()

  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 16, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Recommendations', MARGIN, 10.5)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Page 4 of 4', W - MARGIN, 10.5, { align: 'right' })

  y = 26

  // Score card
  const [sR, sG, sB] = scoreLabel.color
  doc.setFillColor(sR, sG, sB, 0.08)
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(MARGIN, y, CONTENT_W, 20, 2, 2, 'F')
  doc.setFillColor(...scoreLabel.color)
  doc.circle(MARGIN + 14, y + 10, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(String(score), MARGIN + 14, y + 12, { align: 'center' })
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(`Retirement Readiness: ${scoreLabel.label}`, MARGIN + 28, y + 8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MID)
  const scoreDesc = score >= 90
    ? 'Your plan is in excellent shape. Continue monitoring annually.'
    : score >= 75
    ? 'Your plan is on track with a few areas to optimize.'
    : score >= 55
    ? 'Your plan needs attention in a few key areas.'
    : 'Your plan has significant gaps that should be addressed soon.'
  doc.text(scoreDesc, MARGIN + 28, y + 15, { maxWidth: CONTENT_W - 32 })
  y += 26

  // Top recommendations
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...MID)
  doc.text('TOP RECOMMENDATIONS', MARGIN, y)
  y += 5

  recs.forEach((rec, i) => {
    // Card
    doc.setFillColor(252, 252, 253)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.roundedRect(MARGIN, y, CONTENT_W, 36, 2, 2, 'FD')

    // Number badge
    doc.setFillColor(...BRAND)
    doc.circle(MARGIN + 7, y + 8, 5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(String(i + 1), MARGIN + 7, y + 10, { align: 'center' })

    // Icon + title
    doc.setTextColor(...DARK)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`${rec.icon}  ${rec.title}`, MARGIN + 15, y + 10)

    // Body
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MID)
    const lines = doc.splitTextToSize(rec.body, CONTENT_W - 20)
    doc.text(lines.slice(0, 3), MARGIN + 15, y + 18)

    y += 40
  })

  // Action checklist
  y += 4
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...MID)
  doc.text('ACTION CHECKLIST', MARGIN, y)
  y += 5

  const actions = [
    'Review and update your account balances annually',
    'Maximize TFSA contribution room every January',
    'File RRSP contributions before the February deadline',
    'Apply for CPP/OAS 6 months before your target start age',
    'Review withdrawal strategy with a financial advisor',
  ]
  actions.forEach(a => {
    doc.setFillColor(...BORDER)
    doc.roundedRect(MARGIN, y, 4, 4, 0.5, 0.5, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK)
    doc.text(a, MARGIN + 7, y + 3)
    y += 7
  })

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(...LIGHT)
  doc.line(MARGIN, H - 14, W - MARGIN, H - 14)
  doc.text(`Generated by Retirement Planner · ${today}`, MARGIN, H - 8)
  doc.text('For personal planning use only — not financial advice.', W - MARGIN, H - 8, { align: 'right' })

  return doc
}

// ─── Export button component ──────────────────────────────────────────────────

export default function PDFExportButton({ inputs, result, darkMode }) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    if (!result) return
    setLoading(true)
    try {
      const summary = result.summary
      const rows    = result.rows ?? []
      const score   = getScore(summary, inputs) ?? 80
      const scoreLabel = getScoreLabel(score)
      const recs    = getRecommendations(summary, inputs, result)

      const doc = generatePDF({ inputs, result, score, scoreLabel, recs, rows, darkMode })
      const name = inputs.userName ? `${inputs.userName.replace(/\s+/g, '_')}_retirement_plan.pdf` : 'retirement_plan.pdf'
      doc.save(name)
    } catch (err) {
      console.error('PDF export error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || !result}
      title="Export 4-page retirement summary PDF"
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
        loading || !result
          ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {loading ? (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
        </svg>
      )}
      {loading ? 'Generating…' : 'Export PDF'}
    </button>
  )
}
