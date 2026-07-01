// Resolves the signed-in tenant's landlord branding — company name, logo,
// accent color — so the tenant portal can dress itself in the landlord's
// brand (TenantLayout header + --brand-* palette override).
//
// Resolution mirrors the tenant Messages flow: current lease → unit →
// property → manager profile. RLS allows the profile read via
// "profiles_tenant_select_their_manager". Returns null while loading, when
// the tenant has no lease, or when the landlord set no branding at all — the
// caller then falls back to the build-time BRAND.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface LandlordBranding {
  companyName: string | null
  logoUrl: string | null
  /** 6-digit hex ("#2E5984") or null when the landlord kept the default palette. */
  brandColor: string | null
}

interface LeaseRow {
  status: string
  sent_for_signature_at: string | null
  unit: { properties: { manager_id: string | null } | null } | null
}

export function useLandlordBranding(tenantId: string | undefined): LandlordBranding | null {
  const [branding, setBranding] = useState<LandlordBranding | null>(null)

  useEffect(() => {
    if (!tenantId) { setBranding(null); return }
    let cancelled = false

    ;(async () => {
      // Same "current lease" priority as getTenantActiveLease: active →
      // upcoming → pending-and-sent, most recent first within a status.
      const { data } = await supabase
        .from('leases')
        .select('status, sent_for_signature_at, unit:units(properties(manager_id))')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'upcoming', 'pending'])
        .order('created_at', { ascending: false })
      if (cancelled) return

      const leases = (data ?? []) as unknown as LeaseRow[]
      const current =
        leases.find((l) => l.status === 'active') ??
        leases.find((l) => l.status === 'upcoming') ??
        leases.find((l) => l.status === 'pending' && l.sent_for_signature_at) ??
        null
      const managerId = current?.unit?.properties?.manager_id ?? null
      if (!managerId) { setBranding(null); return }

      const { data: manager } = await supabase
        .from('profiles')
        .select('company_name, company_logo_url, brand_color')
        .eq('id', managerId)
        .maybeSingle()
      if (cancelled) return

      const companyName = (manager?.company_name ?? '').trim() || null
      const logoUrl = manager?.company_logo_url ?? null
      const brandColor = manager?.brand_color ?? null
      // Nothing customized → report "no landlord branding" so the portal
      // renders the build brand untouched.
      if (!companyName && !logoUrl && !brandColor) { setBranding(null); return }
      setBranding({ companyName, logoUrl, brandColor })
    })()

    return () => { cancelled = true }
  }, [tenantId])

  return branding
}
