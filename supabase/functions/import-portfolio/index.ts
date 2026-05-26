// Bulk portfolio import — Avail / TurboTenant / generic CSV migration.
//
// Takes pre-parsed JSON from the client wizard (the client does CSV parsing
// + previews so users see what they're importing before we touch the DB).
// We do all the dependency-aware writes here, server-side, with the manager's
// JWT validated up front.
//
// Order of operations:
//   1. Validate the calling user is the manager (auth.getUser() on the JWT)
//   2. Create properties — dedupe by (manager_id, address)
//   3. Create units    — dedupe by (property_id, unit_number)
//   4. Invite tenants  — via existing invite-tenant flow (auth user + magic
//                        link + email). Existing emails resolved to their
//                        profile_id; new emails get a fresh auth user.
//   5. Create leases   — link tenant + unit, default status='pending' so the
//                        manager can review before activating. (Manager
//                        explicitly activates to trigger payment schedules
//                        + Stripe quantity sync.)
//   6. Return counts + a per-row error report
//
// Idempotency: re-running with the same input should produce the same
// portfolio without duplicates. Dedupe checks happen against the manager's
// existing data, not just within the request payload.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { logApiCall } from '../_shared/logging.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' })

interface PropertyInput {
  name: string | null
  address: string
  city: string
  state: string                // 2-letter
  zip: string
  property_type?: string | null
}

interface UnitInput {
  property_index: number       // index into properties[] above
  unit_number: string
  rent_amount: number
  bedrooms?: number | null
  bathrooms?: number | null
}

// Single-tenant input — legacy shape (used by generic CSV imports that
// don't have co-tenants). Each row becomes one lease with one tenant.
interface TenantInput {
  property_index: number
  unit_number: string
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  rent_amount: number
  security_deposit?: number | null
  lease_start: string
  lease_end: string
}

// Multi-tenant input — new shape for Avail-style imports where co-tenants
// share a single lease. Each LeaseInput creates ONE lease + N tenants
// linked via the lease_tenants join table.
interface LeaseTenantInput {
  first_name: string
  last_name: string
  email: string
  phone?: string | null
}
interface LeaseInput {
  property_index: number
  unit_number: string
  rent_amount: number
  security_deposit?: number | null
  lease_start: string                // YYYY-MM-DD
  lease_end: string                  // YYYY-MM-DD
  bedrooms?: number | null
  bathrooms?: number | null
  tenants: LeaseTenantInput[]        // primary = tenants[0]
  // If the manager attached an existing signed lease PDF, the client uploads
  // it to `lease-documents` first and passes the storage path here. We then
  // mark the lease status='active' (no need to re-sign) and insert a
  // documents row pointing at the PDF.
  existing_lease_path?: string | null
  existing_lease_filename?: string | null
  // TRUE when the rent roll's lease_end is in the past — the tenant has
  // rolled past their fixed term onto a month-to-month tenancy. The lease
  // still imports as active (the tenancy is ongoing) regardless of whether
  // a PDF was attached.
  month_to_month?: boolean
}

interface ImportPayload {
  source: string                     // 'avail' | 'turbotenant' | 'csv' — for telemetry
  properties: PropertyInput[]
  units: UnitInput[]
  // One of these two will be set. `leases` is the new canonical shape;
  // `tenants` is the legacy single-tenant-per-row shape that we normalize
  // into `leases` at the top of the handler.
  leases?: LeaseInput[]
  tenants?: TenantInput[]
}

interface RowError {
  scope: 'property' | 'unit' | 'tenant' | 'lease'
  index: number
  message: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// Normalize an address for dedupe — strip casing, punctuation, double-spaces.
function normAddress(s: string): string {
  return (s ?? '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)

  try {
    const payload = await req.json() as ImportPayload
    if (!payload?.properties?.length) {
      return json(req, { error: 'No properties to import' }, { status: 400 })
    }

    // ── Validate caller ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json(req, { error: 'Not authenticated' }, { status: 401 })
    }
    const managerId = userData.user.id

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Confirm the caller is actually a manager
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, email, full_name, stripe_subscription_item_id')
      .eq('id', managerId)
      .single()
    if (!profile || (profile.role !== 'manager' && profile.role !== 'admin')) {
      return json(req, { error: 'Manager role required' }, { status: 403 })
    }

    const errors: RowError[] = []
    let propertiesCreated = 0
    let unitsCreated = 0
    let tenantsInvited = 0
    let tenantsLinked = 0   // already had a profile
    let leasesCreated = 0
    let leasesActivated = 0    // imported with executed PDF → status='active'
    let leasesUpcoming = 0     // future-dated start + executed PDF → status='upcoming'

    // ── 1. Properties — dedupe by (manager_id, address) ─────────────────
    // Map: payload index → property_id
    const propertyIdByIndex: (string | null)[] = []

    // Fetch existing properties for this manager so we can dedupe
    const { data: existing } = await admin
      .from('properties')
      .select('id, address, city, state, zip')
      .eq('manager_id', managerId)
    const existingByAddr = new Map<string, string>()
    for (const p of existing ?? []) {
      const key = `${normAddress(p.address)}|${(p.state ?? '').toUpperCase()}|${(p.zip ?? '').replace(/\D/g, '')}`
      existingByAddr.set(key, p.id)
    }

    for (let i = 0; i < payload.properties.length; i++) {
      const p = payload.properties[i]
      const dedupeKey = `${normAddress(p.address)}|${(p.state ?? '').toUpperCase()}|${(p.zip ?? '').replace(/\D/g, '')}`
      const hit = existingByAddr.get(dedupeKey)
      if (hit) {
        propertyIdByIndex[i] = hit
        continue
      }
      const { data: inserted, error: insErr } = await admin.from('properties').insert({
        manager_id: managerId,
        name: p.name?.trim() || `${p.address}, ${p.city}`,
        address: p.address.trim(),
        city: p.city.trim(),
        state: (p.state ?? '').trim().toUpperCase(),
        zip: (p.zip ?? '').trim(),
      }).select('id').single()
      if (insErr || !inserted) {
        propertyIdByIndex[i] = null
        errors.push({ scope: 'property', index: i, message: insErr?.message ?? 'Insert failed' })
        continue
      }
      propertyIdByIndex[i] = inserted.id
      existingByAddr.set(dedupeKey, inserted.id)
      propertiesCreated++
    }

    // ── 2. Units — dedupe by (property_id, unit_number) ─────────────────
    // Map: `${propertyIndex}|${unit_number}` → unit_id
    const unitIdByKey = new Map<string, string>()

    // Preload existing units under the touched properties so we dedupe
    // against what's already in the DB.
    const propertyIds = propertyIdByIndex.filter((x): x is string => !!x)
    if (propertyIds.length) {
      const { data: existingUnits } = await admin
        .from('units')
        .select('id, property_id, unit_number')
        .in('property_id', propertyIds)
      for (const u of existingUnits ?? []) {
        const pIdx = propertyIdByIndex.findIndex((id) => id === u.property_id)
        if (pIdx >= 0) unitIdByKey.set(`${pIdx}|${u.unit_number.trim().toLowerCase()}`, u.id)
      }
    }

    for (let i = 0; i < payload.units.length; i++) {
      const u = payload.units[i]
      const propId = propertyIdByIndex[u.property_index]
      if (!propId) {
        errors.push({ scope: 'unit', index: i, message: 'Parent property failed to create' })
        continue
      }
      const key = `${u.property_index}|${u.unit_number.trim().toLowerCase()}`
      if (unitIdByKey.has(key)) continue  // already exists

      const { data: inserted, error: insErr } = await admin.from('units').insert({
        property_id: propId,
        unit_number: u.unit_number.trim(),
        rent_amount: u.rent_amount,
        bedrooms: u.bedrooms ?? null,
        bathrooms: u.bathrooms ?? null,
        status: 'vacant',
      }).select('id').single()
      if (insErr || !inserted) {
        errors.push({ scope: 'unit', index: i, message: insErr?.message ?? 'Insert failed' })
        continue
      }
      unitIdByKey.set(key, inserted.id)
      unitsCreated++
    }

    // ── 3 + 4. Tenants + Leases — one lease, N co-tenants ──────────────
    // Normalize legacy single-tenant payload into the new multi-tenant
    // shape so the rest of this function only has to handle one path.
    const normalizedLeases: LeaseInput[] = payload.leases ?? (payload.tenants ?? []).map((t) => ({
      property_index: t.property_index,
      unit_number: t.unit_number,
      rent_amount: t.rent_amount,
      security_deposit: t.security_deposit,
      lease_start: t.lease_start,
      lease_end: t.lease_end,
      tenants: [{ first_name: t.first_name, last_name: t.last_name, email: t.email, phone: t.phone }],
    }))

    // Vendor display label for the migration email
    const vendorLabel: Record<string, string> = {
      avail: 'Avail', buildium: 'Buildium', doorloop: 'DoorLoop',
      tenantcloud: 'TenantCloud', appfolio: 'AppFolio',
      turbotenant: 'TurboTenant', csv: 'your previous platform',
    }
    const migrationFromLabel = vendorLabel[payload.source] ?? 'your previous platform'

    // Cache to avoid re-inviting the same email if it appears across
    // multiple leases (rare, but possible for landlords with same-person
    // tenants on multiple units).
    const tenantIdByEmail = new Map<string, string>()

    for (let leaseIdx = 0; leaseIdx < normalizedLeases.length; leaseIdx++) {
      const lease = normalizedLeases[leaseIdx]
      const unitKey = `${lease.property_index}|${lease.unit_number.trim().toLowerCase()}`
      const unitId = unitIdByKey.get(unitKey)
      if (!unitId) {
        errors.push({ scope: 'lease', index: leaseIdx, message: `Unit ${lease.unit_number} not found` })
        continue
      }

      // Invite every tenant on this lease. Skip rows with missing email
      // but continue with the rest — a lease with at least one valid
      // tenant still creates correctly.
      const resolvedTenants: Array<{ tenantId: string; email: string }> = []
      for (let tIdx = 0; tIdx < lease.tenants.length; tIdx++) {
        const t = lease.tenants[tIdx]
        const email = (t.email ?? '').trim().toLowerCase()
        if (!email) {
          errors.push({ scope: 'tenant', index: leaseIdx, message: `Lease ${leaseIdx + 1} tenant #${tIdx + 1}: missing email` })
          continue
        }
        // Dedupe — if we already invited this email on a prior lease, reuse.
        if (tenantIdByEmail.has(email)) {
          resolvedTenants.push({ tenantId: tenantIdByEmail.get(email)!, email })
          continue
        }
        const { data: inviteResp, error: invErr } = await admin.functions.invoke('invite-tenant', {
          body: {
            email,
            full_name: `${t.first_name} ${t.last_name}`.trim(),
            phone: t.phone ?? null,
            migrationFrom: migrationFromLabel,
          },
          headers: { Authorization: authHeader },
        })
        if (invErr || !inviteResp?.tenantId) {
          errors.push({ scope: 'tenant', index: leaseIdx, message: `${email}: ${invErr?.message ?? 'invite failed'}` })
          continue
        }
        tenantIdByEmail.set(email, inviteResp.tenantId)
        resolvedTenants.push({ tenantId: inviteResp.tenantId, email })
        if (inviteResp.alreadyExists) tenantsLinked++
        else tenantsInvited++
      }

      if (resolvedTenants.length === 0) {
        errors.push({ scope: 'lease', index: leaseIdx, message: 'No valid tenants on this lease — skipped' })
        continue
      }

      const primaryTenantId = resolvedTenants[0].tenantId

      // Idempotency — skip if a lease with this primary tenant + unit + start already exists
      const { data: dup } = await admin
        .from('leases')
        .select('id')
        .eq('tenant_id', primaryTenantId)
        .eq('unit_id', unitId)
        .eq('start_date', lease.lease_start)
        .maybeSingle()
      if (dup) continue

      // Lease status logic — covers four real-world states:
      //   1. month_to_month=true → 'active'
      //      Tenancy continuing past its term by statute. PDF optional.
      //   2. start_date > today + PDF attached → 'upcoming'
      //      Contract is signed, tenant hasn't moved in yet.
      //   3. PDF attached (current term) → 'active'
      //      Executed agreement on file, tenant is in the unit.
      //   4. No PDF → 'pending'
      //      Needs a FindStoop agreement before activation.
      const hasExistingLease = !!lease.existing_lease_path
      const isM2M = lease.month_to_month === true
      const todayIso = new Date().toISOString().slice(0, 10)
      const startsFuture = lease.lease_start > todayIso
      let leaseStatus: 'active' | 'upcoming' | 'pending'
      if (isM2M) leaseStatus = 'active'
      else if (startsFuture && hasExistingLease) leaseStatus = 'upcoming'
      else if (hasExistingLease) leaseStatus = 'active'
      else leaseStatus = 'pending'
      const { data: insertedLease, error: leaseErr } = await admin.from('leases').insert({
        unit_id: unitId,
        tenant_id: primaryTenantId,
        start_date: lease.lease_start,
        end_date: lease.lease_end,
        rent_amount: lease.rent_amount,
        security_deposit: lease.security_deposit ?? null,
        status: leaseStatus,
        month_to_month: isM2M,
      }).select('id').single()
      if (leaseErr || !insertedLease) {
        errors.push({ scope: 'lease', index: leaseIdx, message: leaseErr?.message ?? 'Lease insert failed' })
        continue
      }
      leasesCreated++
      if (leaseStatus === 'active') leasesActivated++
      else if (leaseStatus === 'upcoming') leasesUpcoming++

      // Set unit to occupied only for currently-active tenancies. Upcoming
      // leases haven't moved in yet — unit stays vacant until move-in.
      if (leaseStatus === 'active') {
        try {
          await admin.from('units').update({ status: 'occupied' }).eq('id', unitId)
        } catch { /* non-fatal */ }
      }

      // All tenants on this lease land in lease_tenants. Primary = first.
      for (let i = 0; i < resolvedTenants.length; i++) {
        try {
          await admin.from('lease_tenants').upsert({
            lease_id: insertedLease.id,
            tenant_id: resolvedTenants[i].tenantId,
            is_primary: i === 0,
            sort_order: i,
          }, { onConflict: 'lease_id,tenant_id' })
        } catch { /* non-fatal — primary tenant is on leases.tenant_id either way */ }
      }

      // Record the executed PDF in documents so it shows up under the lease.
      if (hasExistingLease && lease.existing_lease_path) {
        try {
          await admin.from('documents').insert({
            lease_id: insertedLease.id,
            uploaded_by: managerId,
            name: lease.existing_lease_filename || 'Signed lease (imported)',
            type: 'lease',
            storage_url: lease.existing_lease_path,
          })
        } catch (e) {
          // Non-fatal — the lease is still created and active. We log it
          // so the manager can attach the doc manually if needed.
          errors.push({
            scope: 'lease',
            index: leaseIdx,
            message: `Lease imported but PDF link failed: ${e instanceof Error ? e.message : 'unknown'}`,
          })
        }
      }
    }

    // ── 5. Bump Stripe subscription quantity for newly-active leases ────
    // Pending leases stay off the bill until the manager activates them.
    // Active leases (those that came in with an executed PDF) DO count
    // immediately — invoke stripe-sync-quantity once after all inserts.
    if (leasesActivated > 0 && profile.stripe_subscription_item_id) {
      try {
        await admin.functions.invoke('stripe-sync-quantity', {
          body: { manager_id: managerId },
          headers: { Authorization: authHeader },
        })
      } catch {
        // Non-fatal — sync can be retried via the next manager-side
        // activation. The leases themselves are correctly active.
      }
    }

    // Record the import for telemetry + feedback. The wizard hands the
    // returned import_id back to the manager so they can submit a rating
    // and free-text feedback from the "Done" step.
    // Roll up counts using the normalized lease shape (works for both
    // legacy single-tenant and new multi-tenant payloads).
    const tenantsInPayload = normalizedLeases.reduce((sum, l) => sum + l.tenants.length, 0)
    const leasesInPayload = normalizedLeases.length

    const { data: importRow } = await admin.from('portfolio_imports').insert({
      manager_id: managerId,
      source: payload.source,
      properties_in: payload.properties.length,
      units_in: payload.units.length,
      tenants_in: tenantsInPayload,
      properties_created: propertiesCreated,
      units_created: unitsCreated,
      tenants_invited: tenantsInvited,
      tenants_linked: tenantsLinked,
      leases_created: leasesCreated,
      errors: errors.length ? errors : null,
    }).select('id').single()

    await logApiCall({
      function_name: 'import-portfolio',
      reference_id: importRow?.id ?? managerId,
      metadata: {
        source: payload.source,
        properties_in: payload.properties.length,
        units_in: payload.units.length,
        tenants_in: tenantsInPayload,
        leases_in: leasesInPayload,
        properties_created: propertiesCreated,
        units_created: unitsCreated,
        tenants_invited: tenantsInvited,
        tenants_linked: tenantsLinked,
        leases_created: leasesCreated,
        errors_count: errors.length,
      },
    })

    return json(req, {
      ok: true,
      import_id: importRow?.id ?? null,
      counts: {
        properties_created: propertiesCreated,
        properties_total: payload.properties.length,
        units_created: unitsCreated,
        units_total: payload.units.length,
        tenants_invited: tenantsInvited,
        tenants_linked: tenantsLinked,
        leases_created: leasesCreated,
        leases_activated: leasesActivated,
        leases_upcoming: leasesUpcoming,
        leases_total: leasesInPayload,
      },
      errors,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logApiCall({ function_name: 'import-portfolio', status_code: 500, error_message: msg })
    return json(req, { error: msg }, { status: 500 })
  }
})

// Touched stripe symbol once so the bundler keeps it for future use
// (subscription sync once auto-activate ships). Avoids unused-import lint.
void stripe
