// update-tenant — landlord edits a tenant's contact details.
//
// Managers can read their tenants' profiles but RLS gives them no UPDATE path
// (profiles_update_own is the only update policy), and the login address lives
// in auth.users, which no client can touch at all. So the edit has to run here
// with the service role.
//
// The address is the reason this exists. A tenant whose university migrated her
// mailbox couldn't reach the address her account was keyed to, signed up again
// under the new one, and ended up with a second empty account while her lease
// and payment history stayed on the first. Changing profiles.email alone would
// NOT have fixed that — it doesn't move the login. This moves both.
//
// Auth: bearer token → manager/admin role → the tenant must actually be theirs,
// via get_manager_tenant_ids (which covers both leases.tenant_id and the
// lease_tenants junction, so co-tenants are editable too).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'

interface UpdateInput {
  tenant_id?: string
  full_name?: string | null
  email?: string | null
  phone?: string | null
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// Deliberately permissive — real addresses defeat strict patterns. We only
// reject what clearly can't be delivered to.
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const callerRole = (callerProfile as { role?: string } | null)?.role
    if (callerRole !== 'manager' && callerRole !== 'admin') {
      return json(req, { ok: false, message: 'Only landlords can edit tenants' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as UpdateInput
    const tenantId = (body.tenant_id ?? '').trim()
    if (!tenantId) return json(req, { ok: false, message: 'tenant_id required' }, { status: 400 })

    // ── Ownership ────────────────────────────────────────────────────────
    // Admins support any account; a manager may only edit a tenant on one of
    // their own leases.
    if (callerRole !== 'admin') {
      const { data: owned, error: ownErr } = await admin
        .rpc('get_manager_tenant_ids', { manager_uuid: user.id })
      if (ownErr) return json(req, { ok: false, message: 'Could not verify access' }, { status: 500 })
      const ids = ((owned ?? []) as unknown as Array<string | { get_manager_tenant_ids: string }>)
        .map((r) => (typeof r === 'string' ? r : r.get_manager_tenant_ids))
      if (!ids.includes(tenantId)) {
        return json(req, { ok: false, message: 'That tenant is not on any of your leases' }, { status: 403 })
      }
    }

    const { data: tenantProfile } = await admin
      .from('profiles').select('id, role, email, full_name, phone').eq('id', tenantId).maybeSingle()
    const tenant = tenantProfile as
      { id: string; role: string; email: string | null; full_name: string | null; phone: string | null } | null
    if (!tenant) return json(req, { ok: false, message: 'Tenant not found' }, { status: 404 })
    if (tenant.role !== 'tenant') {
      return json(req, { ok: false, message: 'Only tenant accounts can be edited here' }, { status: 400 })
    }

    // ── Build the profile patch ──────────────────────────────────────────
    const patch: Record<string, string | null> = {}

    if (body.full_name !== undefined) {
      const name = (body.full_name ?? '').trim()
      if (!name) return json(req, { ok: false, message: 'Name cannot be empty' }, { status: 400 })
      patch.full_name = name
    }

    if (body.phone !== undefined) {
      // Store digits only, matching what invite-tenant writes.
      const digits = (body.phone ?? '').replace(/\D/g, '')
      patch.phone = digits || null
    }

    let newEmail: string | null = null
    if (body.email !== undefined) {
      const email = (body.email ?? '').trim().toLowerCase()
      if (!looksLikeEmail(email)) {
        return json(req, { ok: false, code: 'bad_email', message: 'Enter a valid email address.' }, { status: 400 })
      }
      if (email !== (tenant.email ?? '').trim().toLowerCase()) newEmail = email
    }

    // ── Address collision ────────────────────────────────────────────────
    // If the address already belongs to someone else, stop and say so rather
    // than letting the auth update fail with a bare "email exists". This is
    // the duplicate-signup case: the tenant registered again under their new
    // address before asking. Merging two accounts is not something to do
    // silently — it decides which lease and payment history survives.
    if (newEmail) {
      const { data: clash } = await admin
        .from('profiles')
        .select('id, full_name, created_at')
        .ilike('email', newEmail)
        .neq('id', tenantId)
        .maybeSingle()
      const other = clash as { id: string; full_name: string | null; created_at: string } | null
      if (other) {
        const [{ count: leaseCount }, { count: payCount }] = await Promise.all([
          admin.from('lease_tenants').select('*', { count: 'exact', head: true }).eq('tenant_id', other.id),
          admin.from('payments').select('*', { count: 'exact', head: true }).eq('tenant_id', other.id),
        ])
        return json(req, {
          ok: false,
          code: 'email_in_use',
          message: `${newEmail} already belongs to another Stoop account`,
          conflict: {
            id: other.id,
            name: other.full_name,
            created_at: other.created_at,
            leases: leaseCount ?? 0,
            payments: payCount ?? 0,
          },
        }, { status: 409 })
      }
    }

    // ── Apply ────────────────────────────────────────────────────────────
    // Auth first: it is the change that can fail on a constraint. If the
    // profile write went first and this failed, the two would disagree about
    // the tenant's address, which is the exact confusion this endpoint exists
    // to end.
    if (newEmail) {
      const { error: authUpdErr } = await admin.auth.admin.updateUserById(tenantId, {
        email: newEmail,
        // The landlord is asserting the address on behalf of a tenant who, in
        // the motivating case, cannot receive mail at the old one — so a
        // confirmation round-trip through the old mailbox would strand them.
        email_confirm: true,
      })
      if (authUpdErr) {
        return json(req, {
          ok: false,
          code: 'auth_update_failed',
          message: authUpdErr.message || 'Could not update the sign-in address',
        }, { status: 400 })
      }
      // Reconcile the identity row's own copy of the address.
      await admin.rpc('sync_identity_email', { target_user: tenantId, new_email: newEmail })
      patch.email = newEmail
    }

    if (Object.keys(patch).length === 0) {
      return json(req, { ok: true, changed: false, tenant })
    }

    const { data: updated, error: updErr } = await admin
      .from('profiles').update(patch).eq('id', tenantId)
      .select('id, full_name, email, phone').single()
    if (updErr) {
      return json(req, { ok: false, message: updErr.message }, { status: 400 })
    }

    return json(req, { ok: true, changed: true, email_changed: !!newEmail, tenant: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json(req, { ok: false, message: msg }, { status: 500 })
  }
})
