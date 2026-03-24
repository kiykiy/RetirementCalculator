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

  const { access_token } = await req.json()

  const [accRes, instRes] = await Promise.all([
    fetch(`${BASE}/accounts/get`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, secret: SECRET, access_token }),
    }),
    fetch(`${BASE}/item/get`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, secret: SECRET, access_token }),
    }),
  ])

  const accData  = await accRes.json()
  const itemData = await instRes.json()

  // Fetch institution name
  let institutionName = 'Bank'
  if (itemData?.item?.institution_id) {
    const instNameRes = await fetch(`${BASE}/institutions/get_by_id`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID, secret: SECRET,
        institution_id: itemData.item.institution_id,
        country_codes: ['CA', 'US'],
      }),
    })
    const instNameData = await instNameRes.json()
    institutionName = instNameData?.institution?.name ?? 'Bank'
  }

  return new Response(JSON.stringify({ accounts: accData.accounts ?? [], institutionName }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
    status: accRes.ok ? 200 : 400,
  })
})
