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

interface TenantInput {
  property_index: number       // which property the tenant belongs to
  unit_number: string          // matches a unit by (property_index, unit_number)
  first_name: string
  last_name: string
  email: string
  phone?: string | null
  rent_amount: number
  security_deposit?: number | null
  lease_start: string          // YYYY-MM-DD
  lease_end: string            // YYYY-MM-DD
}

interface ImportPayload {
  source: string               // 'avail' | 'turbotenant' | 'csv' — for telemetry
  properties: PropertyInput[]
  units: UnitInput[]
  tenants: TenantInput[]
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

    // ── 3. Tenants — invite via existing edge function ──────────────────
    // We invoke invite-tenant rather than re-implementing the auth-link
    // generation, so the email + audit trail stay consistent.
    // Map: tenant payload index → { tenantId, email }
    const tenantIdByIndex: Array<{ tenantId: string | null; email: string }> = []

    for (let i = 0; i < payload.tenants.length; i++) {
      const t = payload.tenants[i]
      const email = t.email.trim().toLowerCase()
      if (!email) {
        tenantIdByIndex[i] = { tenantId: null, email }
        errors.push({ scope: 'tenant', index: i, message: 'Missing email' })
        continue
      }
      // Vendor display labels — used in the migration email subject + body
      // so the tenant knows where the move came from.
      const vendorLabel: Record<string, string> = {
        avail: 'Avail', buildium: 'Buildium', doorloop: 'DoorLoop',
        tenantcloud: 'TenantCloud', appfolio: 'AppFolio',
        turbotenant: 'TurboTenant', csv: 'your previous platform',
      }
      const { data: inviteResp, error: invErr } = await admin.functions.invoke('invite-tenant', {
        body: {
          email,
          full_name: `${t.first_name} ${t.last_name}`.trim(),
          phone: t.phone ?? null,
          // Branded migration-style email instead of cold invite copy.
          migrationFrom: vendorLabel[payload.source] ?? 'your previous platform',
        },
        headers: { Authorization: authHeader },
      })
      if (invErr || !inviteResp?.tenantId) {
        tenantIdByIndex[i] = { tenantId: null, email }
        errors.push({ scope: 'tenant', index: i, message: invErr?.message ?? 'Invite failed' })
        continue
      }
      tenantIdByIndex[i] = { tenantId: inviteResp.tenantId, email }
      if (inviteResp.alreadyExists) tenantsLinked++
      else tenantsInvited++
    }

    // ── 4. Leases — one per tenant row, status='pending' ────────────────
    for (let i = 0; i < payload.tenants.length; i++) {
      const t = payload.tenants[i]
      const tenantRef = tenantIdByIndex[i]
      if (!tenantRef?.tenantId) continue  // already errored
      const unitKey = `${t.property_index}|${t.unit_number.trim().toLowerCase()}`
      const unitId = unitIdByKey.get(unitKey)
      if (!unitId) {
        errors.push({ scope: 'lease', index: i, message: `Unit ${t.unit_number} not found` })
        continue
      }

      // Avoid duplicate lease — same tenant + unit + start date
      const { data: dup } = await admin
        .from('leases')
        .select('id')
        .eq('tenant_id', tenantRef.tenantId)
        .eq('unit_id', unitId)
        .eq('start_date', t.lease_start)
        .maybeSingle()
      if (dup) continue

      const { data: insertedLease, error: leaseErr } = await admin.from('leases').insert({
        unit_id: unitId,
        tenant_id: tenantRef.tenantId,
        start_date: t.lease_start,
        end_date: t.lease_end,
        rent_amount: t.rent_amount,
        security_deposit: t.security_deposit ?? null,
        status: 'pending',
      }).select('id').single()
      if (leaseErr || !insertedLease) {
        errors.push({ scope: 'lease', index: i, message: leaseErr?.message ?? 'Insert failed' })
        continue
      }
      leasesCreated++

      // Mirror the primary tenant into lease_tenants for co-tenant support.
      // Best-effort — failure here doesn't fail the import.
      try {
        await admin.from('lease_tenants').upsert({
          lease_id: insertedLease.id,
          tenant_id: tenantRef.tenantId,
          is_primary: true,
          sort_order: 0,
        }, { onConflict: 'lease_id,tenant_id' })
      } catch { /* non-fatal */ }
    }

    // ── 5. Bump Stripe subscription quantity ────────────────────────────
    // Imported leases land in 'pending' — they won't count toward the
    // manager's subscription until the manager activates them. So we don't
    // need to call stripe-sync-quantity right now. (Sync happens on lease
    // activation via the existing manager-side flow.)
    // Kept here as a comment so a future change to default-active imports
    // doesn't forget the sync step.

    // Record the import for telemetry + feedback. The wizard hands the
    // returned import_id back to the manager so they can submit a rating
    // and free-text feedback from the "Done" step.
    const { data: importRow } = await admin.from('portfolio_imports').insert({
      manager_id: managerId,
      source: payload.source,
      properties_in: payload.properties.length,
      units_in: payload.units.length,
      tenants_in: payload.tenants.length,
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
        tenants_in: payload.tenants.length,
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
        leases_total: payload.tenants.length,
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
