import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const SECRET    = Deno.env.get('PLAID_SECRET')!
const ENV       = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const BASE      = `https://${ENV}.plaid.com`

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { access_token, start_date, end_date } = await req.json()

  const now   = new Date()
  const start = start_date ?? isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const end   = end_date   ?? isoDate(now)

  // Use transactions/sync for incremental updates, fall back to /get
  const res = await fetch(`${BASE}/transactions/get`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:    CLIENT_ID,
      secret:       SECRET,
      access_token,
      start_date:   start,
      end_date:     end,
      options: { count: 500, offset: 0, include_personal_finance_category: true },
    }),
  })

  const data = await res.json()

  // Normalise to our transaction shape
  const transactions = (data.transactions ?? []).map((t: Record<string, unknown>) => ({
    id:          `plaid_${t.transaction_id}`,
    date:        t.date as string,
    description: (t.merchant_name ?? t.name) as string,
    amount:      Math.abs(t.amount as number),   // Plaid uses negative for debits
    account:     t.account_id as string,          // caller replaces with account name
    categoryId:  null,
    plaidId:     t.transaction_id,
    plaidCat:    (t.personal_finance_category as Record<string, unknown>)?.primary ?? (t.category as string[])?.[0] ?? '',
  }))

  return new Response(JSON.stringify({ transactions, total: data.total_transactions ?? 0 }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
    status: res.ok ? 200 : 400,
  })
})
