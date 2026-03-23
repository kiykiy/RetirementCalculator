import { usePlaid, classifyPlaidAccount, debtTypeFromPlaid } from '../lib/usePlaid.js'

// ─── PlaidConnect ─────────────────────────────────────────────────────────────
// Reusable "Connect Bank" button.
//
// Props
//   onAccounts(accounts, institutionName) — called after a successful link;
//     accounts is the raw Plaid accounts array; parent decides what to do with them
//   onTransactions(transactions)          — called with normalised transaction array
//   label                                  — button text override
//   compact                                — smaller styling when true

export default function PlaidConnect({ onAccounts, onTransactions, label, compact = false }) {
  const { triggerOpen, loading, error, clearError } = usePlaid({
    onConnected({ institutionName, accounts, transactions }) {
      onAccounts?.(accounts, institutionName)
      onTransactions?.(transactions)
    },
  })

  return (
    <div>
      <button
        onClick={triggerOpen}
        disabled={loading}
        className={`flex items-center justify-center gap-2 font-medium transition-colors
          border border-dashed rounded-lg
          ${compact
            ? 'text-[11px] px-3 py-1.5 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:text-brand-600 dark:hover:border-brand-600 dark:hover:text-brand-400 w-full'
            : 'text-xs px-4 py-2 text-brand-600 dark:text-brand-400 border-brand-300 dark:border-brand-700 hover:bg-brand-50 dark:hover:bg-brand-900/20 w-full'
          }
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Connecting…
          </>
        ) : (
          <>🏦 {label ?? 'Connect Bank via Plaid'}</>
        )}
      </button>

      {error && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-rose-600 dark:text-rose-400">
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="flex-shrink-0 hover:text-rose-800">✕</button>
        </div>
      )}
    </div>
  )
}

// ─── Helpers re-exported for callers ─────────────────────────────────────────
export { classifyPlaidAccount, debtTypeFromPlaid }
