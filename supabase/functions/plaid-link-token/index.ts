import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const SECRET    = Deno.env.get('PLAID_SECRET')!
const ENV       = Deno.env.get('PLAID_ENV') ?? 'sandbox'
const BASE      = `https://${ENV}.plaid.com`

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { user_id = 'default-user' } = await req.json().catch(() => ({}))

  const res = await fetch(`${BASE}/link/token/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      secret:        SECRET,
      client_name:   'Forward Planner',
      country_codes: ['CA', 'US'],
      language:      'en',
      user:          { client_user_id: user_id },
      products:      ['transactions'],
    }),
  })

  const data = await res.json()
  return new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' },
    status: res.ok ? 200 : 400,
  })
})
