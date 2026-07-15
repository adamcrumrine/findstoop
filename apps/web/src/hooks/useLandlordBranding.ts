// Resolves the signed-in tenant's landlord branding — company name, logo,
// accent color — so the tenant portal can dress itself in the landlord's
// brand (TenantLayout header + --brand-* palette override).
//
// Resolution mirrors the tenant Messages flow: current lease → unit →
// property → manager profile. RLS allows the profile read via
// "profiles_tenant_select_their_manager". Returns null while loading, when
// the tenant has no lease, or when the landlord set no branding at all — the
// caller then falls back to the build-time BRAND.
//
// Landlord branding is the SUBDOMAIN experience: it applies when the tenant is
// on a {company}.findstoop.com portal host (PORTAL_SLUG set) OR a
// {university}.findstoop.com host (UNIVERSITY_SLUG set). On the bare
// findstoop.com the tenant portal stays pure Stoop, matching how the
// marketing/portal front door already resolves branding by hostname.
//
// On a university subdomain the university fronts the portal chrome, but the
// landlord identity resolved here is still what money + legal surfaces (Pay
// Rent, Documents) present — a student always knows who they actually pay and
// sign with. So we resolve it on university hosts too, not just landlord ones.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PORTAL_SLUG, UNIVERSITY_SLUG } from '../lib/brand'

const ON_BRANDED_HOST = Boolean(PORTAL_SLUG || UNIVERSITY_SLUG)

export interface LandlordBranding {
  companyName: string | null
  logoUrl: string | null
  /** Accent hex ("#2E5984") — buttons/links. Null when the landlord kept the default palette. */
  brandColor: string | null
  /** Primary hex — header/footer/nav broad shading. Null → falls back to the accent. */
  primaryColor: string | null
}

interface LeaseRow {
  status: string
  sent_for_signature_at: string | null
  unit: { properties: { manager_id: string | null } | null } | null
}

export interface LandlordBrandingState {
  branding: LandlordBranding | null
  /** True until resolution finishes (found branding, found none, or off a
   *  portal subdomain). Lets a caller like TenantLayout hold a neutral
   *  placeholder instead of flashing the default Stoop header before a
   *  branded subdomain's real header appears. */
  loading: boolean
}

/**
 * Same resolution as useLandlordBranding, but also reports `loading` so a
 * caller can gate rendering until branding is known one way or the other.
 * useLandlordBranding (below) is a thin wrapper around this — its return
 * shape stays exactly as before for existing callers (Dashboard, PayRent,
 * SignDocument, ViewDocument).
 */
export function useLandlordBrandingState(tenantId: string | undefined): LandlordBrandingState {
  const [branding, setBranding] = useState<LandlordBranding | null>(null)
  // Only branded subdomains have anything to resolve — starting true off-host
  // would flash a one-frame header skeleton (effects run after first paint).
  const [loading, setLoading] = useState(ON_BRANDED_HOST)

  useEffect(() => {
    // Off a branded subdomain → no landlord branding; the portal renders as
    // Stoop immediately — nothing to wait on.
    if (!ON_BRANDED_HOST) { setBranding(null); setLoading(false); return }
    // Portal subdomain, but we don't know the tenant yet — stay in the
    // loading state rather than reporting "no branding" prematurely.
    if (!tenantId) { setBranding(null); setLoading(true); return }
    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
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
          .select('company_name, company_logo_url, brand_color, brand_primary_color')
          .eq('id', managerId)
          .maybeSingle()
        if (cancelled) return

        const companyName = (manager?.company_name ?? '').trim() || null
        const logoUrl = manager?.company_logo_url ?? null
        const brandColor = manager?.brand_color ?? null
        const primaryColor = manager?.brand_primary_color ?? null
        // Nothing customized → report "no landlord branding" so the portal
        // renders the build brand untouched.
        if (!companyName && !logoUrl && !brandColor && !primaryColor) { setBranding(null); return }
        setBranding({ companyName, logoUrl, brandColor, primaryColor })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [tenantId])

  return { branding, loading }
}

export function useLandlordBranding(tenantId: string | undefined): LandlordBranding | null {
  return useLandlordBrandingState(tenantId).branding
}
