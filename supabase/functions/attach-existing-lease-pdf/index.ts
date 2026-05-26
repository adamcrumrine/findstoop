// Attach an existing-signed-lease PDF to a lease that's already in the DB.
//
// Used by /manager/leases/attach — the post-import flow where the manager
// drops in PDFs they didn't have during the original migration. The client
// uploads the PDF to the `lease-documents` bucket first, then calls here
// with the lease_id + storage path. This function:
//
//   1. Validates the caller is the manager who owns the lease
//   2. Inserts a documents row (type='lease')
//   3. Flips lease status:
//        • pending + start_date > today → 'upcoming'
//        • pending + start_date <= today → 'active'
//        • upcoming → stays 'upcoming' (it already had a signed PDF
//          attached at import; this is a replacement / additional copy)
//        • active → stays 'active' (same)
//   4. Sets unit.status='occupied' if the lease just became active
//   5. Triggers stripe-sync-quantity if a new billable lease appeared
//
// Atomic-ish: if the documents insert fails after the status flip, we
// roll the status back. Single-attempt — caller is expected to retry on
// transient failures.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { logApiCall } from '../_shared/logging.ts'

interface AttachInput {
  lease_id: string
  storage_path: string          // path returned by storage.upload to 'lease-documents'
  filename: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    const payload = await req.json() as AttachInput
    if (!payload?.lease_id || !payload?.storage_path) {
      return json(req, { ok: false, message: 'lease_id and storage_path required' }, { status: 400 })
    }

    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json(req, { ok: false, message: 'Not authenticated' }, { status: 401 })
    }
    const managerId = userData.user.id

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ── Validate ownership ──────────────────────────────────────────────
    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, status, start_date, unit_id, units!inner(id, property_id, properties!inner(manager_id))')
      .eq('id', payload.lease_id)
      .single()
    if (leaseErr || !lease) {
      return json(req, { ok: false, message: 'Lease not found' }, { status: 404 })
    }
    type LeaseRow = { units: { properties: { manager_id: string } } }
    const propManager = (lease as unknown as LeaseRow).units.properties.manager_id
    if (propManager !== managerId) {
      return json(req, { ok: false, message: 'Not your lease' }, { status: 403 })
    }

    // ── Determine new status ────────────────────────────────────────────
    // Executed-lease attach: pending → upcoming (if start > today) or
    // active (if start <= today). Other statuses left alone.
    const todayIso = new Date().toISOString().slice(0, 10)
    const currentStatus = lease.status as string
    const startsFuture = (lease.start_date as string) > todayIso
    let newStatus: string = currentStatus
    if (currentStatus === 'pending') {
      newStatus = startsFuture ? 'upcoming' : 'active'
    }
    // 'active', 'upcoming', 'expired', 'terminated' — leave alone.
    const becameBillable = currentStatus === 'pending' && newStatus === 'active'

    // ── Apply status flip first (so we can roll back if doc insert fails)
    if (newStatus !== currentStatus) {
      const { error: updErr } = await admin
        .from('leases')
        .update({ status: newStatus })
        .eq('id', payload.lease_id)
      if (updErr) {
        return json(req, { ok: false, message: `Status flip failed: ${updErr.message}` }, { status: 500 })
      }
    }

    // ── Insert documents row ────────────────────────────────────────────
    const { error: docErr } = await admin.from('documents').insert({
      lease_id: payload.lease_id,
      uploaded_by: managerId,
      name: payload.filename || 'Signed lease (uploaded)',
      type: 'lease',
      storage_url: payload.storage_path,
    })
    if (docErr) {
      // Roll back status flip
      if (newStatus !== currentStatus) {
        await admin.from('leases').update({ status: currentStatus }).eq('id', payload.lease_id)
      }
      return json(req, { ok: false, message: `Document insert failed: ${docErr.message}` }, { status: 500 })
    }

    // ── Side effects ────────────────────────────────────────────────────
    if (newStatus === 'active' && currentStatus !== 'active') {
      try {
        await admin.from('units').update({ status: 'occupied' }).eq('id', lease.unit_id)
      } catch { /* non-fatal */ }
    }

    if (becameBillable) {
      try {
        await admin.functions.invoke('stripe-sync-quantity', {
          body: { manager_id: managerId },
          headers: { Authorization: authHeader },
        })
      } catch { /* non-fatal — will retry on next activation */ }
    }

    await logApiCall({
      function_name: 'attach-existing-lease-pdf',
      reference_id: payload.lease_id,
      metadata: { previous_status: currentStatus, new_status: newStatus, became_billable: becameBillable },
    })

    return json(req, {
      ok: true,
      lease_id: payload.lease_id,
      previous_status: currentStatus,
      new_status: newStatus,
      became_billable: becameBillable,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'attach-existing-lease-pdf', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: msg }, { status: 500 })
  }
})
