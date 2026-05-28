// ⚠️ INACTIVE (as of 2026-05) — Checkr is NOT a live integration. This is
// only ever called from ScreeningFlow when require_criminal_check=true, which
// the manager UI cannot currently enable ("Coming soon" tile), so it never
// runs. It also requires CHECKR_API_KEY, which is unset in all environments.
// Kept as scaffolding. NOTE the SSN-handling posture below before reviving.
//
// Submit applicant identity to Checkr → receive candidate_id.
//
// SECURITY POSTURE: The full SSN is forwarded directly from the applicant's
// browser to this edge function, then immediately to Checkr's API. It is
// NEVER persisted to our database, NEVER logged, NEVER stored in cache.
// Once Checkr returns the candidate_id, we store only that id on the
// screening_order. Checkr holds the SSN under their FCRA + SOC-2 posture.
//
// Called by ScreeningFlow.tsx right before the payment step, only when the
// property has require_criminal_check=true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logApiCall, timed } from '../_shared/logging.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'

const CHECKR_API_BASE = Deno.env.get('CHECKR_API_BASE') ?? 'https://api.checkr.com/v1'
const CHECKR_API_KEY  = Deno.env.get('CHECKR_API_KEY') ?? ''

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function checkrAuthHeader(): string {
  // Checkr uses HTTP Basic with the API key as the username and no password.
  return 'Basic ' + btoa(`${CHECKR_API_KEY}:`)
}

interface CheckrCandidatePayload {
  first_name: string
  last_name: string
  middle_name?: string
  no_middle_name?: boolean
  dob: string          // YYYY-MM-DD
  ssn: string          // 9 digits, no dashes (Checkr accepts both formats)
  email: string
  phone?: string
  zipcode: string
  driver_license_number?: string
  driver_license_state?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (!CHECKR_API_KEY) return json(req, { error: 'Checkr integration not configured' }, { status: 500 })

  // Rate limit — SSN-handling endpoint, strict. 3 per minute per IP.
  const ip = clientIp(req)
  const allowed = await checkRateLimit({ key: `submit-checkr:${ip}`, windowSeconds: 60, maxCount: 3 })
  if (!allowed) {
    return json(req, { error: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await req.json() as {
      orderId?: string
      ssn?: string
      middle_name?: string
      no_middle_name?: boolean
    }
    if (!body.orderId || !body.ssn) {
      return json(req, { error: 'orderId and ssn required' }, { status: 400 })
    }
    // Normalize SSN — strip dashes/spaces. Validate 9 digits.
    const ssn = body.ssn.replace(/[^0-9]/g, '')
    if (ssn.length !== 9) return json(req, { error: 'SSN must be 9 digits' }, { status: 400 })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: order, error: orderErr } = await admin
      .from('screening_orders')
      .select('id, application_id, addon_criminal_check, checkr_candidate_id, dl_extracted')
      .eq('id', body.orderId)
      .single()
    if (orderErr || !order) return json(req, { error: 'Order not found' }, { status: 404 })
    if (!order.addon_criminal_check) return json(req, { error: 'Criminal check not enabled for this order' }, { status: 400 })
    if (order.checkr_candidate_id)   return json(req, { ok: true, candidate_id: order.checkr_candidate_id, already_existed: true })

    const { data: app } = await admin
      .from('applications')
      .select('first_name, last_name, email, phone, date_of_birth, current_zip')
      .eq('id', order.application_id)
      .single()
    if (!app) return json(req, { error: 'Application not found' }, { status: 404 })

    // Prefer DL-extracted address (more authoritative) and fall back to typed.
    const dl = order.dl_extracted as { zip?: string; license_number?: string; issuing_state?: string } | null
    const zipcode = dl?.zip ?? app.current_zip ?? ''
    if (!app.date_of_birth) return json(req, { error: 'Date of birth missing on application' }, { status: 400 })

    const payload: CheckrCandidatePayload = {
      first_name: app.first_name,
      last_name: app.last_name,
      no_middle_name: body.no_middle_name ?? !body.middle_name,
      middle_name: body.middle_name || undefined,
      dob: String(app.date_of_birth),
      ssn,
      email: app.email,
      phone: app.phone || undefined,
      zipcode,
      driver_license_number: dl?.license_number || undefined,
      driver_license_state: dl?.issuing_state || undefined,
    }

    const { result: resp, latency_ms: callLatency } = await timed(() => fetch(`${CHECKR_API_BASE}/candidates`, {
      method: 'POST',
      headers: {
        'Authorization': checkrAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }))
    if (!resp.ok) {
      const errBody = await resp.text()
      await logApiCall({
        function_name: 'submit-checkr-candidate', vendor: 'checkr',
        latency_ms: callLatency, reference_id: body.orderId,
        status_code: resp.status, error_message: errBody.slice(0, 500),
      })
      return json(req, { error: `Checkr candidate create failed (${resp.status})`, detail: errBody }, { status: 502 })
    }
    const candidate = await resp.json() as { id?: string }
    if (!candidate.id) return json(req, { error: 'Checkr returned no candidate id' }, { status: 502 })

    // Candidate creation is free at Checkr (cost is charged when the report
    // is created in run-criminal-check). Log latency + status only.
    await logApiCall({
      function_name: 'submit-checkr-candidate', vendor: 'checkr',
      latency_ms: callLatency, reference_id: body.orderId,
      metadata: { candidate_id: candidate.id },
    })

    await admin.from('screening_orders').update({
      checkr_candidate_id: candidate.id,
    }).eq('id', body.orderId)

    return json(req, { ok: true, candidate_id: candidate.id })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
