// Replace the executed PDF on an existing lease — and swap the tenants in
// the same atomic operation.
//
// Use case: manager uploaded the wrong PDF, or the AI extraction picked
// the wrong tenants. Instead of detaching and re-attaching (multi-step,
// risky), the manager opens "Replace signed PDF" on ReviewLease, drops a
// new PDF, confirms the extracted tenant list, and this function does the
// swap.
//
// Pipeline:
//   1. Validate the caller owns the lease.
//   2. Resolve / silently-invite each new tenant (skipEmail=true so no
//      welcome email — the lease was already executed).
//   3. Delete the current type='lease' documents row(s) for this lease.
//   4. Insert the new documents row pointing at the new storage path.
//   5. Wipe + reinsert lease_tenants for the new tenant list.
//   6. The sync_primary_tenant_to_lease trigger keeps leases.tenant_id in sync.
//
// What we DON'T touch:
//   • leases.document_url — the protect_executed_lease_document_url
//     trigger guards this; the executed PDF in documents is authoritative.
//   • lease dates, rent, deposits — those stay as the manager set them.
//     If the new PDF's dates differ, the manager edits them via ReviewLease
//     after the swap (auto-save persists).
//
// The old PDF's storage object is left in place (orphaned but recoverable).
// We don't hard-delete because it's the only audit trail of what the
// previous "executed" lease was.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { logApiCall } from '../_shared/logging.ts'

interface TenantInput {
  email: string
  first_name: string
  last_name: string
  phone?: string | null
}

interface ReplaceInput {
  lease_id: string
  new_storage_path: string      // path returned by storage.upload to 'lease-documents'
  new_filename: string
  tenants: TenantInput[]        // primary = tenants[0]
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
    const payload = await req.json() as ReplaceInput
    if (!payload.lease_id || !payload.new_storage_path || !Array.isArray(payload.tenants) || payload.tenants.length === 0) {
      return json(req, { ok: false, message: 'lease_id, new_storage_path, and at least one tenant required' }, { status: 400 })
    }

    // Auth
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json(req, { ok: false, message: 'Not authenticated' }, { status: 401 })
    const managerId = userData.user.id

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify lease ownership
    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, units!inner(property:properties!inner(manager_id))')
      .eq('id', payload.lease_id)
      .single()
    if (leaseErr || !lease) return json(req, { ok: false, message: 'Lease not found' }, { status: 404 })
    type LeaseRow = { units: { property: { manager_id: string } } }
    if ((lease as unknown as LeaseRow).units.property.manager_id !== managerId) {
      return json(req, { ok: false, message: 'Not your lease' }, { status: 403 })
    }

    // ── Resolve / invite tenants (silent — no welcome emails) ───────────
    const resolvedTenants: Array<{ tenantId: string; email: string; invited: boolean }> = []
    for (let i = 0; i < payload.tenants.length; i++) {
      const t = payload.tenants[i]
      const email = (t.email ?? '').trim().toLowerCase()
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return json(req, { ok: false, message: `Tenant #${i + 1}: invalid email` }, { status: 400 })
      }
      if (!t.first_name?.trim() || !t.last_name?.trim()) {
        return json(req, { ok: false, message: `Tenant #${i + 1}: first and last name required` }, { status: 400 })
      }
      const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle()
      if (existing?.id) {
        resolvedTenants.push({ tenantId: existing.id, email, invited: false })
        continue
      }
      const { data: inv, error: invErr } = await admin.functions.invoke('invite-tenant', {
        body: {
          email,
          full_name: `${t.first_name.trim()} ${t.last_name.trim()}`,
          phone: t.phone ?? null,
          skipEmail: true,
        },
        headers: { Authorization: authHeader },
      })
      if (invErr || !inv?.tenantId) {
        return json(req, { ok: false, message: `Could not create profile for ${email}: ${invErr?.message ?? inv?.error ?? 'unknown'}` }, { status: 500 })
      }
      resolvedTenants.push({ tenantId: inv.tenantId, email, invited: true })
    }

    // ── Swap documents row ──────────────────────────────────────────────
    // Delete the existing executed-lease document(s). There should be at
    // most one, but defensive in case of dupes.
    const { error: delDocsErr } = await admin
      .from('documents')
      .delete()
      .eq('lease_id', payload.lease_id)
      .eq('type', 'lease')
    if (delDocsErr) {
      return json(req, { ok: false, message: `Could not detach old PDF: ${delDocsErr.message}` }, { status: 500 })
    }
    // Insert new documents row pointing at the freshly-uploaded PDF.
    const { error: insDocErr } = await admin.from('documents').insert({
      lease_id: payload.lease_id,
      uploaded_by: managerId,
      name: payload.new_filename || 'Signed lease (replaced)',
      type: 'lease',
      storage_url: payload.new_storage_path,
    })
    if (insDocErr) {
      return json(req, { ok: false, message: `Could not attach new PDF: ${insDocErr.message}` }, { status: 500 })
    }

    // ── Swap lease_tenants ──────────────────────────────────────────────
    const { error: delLtErr } = await admin
      .from('lease_tenants')
      .delete()
      .eq('lease_id', payload.lease_id)
    if (delLtErr) {
      return json(req, { ok: false, message: `Could not remove old tenants: ${delLtErr.message}` }, { status: 500 })
    }
    const ltRows = resolvedTenants.map((t, i) => ({
      lease_id: payload.lease_id,
      tenant_id: t.tenantId,
      is_primary: i === 0,
      sort_order: i,
    }))
    const { error: insLtErr } = await admin.from('lease_tenants').insert(ltRows)
    if (insLtErr) {
      return json(req, { ok: false, message: `Could not attach new tenants: ${insLtErr.message}` }, { status: 500 })
    }

    await logApiCall({
      function_name: 'replace-lease-pdf',
      reference_id: payload.lease_id,
      metadata: {
        tenant_count: resolvedTenants.length,
        invited_count: resolvedTenants.filter((t) => t.invited).length,
      },
    })

    return json(req, {
      ok: true,
      lease_id: payload.lease_id,
      tenant_count: resolvedTenants.length,
      invited_count: resolvedTenants.filter((t) => t.invited).length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'replace-lease-pdf', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: msg }, { status: 500 })
  }
})
