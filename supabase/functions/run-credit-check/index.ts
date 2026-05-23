// Credit report pull via Array (FCRA-regulated).
//
// STATUS: STUB. Awaiting Array partner program approval — once we have
// sandbox credentials we'll wire the actual API call. For now this returns
// a placeholder so the rest of the screening flow can develop against a
// realistic shape.
//
// Production behavior (post-Array approval):
//   1. Verify the order has addon_credit_check=true and payment_status=paid
//   2. Pull the application's identity data (name, DOB, last-4 SSN, addr)
//   3. POST to Array's credit-report API with permissible-purpose code
//   4. Store array_report_id + normalized array_data jsonb on the order
//   5. Update screening_order.state if all required addons have completed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId } = await req.json() as { orderId?: string }
    if (!orderId) return json({ error: 'orderId required' }, { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: order, error } = await admin
      .from('screening_orders')
      .select('id, addon_credit_check, payment_status, array_data')
      .eq('id', orderId)
      .single()
    if (error || !order) return json({ error: 'Order not found' }, { status: 404 })
    if (!order.addon_credit_check) return json({ error: 'Credit check not part of this order' }, { status: 400 })
    if (order.payment_status !== 'paid') return json({ error: 'Order not paid' }, { status: 400 })

    // TODO(Array): replace stub with real API call
    const stubData = {
      _stub: true,
      vendor: 'array',
      note: 'Stubbed result — Array partner integration pending',
      pulled_at: new Date().toISOString(),
    }

    await admin.from('screening_orders').update({
      array_report_id: `stub-${orderId}`,
      array_data: stubData,
    }).eq('id', orderId)

    return json({ ok: true, stub: true, data: stubData })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
