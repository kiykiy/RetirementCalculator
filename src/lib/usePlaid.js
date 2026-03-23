import { useState, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { supabase } from './supabase.js'

// ─── Account type mapping ─────────────────────────────────────────────────────
// Maps Plaid account type/subtype → our app bucket
export function classifyPlaidAccount(acc) {
  const type    = acc.type?.toLowerCase()
  const subtype = acc.subtype?.toLowerCase() ?? ''

  if (type === 'credit')                                   return 'debt'
  if (type === 'loan')                                     return 'debt'
  if (type === 'investment' || type === 'brokerage')       return 'investment'
  if (type === 'depository')                               return 'cash'
  return 'cash'
}

export function debtTypeFromPlaid(acc) {
  const sub = acc.subtype?.toLowerCase() ?? ''
  if (sub.includes('credit'))                              return 'credit_card'
  if (sub.includes('line'))                                return 'loc'
  if (sub.includes('student'))                             return 'student'
  if (sub.includes('auto') || sub.includes('vehicle'))    return 'auto'
  if (sub.includes('mortgage'))                            return 'mortgage'
  return 'loan'
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePlaid({ onConnected }) {
  const [linkToken,  setLinkToken]  = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  // Step 1 — create link token via edge function
  const openPlaid = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('plaid-link-token', {
        body: { user_id: 'default' },
      })
      if (fnErr) throw fnErr
      if (data?.error_code) throw new Error(data.display_message ?? data.error_message ?? 'Plaid error')
      setLinkToken(data.link_token)
    } catch (e) {
      setError(e.message ?? 'Could not reach Plaid')
      setLoading(false)
    }
  }, [])

  // Step 2 — Plaid Link callback
  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: async (public_token, metadata) => {
      setLoading(true)
      setError(null)
      try {
        // Exchange public_token → access_token
        const { data: exchData, error: exchErr } =
          await supabase.functions.invoke('plaid-exchange-token', {
            body: { public_token },
          })
        if (exchErr) throw exchErr

        const access_token = exchData.access_token
        const item_id      = exchData.item_id

        // Fetch accounts
        const { data: accData, error: accErr } =
          await supabase.functions.invoke('plaid-accounts', {
            body: { access_token },
          })
        if (accErr) throw accErr

        const institutionName = accData.institutionName ?? metadata.institution?.name ?? 'Bank'

        // Build account-id → account-name map for transaction labelling
        const accountNameMap = {}
        for (const a of accData.accounts ?? []) {
          accountNameMap[a.account_id] = `${institutionName} – ${a.name}`
        }

        // Fetch last 90 days of transactions
        const now   = new Date()
        const start = new Date(now); start.setDate(start.getDate() - 90)
        const fmt   = d => d.toISOString().slice(0, 10)

        const { data: txnData, error: txnErr } =
          await supabase.functions.invoke('plaid-transactions', {
            body: { access_token, start_date: fmt(start), end_date: fmt(now) },
          })
        if (txnErr) throw txnErr

        // Replace account_id with human-readable account name
        const transactions = (txnData.transactions ?? []).map(t => ({
          ...t,
          account: accountNameMap[t.account] ?? t.account,
        }))

        onConnected?.({
          item_id,
          access_token,
          institutionName,
          accounts:     accData.accounts ?? [],
          transactions,
        })
      } catch (e) {
        setError(e.message ?? 'Failed to connect bank')
      } finally {
        setLinkToken(null)
        setLoading(false)
      }
    },
    onExit: () => {
      setLinkToken(null)
      setLoading(false)
    },
  })

  // When linkToken is set and ready, auto-open
  const handleOpen = useCallback(async () => {
    if (linkToken && ready) { open(); return }
    await openPlaid()
  }, [linkToken, ready, open, openPlaid])

  // Watch: once token arrives and link is ready, open automatically
  const [pendingOpen, setPendingOpen] = useState(false)
  const triggerOpen = useCallback(async () => {
    setPendingOpen(true)
    await openPlaid()
  }, [openPlaid])

  // Open Plaid Link as soon as token + ready
  if (pendingOpen && linkToken && ready) {
    setPendingOpen(false)
    open()
  }

  return { triggerOpen, loading, error, clearError: () => setError(null) }
}
