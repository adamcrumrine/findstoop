// Create a brand-new lease from an externally-signed PDF.
//
// Used in two flows:
//   • AttachLeases — manager has a signed lease for a tenant/unit that
//     wasn't in the original portfolio import.
//   • (future) Property detail page — same, but scoped to one property.
//
// Pipeline:
//   1. Validate caller is the manager who owns the target unit.
//   2. Resolve each tenant by email — if a profile exists, link it. If not,
//      invoke invite-tenant to create the auth user + send the invite, then
//      link the returned tenantId. Tenants with no name fail with a clear
//      error rather than creating a half-baked profile.
//   3. Idempotency: if a lease already exists for (unit, primary_tenant,
//      start_date), reuse it instead of creating a duplicate.
//   4. Insert the lease with the correct status:
//        • start > today  → 'upcoming'
//        • else           → 'active'
//   5. Insert lease_tenants for each tenant (primary = first).
//   6. Insert a documents row (type='lease') pointing at the storage path.
//   7. Side effects: unit → occupied if active, Stripe quantity sync if
//      newly billable.
//
// Storage upload happens client-side BEFORE calling this function — the
// client passes `storage_path` (already uploaded) + filename.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { logApiCall } from '../_shared/logging.ts'

interface TenantInput {
  email: string
  first_name: string
  last_name: string
  phone?: string | null
}

interface CreateInput {
  unit_id: string
  storage_path: string
  filename: string
  tenants: TenantInput[]    // primary = tenants[0]
  lease_start: string       // YYYY-MM-DD
  lease_end: string         // YYYY-MM-DD
  rent_amount: number
  security_deposit?: number | null
  month_to_month?: boolean
  // When true: tenants who aren't on FindStoop yet get their profile
  // created (so they're linked to the lease + can pay rent) but no welcome
  // email is sent. Manager invites them later from the Tenants screen.
  // This is the default for "save an executed lease" flows since the
  // tenants have already signed and don't need a fresh invite email.
  skip_invite_emails?: boolean
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
    const payload = await req.json() as CreateInput
    if (!payload.unit_id || !payload.storage_path || !Array.isArray(payload.tenants) || payload.tenants.length === 0) {
      return json(req, { ok: false, message: 'unit_id, storage_path, and at least one tenant required' }, { status: 400 })
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

    // Confirm manager owns the unit's property.
    const { data: unitRow, error: unitErr } = await admin
      .from('units')
      .select('id, rent_amount, property:properties!inner(id, manager_id)')
      .eq('id', payload.unit_id)
      .single()
    if (unitErr || !unitRow) {
      return json(req, { ok: false, message: 'Unit not found' }, { status: 404 })
    }
    type UnitRow = { property: { manager_id: string } }
    const propManager = (unitRow as unknown as UnitRow).property.manager_id
    if (propManager !== managerId) {
      return json(req, { ok: false, message: 'Not your unit' }, { status: 403 })
    }

    // ── Resolve / invite tenants ────────────────────────────────────────
    const resolvedTenants: Array<{ tenantId: string; email: string; invited: boolean }> = []
    for (let i = 0; i < payload.tenants.length; i++) {
      const t = payload.tenants[i]
      const email = (t.email ?? '').trim().toLowerCase()
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return json(req, { ok: false, message: `Tenant #${i + 1}: missing or invalid email` }, { status: 400 })
      }
      if (!t.first_name?.trim() || !t.last_name?.trim()) {
        return json(req, { ok: false, message: `Tenant #${i + 1}: first and last name required` }, { status: 400 })
      }
      // Check for existing profile.
      const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle()
      if (existing?.id) {
        resolvedTenants.push({ tenantId: existing.id, email, invited: false })
        continue
      }
      // Invite — uses the existing invite-tenant function so emails + auth
      // user creation are consistent with the import flow. When
      // skip_invite_emails is true, the profile is still created but no
      // welcome email goes out.
      const { data: inv, error: invErr } = await admin.functions.invoke('invite-tenant', {
        body: {
          email,
          full_name: `${t.first_name.trim()} ${t.last_name.trim()}`,
          phone: t.phone ?? null,
          skipEmail: payload.skip_invite_emails === true,
        },
        headers: { Authorization: authHeader },
      })
      if (invErr || !inv?.tenantId) {
        return json(req, { ok: false, message: `Could not invite ${email}: ${invErr?.message ?? inv?.error ?? 'unknown'}` }, { status: 500 })
      }
      resolvedTenants.push({ tenantId: inv.tenantId, email, invited: true })
    }

    const primaryTenantId = resolvedTenants[0].tenantId

    // ── Idempotency: bail if a lease already exists for this combo ──────
    const { data: dup } = await admin
      .from('leases')
      .select('id, status')
      .eq('tenant_id', primaryTenantId)
      .eq('unit_id', payload.unit_id)
      .eq('start_date', payload.lease_start)
      .maybeSingle()
    if (dup) {
      return json(req, {
        ok: true,
        lease_id: dup.id,
        status: dup.status,
        deduped: true,
        message: 'Lease already existed — no changes',
      })
    }

    // ── Status classification ───────────────────────────────────────────
    // Executed (signed) leases: 'active' if started, 'upcoming' if start
    // is still in the future. M2M is always 'active'.
    const todayIso = new Date().toISOString().slice(0, 10)
    const isM2M = payload.month_to_month === true
    const startsFuture = payload.lease_start > todayIso
    const status: 'active' | 'upcoming' = isM2M ? 'active' : (startsFuture ? 'upcoming' : 'active')

    // ── Create lease ────────────────────────────────────────────────────
    const { data: insertedLease, error: leaseErr } = await admin.from('leases').insert({
      unit_id: payload.unit_id,
      tenant_id: primaryTenantId,
      start_date: payload.lease_start,
      end_date: payload.lease_end,
      rent_amount: payload.rent_amount,
      security_deposit: payload.security_deposit ?? null,
      status,
      month_to_month: payload.month_to_month === true,
    }).select('id').single()
    if (leaseErr || !insertedLease) {
      return json(req, { ok: false, message: leaseErr?.message ?? 'Lease insert failed' }, { status: 500 })
    }

    // lease_tenants for all tenants (primary first).
    for (let i = 0; i < resolvedTenants.length; i++) {
      await admin.from('lease_tenants').upsert({
        lease_id: insertedLease.id,
        tenant_id: resolvedTenants[i].tenantId,
        is_primary: i === 0,
        sort_order: i,
      }, { onConflict: 'lease_id,tenant_id' })
    }

    // Documents row pointing at the uploaded PDF.
    await admin.from('documents').insert({
      lease_id: insertedLease.id,
      uploaded_by: managerId,
      name: payload.filename || 'Signed lease (uploaded)',
      type: 'lease',
      storage_url: payload.storage_path,
    })

    // ── Side effects ────────────────────────────────────────────────────
    if (status === 'active') {
      try {
        await admin.from('units').update({ status: 'occupied' }).eq('id', payload.unit_id)
      } catch { /* non-fatal */ }
      try {
        await admin.functions.invoke('stripe-sync-quantity', {
          body: { manager_id: managerId },
          headers: { Authorization: authHeader },
        })
      } catch { /* non-fatal */ }
    }

    await logApiCall({
      function_name: 'create-lease-from-pdf',
      reference_id: insertedLease.id,
      metadata: {
        unit_id: payload.unit_id,
        status,
        tenant_count: resolvedTenants.length,
        invited_count: resolvedTenants.filter((t) => t.invited).length,
      },
    })

    return json(req, {
      ok: true,
      lease_id: insertedLease.id,
      status,
      tenant_count: resolvedTenants.length,
      invited_count: resolvedTenants.filter((t) => t.invited).length,
      tenants: resolvedTenants.map((t) => ({ tenantId: t.tenantId, email: t.email, invited: t.invited })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'create-lease-from-pdf', status_code: 500, error_message: msg })
    return json(req, { ok: false, message: msg }, { status: 500 })
  }
})
