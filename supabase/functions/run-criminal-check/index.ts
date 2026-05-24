// Create a Checkr report against the candidate created at SSN-submission.
//
// Flow:
//   1. Caller passes orderId.
//   2. We verify: addon_criminal_check=true, payment_status=paid,
//      checkr_candidate_id is set, no checkr_report_id yet (idempotent).
//   3. POST /v1/reports with the configured CHECKR_PACKAGE_SLUG.
//   4. Store the report id + initial status. Async updates land via the
//      checkr-webhook edge function as Checkr completes the screening.
//
// Configuration (set in Supabase project secrets):
//   CHECKR_API_KEY          — from your Checkr Direct dashboard
//   CHECKR_PACKAGE_SLUG     — the package slug for tenant screening
//                              (e.g., 'tasker_standard' or whatever your
//                              dashboard provisions for "tenant" use case)
//   CHECKR_API_BASE         — optional, defaults to https://api.checkr.com/v1

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, timed, CHECKR_COST_CENTS } from '../_shared/logging.ts'

const CHECKR_API_BASE     = Deno.env.get('CHECKR_API_BASE') ?? 'https://api.checkr.com/v1'
const CHECKR_API_KEY      = Deno.env.get('CHECKR_API_KEY') ?? ''
const CHECKR_PACKAGE_SLUG = Deno.env.get('CHECKR_PACKAGE_SLUG') ?? ''

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

function checkrAuthHeader(): string {
  return 'Basic ' + btoa(`${CHECKR_API_KEY}:`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!CHECKR_API_KEY || !CHECKR_PACKAGE_SLUG) {
    return json({ error: 'Checkr integration not configured (set CHECKR_API_KEY and CHECKR_PACKAGE_SLUG)' }, { status: 500 })
  }

  try {
    const { orderId } = await req.json() as { orderId?: string }
    if (!orderId) return json({ error: 'orderId required' }, { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: order, error } = await admin
      .from('screening_orders')
      .select('id, addon_criminal_check, payment_status, checkr_candidate_id, checkr_report_id')
      .eq('id', orderId)
      .single()
    if (error || !order) return json({ error: 'Order not found' }, { status: 404 })
    if (!order.addon_criminal_check)    return json({ error: 'Criminal check not part of this order' }, { status: 400 })
    if (order.payment_status !== 'paid') return json({ error: 'Order not paid' }, { status: 400 })
    if (!order.checkr_candidate_id)      return json({ error: 'Checkr candidate not created — call submit-checkr-candidate first' }, { status: 400 })
    if (order.checkr_report_id)          return json({ ok: true, report_id: order.checkr_report_id, already_existed: true })

    const { result: resp, latency_ms: callLatency } = await timed(() => fetch(`${CHECKR_API_BASE}/reports`, {
      method: 'POST',
      headers: {
        'Authorization': checkrAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        package: CHECKR_PACKAGE_SLUG,
        candidate_id: order.checkr_candidate_id,
      }),
    }))
    if (!resp.ok) {
      const errBody = await resp.text()
      await logApiCall({
        function_name: 'run-criminal-check', vendor: 'checkr',
        latency_ms: callLatency, reference_id: orderId,
        status_code: resp.status, error_message: errBody.slice(0, 500),
      })
      return json({ error: `Checkr report create failed (${resp.status})`, detail: errBody }, { status: 502 })
    }
    const report = await resp.json() as { id?: string; status?: string }
    if (!report.id) return json({ error: 'Checkr returned no report id' }, { status: 502 })

    // Log the Checkr cost — billed at the report level, charged regardless
    // of final adjudication. Adjust CHECKR_COST_CENTS in _shared/logging.ts
    // once your account's wholesale rate firms up.
    await logApiCall({
      function_name: 'run-criminal-check', vendor: 'checkr',
      latency_ms: callLatency, reference_id: orderId,
      cost_cents: CHECKR_COST_CENTS,
      metadata: { package: CHECKR_PACKAGE_SLUG, report_id: report.id, candidate_id: order.checkr_candidate_id },
    })

    await admin.from('screening_orders').update({
      checkr_report_id: report.id,
      checkr_data: { status: report.status ?? 'pending', _initial: report },
    }).eq('id', orderId)

    return json({ ok: true, report_id: report.id, status: report.status ?? 'pending' })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
