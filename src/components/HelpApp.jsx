import { useState } from 'react'

// ─── Help Section (collapsible) ───────────────────────────────────────────────
function HelpSection({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-base leading-none flex-shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">{title}</span>
        <span className={`text-gray-400 text-xs transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="px-4 py-4 space-y-3 bg-white dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Help Row ─────────────────────────────────────────────────────────────────
function HelpRow({ term, children, badge }) {
  return (
    <div className="flex gap-3 text-[12px]">
      <div className="flex-shrink-0 w-40">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{term}</span>
        {badge && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-white bg-brand-500 rounded px-1 py-0.5">{badge}</span>}
      </div>
      <div className="flex-1 text-gray-600 dark:text-gray-400 leading-relaxed">{children}</div>
    </div>
  )
}

// ─── Rate Table ───────────────────────────────────────────────────────────────
function RateTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
            <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Item</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Value / Rate</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Where it applies</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">{r[0]}</td>
              <td className="px-3 py-2 font-mono text-brand-600 dark:text-brand-400">{r[1]}</td>
              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Help Content ─────────────────────────────────────────────────────────────
function HelpContent() {
  return (
    <div className="space-y-3 max-w-3xl mx-auto">

      <HelpSection icon="🚀" title="Getting Started" defaultOpen>
        <HelpRow term="6 Modules">
          Navigate using the left icon rail: <strong>R</strong> = Retirement, <strong>B</strong> = Budget, <strong>T</strong> = Transactions, <strong>A</strong> = Accounts, <strong>RE</strong> = Real Estate, <strong>?</strong> = Help (you are here).
        </HelpRow>
        <HelpRow term="DEMO Mode" badge="top-right">
          Toggle the <em>DEMO</em> switch in the top-right header to populate all modules with realistic sample data. Your real data is not overwritten — demo data is layered on top.
        </HelpRow>
        <HelpRow term="Auto-Save">
          All changes are saved automatically to your browser's localStorage. Sign in (person icon, top-right) to sync across devices via Supabase cloud save.
        </HelpRow>
        <HelpRow term="Dark Mode">
          Click the moon/sun icon in the top-right header to toggle dark mode.
        </HelpRow>
        <HelpRow term="Reset">
          The circular arrow icon resets all data to defaults. This cannot be undone (check the Audit Log first if you need to recover values).
        </HelpRow>
      </HelpSection>

      <HelpSection icon="📊" title="Retirement Planner (R)">
        <HelpRow term="What it does">
          Simulates your portfolio year-by-year from today to your life expectancy. Models CPP, OAS, DB pension, RRSP/RRIF drawdown, TFSA growth, non-registered accounts, and taxes.
        </HelpRow>
        <HelpRow term="Inputs sidebar">
          On desktop, the left sidebar shows all inputs. On mobile, tap the <strong>⚙ Inputs</strong> button in the header to open a drawer. Changes take effect immediately.
        </HelpRow>
        <HelpRow term="Retirement Age">
          The age at which you stop working and begin drawing from your portfolio. CPP/OAS start ages are set separately.
        </HelpRow>
        <HelpRow term="Life Expectancy">
          Planning horizon — not a prediction. The simulation runs to this age. Setting it higher gives a more conservative (safer) plan.
        </HelpRow>
        <HelpRow term="Withdrawal Strategies">
          <ul className="space-y-1 mt-1">
            <li><strong>Fixed %</strong> — withdraw a set percentage of portfolio each year</li>
            <li><strong>Fixed $</strong> — withdraw a fixed inflation-adjusted dollar amount</li>
            <li><strong>Guardrails</strong> — cut spending when portfolio drops, increase when it grows</li>
            <li><strong>Bucket</strong> — short/medium/long-term buckets with different return assumptions</li>
            <li><strong>Target Estate</strong> — optimize withdrawals to leave a specified estate value</li>
          </ul>
        </HelpRow>
        <HelpRow term="RRSP Drawdown">
          Converts RRSP to income before RRIF mandatory minimums kick in at 71. Filling lower tax brackets early reduces lifetime tax. Enable in the strategy overlay.
        </HelpRow>
        <HelpRow term="Monte Carlo">
          Runs 500 randomized return scenarios using your account return rates as a mean with ±10% standard deviation. The success % shown is the fraction of scenarios where the portfolio survives to life expectancy.
        </HelpRow>
        <HelpRow term="Snapshots">
          Save the current scenario with the bookmark icon. Load or compare snapshots to evaluate different strategies side-by-side.
        </HelpRow>
        <HelpRow term="Spouse Mode">
          Enable via the Spouse section in Inputs. Switch between Primary / Spouse / Combined view using the tabs in the header. Joint simulation handles survivor benefits and pension splitting.
        </HelpRow>
      </HelpSection>

      <HelpSection icon="💰" title="Budget Planner (B)">
        <HelpRow term="Dashboard">
          Shows net worth, income summary, Sankey cash-flow diagram, and budget progress. Use the period selector (hover over the Sankey card header) to view Annual / Q1–Q4 / individual months.
        </HelpRow>
        <HelpRow term="Net Worth">
          Cash + Investments + Real Estate equity + Other Assets − Debt − Mortgages. The 10-year projection uses each account's return rate and each property's appreciation rate.
        </HelpRow>
        <HelpRow term="Sankey Chart">
          Flows income → expense categories proportionally. Width of each flow represents dollar amount. Defaults to Q1; click the period dropdown to change.
        </HelpRow>
        <HelpRow term="Income Tab">
          Add income sources: Employment, Self-Employment, Rental, Dividends, Capital Gains, Reimbursements. Each type has different CPP/EI and tax treatment. Gross monthly is entered; net is calculated.
        </HelpRow>
        <HelpRow term="Plan Tab">
          Monthly expense grid. Three default sections: Non-Controllable (fixed costs), Controllable (discretionary), Savings (RRSP/TFSA contributions). Add sections and items; use sub-items for detailed breakdowns.
        </HelpRow>
        <HelpRow term="CapEx Tab">
          Capital expense reserves — recurring large purchases (car replacement, roof, appliances). Enter the cost, replacement interval in years, and an optional return rate on the reserve fund. Monthly contributions are calculated automatically.
        </HelpRow>
        <HelpRow term="Goals Tab">
          Savings targets with target amounts and dates. Progress is tracked against actual balances.
        </HelpRow>
      </HelpSection>

      <HelpSection icon="🧾" title="Transactions (T)">
        <HelpRow term="What it does">
          Tracks actual monthly spending against your Budget Plan. Transactions are entered manually or via Plaid bank connection (demo mode shows simulated transactions).
        </HelpRow>
        <HelpRow term="Inbox">
          Unreviewed transactions land here. Click a transaction to assign it to a budget category. Use the year/month filter headers to narrow the view.
        </HelpRow>
        <HelpRow term="Month Filter">
          Click a month column header in the 12-month table to filter by that month. Multiple months can be selected. Click again to deselect. Click the year label to filter by the entire year.
        </HelpRow>
        <HelpRow term="Assigned">
          Reviewed and categorized transactions. Click ↩ to send back to inbox for reclassification.
        </HelpRow>
      </HelpSection>

      <HelpSection icon="🏦" title="Accounts (A)">
        <HelpRow term="Retirement Accounts">
          RRSP/RRIF, TFSA, Non-Registered. Set balance, annual contribution, and return rate. These feed directly into the Retirement Planner simulation. Toggle <em>Portfolio Mix</em> to set per-asset-class weights instead of a single rate.
        </HelpRow>
        <HelpRow term="Cash Accounts">
          Chequing and savings accounts. Add sub-accounts (e.g. Spending, Reserve, Savings). Balances appear in the Dashboard net worth and account sparklines.
        </HelpRow>
        <HelpRow term="Investment Accounts">
          Non-registered brokerage or investment accounts outside of RRSP/TFSA. Set balance and return rate.
        </HelpRow>
        <HelpRow term="Debt Accounts">
          Credit cards, lines of credit, student loans, personal loans. Enter balance, interest rate, and minimum monthly payment. Mortgage debt is managed in the 🏠 Real Estate tab.
        </HelpRow>
        <HelpRow term="Other Assets">
          Vehicles, artwork, business interests, collectibles — any asset that contributes to net worth but isn't a registered account, cash, or real estate. Enter estimated value and annual appreciation/depreciation rate.
        </HelpRow>
        <HelpRow term="Plaid Connect">
          Link real bank accounts (demo mode simulates this). Imported balances appear read-only with a green Plaid badge.
        </HelpRow>
      </HelpSection>

      <HelpSection icon="🏠" title="Real Estate">
        <HelpRow term="Properties">
          Add primary residence, rental properties, vacation homes, commercial, or land. Each property tracks current value, purchase price/date, and annual appreciation rate.
        </HelpRow>
        <HelpRow term="Mortgage">
          Toggle the Mortgage switch to attach a mortgage. Enter lender, balance, interest rate, amortization months remaining, and renewal date. The monthly P&I payment is calculated using the standard formula: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-[10px]">P = r·PV / (1 − (1+r)⁻ⁿ)</code>
        </HelpRow>
        <HelpRow term="Amortization Schedule">
          Click <em>📅 Amortization Schedule</em> inside the mortgage section to see a year-by-year table showing balance, annual interest, annual principal, and projected equity (property value with appreciation minus remaining balance).
        </HelpRow>
        <HelpRow term="Rental Income">
          Toggle <em>Rental Income</em> on any property. Enter gross monthly rent and vacancy rate. Net rental income (after vacancy) appears in the Dashboard income bar and flows into net worth projections.
        </HelpRow>
        <HelpRow term="Costs & Carrying">
          Property tax (annual), insurance (annual), and maintenance (% of value per year). These reduce your net rental cash flow and appear in the monthly cash flow summary.
        </HelpRow>
        <HelpRow term="Net Equity">
          Current Value − Mortgage Balance. Shown per-property and in aggregate. Flows into the Dashboard net worth chart with appreciation modeled year by year.
        </HelpRow>
      </HelpSection>

      <HelpSection icon="🔘" title="Toggles & Settings">
        <HelpRow term="DEMO Mode">
          Overlays realistic sample data across all modules (accounts, transactions, real estate). Your real data is preserved. Toggle off to return to your actual data.
        </HelpRow>
        <HelpRow term="Dark Mode">
          Persists across sessions. Stored in localStorage alongside your inputs.
        </HelpRow>
        <HelpRow term="Spouse Enable">
          In Retirement Inputs → Spouse section. Enables a second person's profile, joint simulation, and Combined net worth view.
        </HelpRow>
        <HelpRow term="Pension Splitting">
          In Spouse inputs. Enables splitting eligible pension income between spouses for tax purposes. Reduces combined tax in most cases.
        </HelpRow>
        <HelpRow term="Portfolio Mix">
          On each retirement or investment account. Toggle to enter per-asset-class allocations (CA Equity, US Equity, Intl Equity, Fixed Income, Cash/GIC) instead of a single blended return rate. A weighted return is calculated from the mix and the historical asset-class return assumptions.
        </HelpRow>
        <HelpRow term="RRSP Drawdown">
          In the strategy overlay (hover over the Retirement Withdrawals card). Enables bracket-filling withdrawals from RRSP/RRIF before the mandatory RRIF minimum age (71). Set start/end ages and the annual drawdown amount.
        </HelpRow>
        <HelpRow term="Rental Income toggle">
          On each Real Estate property card. Reveals rent and vacancy rate fields. Net rental income feeds the income bar and net worth.
        </HelpRow>
        <HelpRow term="Mortgage toggle">
          On each property card. Attach or detach a mortgage. When disabled, no mortgage debt is counted for that property in net worth.
        </HelpRow>
        <HelpRow term="CapEx Enabled">
          On each CapEx item. Disabling stops the monthly reserve contribution without deleting the item.
        </HelpRow>
        <HelpRow term="TFSA Room Indexed">
          In Accounts → TFSA card. Projects future TFSA room using the inflation rate from Retirement inputs.
        </HelpRow>
      </HelpSection>

      <HelpSection icon="📐" title="Assumptions & Rates (2025)">
        <RateTable rows={[
          ['CPP Max Benefit (age 65)',    '$1,364/mo',     'Retirement Planner CPP calculation'],
          ['CPP Deferral Bonus',          '+0.7%/mo after 65', 'Applied when CPP start age > 65'],
          ['CPP Early Reduction',         '−0.6%/mo before 65', 'Applied when CPP start age < 65'],
          ['OAS Max Benefit (age 65)',     '$727/mo',      'Retirement Planner OAS calculation'],
          ['OAS Deferral Bonus',          '+0.6%/mo after 65', 'Max deferral to age 70'],
          ['OAS Clawback Threshold',      '$90,997/yr',   'Income above this reduces OAS'],
          ['TFSA Annual Limit (2025)',     '$7,000',       'Accounts → TFSA card'],
          ['RRSP Limit (2025)',            '18% of earned income, max $32,490', 'Accounts → RRSP card'],
          ['RRIF Minimum Withdrawal',     'Starts at ~5.28% at age 71', 'Retirement Planner simulation'],
          ['Default Investment Return',   '6%/yr',        'Applied to RRSP, TFSA, Non-Reg by default'],
          ['Default Inflation',           '2.5%/yr',      'Set in Retirement Inputs → Advanced'],
          ['CPP Contribution Rate (2025)','5.95% (employee)', 'Deducted from employment income in Budget'],
          ['EI Premium Rate (2025)',       '1.66%',        'Deducted from employment income in Budget'],
          ['CA Equity Assumed Return',    '7%/yr',        'Portfolio Mix, CA Equity weight'],
          ['US Equity Assumed Return',    '10%/yr',       'Portfolio Mix, US Equity weight'],
          ['Intl Equity Assumed Return',  '7%/yr',        'Portfolio Mix, Intl Equity weight'],
          ['Fixed Income Assumed Return', '4%/yr',        'Portfolio Mix, Fixed Income weight'],
          ['Cash / GIC Assumed Return',   '3.5%/yr',      'Portfolio Mix, Cash weight'],
          ['Property Appreciation Default','3.5%/yr',     'Real Estate → Property Details'],
          ['Maintenance Default',         '1% of value/yr', 'Real Estate → Costs & Carrying'],
          ['Mortgage Formula',            'P = r·PV / (1−(1+r)⁻ⁿ)', 'Real Estate amortization schedule'],
        ]} />
      </HelpSection>

    </div>
  )
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
const APP_LABELS = {
  budget:     { label: 'Budget',      color: 'bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300'  },
  accounts:   { label: 'Accounts',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  realestate: { label: 'Real Estate', color: 'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300'  },
  tracking:   { label: 'Transactions',color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  retirement: { label: 'Retirement',  color: 'bg-rose-100   text-rose-700   dark:bg-rose-900/40   dark:text-rose-300'   },
}

function fmtTime(ts) {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}

function AuditLogTab({ auditLog, onNavigate }) {
  const [search, setSearch] = useState('')
  const [filterApp, setFilterApp] = useState('all')
  const [showCount, setShowCount] = useState(50)

  const filtered = auditLog.filter(e =>
    (filterApp === 'all' || e.app === filterApp) &&
    (!search || e.summary?.toLowerCase().includes(search.toLowerCase()) || e.label?.toLowerCase().includes(search.toLowerCase()))
  )
  const displayed = filtered.slice(0, showCount)

  if (auditLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-3">📋</span>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No changes recorded yet</h3>
        <p className="text-xs text-gray-400 max-w-xs">
          The audit log tracks every change you make to income, expenses, accounts, properties, and goals. Start editing to see entries appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search changes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field text-xs py-1.5 pl-7 w-full"
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
        </div>
        <select value={filterApp} onChange={e => setFilterApp(e.target.value)}
          className="input-field text-xs py-1.5 w-36">
          <option value="all">All modules</option>
          {Object.entries(APP_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <span className="text-[11px] text-gray-400 self-center">{filtered.length} entries</span>
      </div>

      {/* Log entries */}
      <div className="space-y-1.5">
        {displayed.map(entry => {
          const appMeta = APP_LABELS[entry.app] ?? { label: entry.app, color: 'bg-gray-100 text-gray-600' }
          return (
            <div key={entry.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
              {/* Time */}
              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 w-20 tabular-nums">
                {fmtTime(entry.ts)}
              </span>
              {/* App badge */}
              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${appMeta.color}`}>
                {appMeta.label}
              </span>
              {/* Summary */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-snug truncate">{entry.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{entry.summary}</p>
              </div>
              {/* Go to button */}
              {entry.app && (
                <button
                  onClick={() => onNavigate(entry.app, entry.subTab)}
                  className="flex-shrink-0 text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
                >
                  Go to →
                </button>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length > showCount && (
        <button onClick={() => setShowCount(c => c + 50)}
          className="w-full text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline py-2">
          Load more ({filtered.length - showCount} remaining)
        </button>
      )}
    </div>
  )
}

// ─── Main HelpApp ─────────────────────────────────────────────────────────────
export default function HelpApp({ auditLog = [], onNavigate }) {
  const [tab, setTab] = useState('help')

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-5">

        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
          {[
            { id: 'help',  label: '📖 Help & Docs' },
            { id: 'audit', label: `📋 Audit Log${auditLog.length > 0 ? ` (${auditLog.length})` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'help'  && <HelpContent />}
        {tab === 'audit' && <AuditLogTab auditLog={auditLog} onNavigate={onNavigate} />}

      </div>
    </div>
  )
}
