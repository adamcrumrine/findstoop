// Eviction history pull via LexisNexis Accurint (FCRA-regulated).
//
// ⚠️ INACTIVE (as of 2026-05) — STUB ONLY. Awaiting LexisNexis Risk Solutions
// partner program approval. Eviction screening is a disabled "Coming soon"
// tile in the manager UI, so require_eviction_check is never true and this is
// never invoked from ScreeningFlow. The body below writes a clearly-marked
// `_stub: true` placeholder rather than real court records — do not treat its
// output as a real eviction result.
//
// Production behavior (post-LN approval):
//   1. Verify addon_eviction_check=true, payment_status=paid
//   2. POST applicant identity + last-4 SSN to Accurint eviction search
//   3. LN returns court-record hits (eviction filings, judgments) by county
//   4. Store lexisnexis_report_id + normalized lexisnexis_data jsonb
//
// Note: LexisNexis is the slowest of the three vendors to onboard (typical
// 8–12 weeks). We ship credit + criminal first and add eviction last.

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
      .select('id, addon_eviction_check, payment_status, lexisnexis_data')
      .eq('id', orderId)
      .single()
    if (error || !order) return json({ error: 'Order not found' }, { status: 404 })
    if (!order.addon_eviction_check) return json({ error: 'Eviction check not part of this order' }, { status: 400 })
    if (order.payment_status !== 'paid') return json({ error: 'Order not paid' }, { status: 400 })

    // TODO(LexisNexis): replace stub with real API call
    const stubData = {
      _stub: true,
      vendor: 'lexisnexis_accurint',
      note: 'Stubbed result — LexisNexis partner integration pending',
      pulled_at: new Date().toISOString(),
    }

    await admin.from('screening_orders').update({
      lexisnexis_report_id: `stub-${orderId}`,
      lexisnexis_data: stubData,
    }).eq('id', orderId)

    return json({ ok: true, stub: true, data: stubData })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
