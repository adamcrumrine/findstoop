// Landlord portal brand — resolves {company}.findstoop.com's slug to the
// landlord's public branding (name, logo, accent) via the anon-callable
// get_portal_brand RPC, and applies it pre-auth. Module-level promise cache:
// one fetch per page load, shared by the boot theme and any component.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { applyLandlordBrand } from './landlordBrand'
import { PORTAL_SLUG, UNIVERSITY } from './brand'
import type { UniversityPortal } from './universityPortals'

export interface PortalBrand {
  companyName: string | null
  logoUrl: string | null
  /** Accent hex — buttons/links. */
  brandColor: string | null
  /** Primary hex — header/footer/nav; null falls back to the accent. */
  primaryColor: string | null
}

let cache: Promise<PortalBrand | null> | null = null

export function fetchPortalBrand(): Promise<PortalBrand | null> {
  if (!PORTAL_SLUG) return Promise.resolve(null)
  cache ??= (async () => {
    try {
      const { data } = await supabase.rpc('get_portal_brand', { p_slug: PORTAL_SLUG })
      const row = (Array.isArray(data) ? data[0] : data) as
        | { company_name: string | null; company_logo_url: string | null; brand_color: string | null; brand_primary_color: string | null }
        | null
      if (!row || (!row.company_name && !row.company_logo_url && !row.brand_color && !row.brand_primary_color)) return null
      return {
        companyName: row.company_name,
        logoUrl: row.company_logo_url,
        brandColor: row.brand_color,
        primaryColor: row.brand_primary_color,
      }
    } catch {
      return null
    }
  })()
  return cache
}

/** A university projected into the front-door PortalBrand shape (static — no
 *  fetch), so the marketing shell (MarketingLayout header/footer) co-brands a
 *  university subdomain exactly the way it co-brands a landlord portal. */
function universityAsPortalBrand(u: UniversityPortal): PortalBrand {
  return { companyName: u.name, logoUrl: u.logoUrl ?? null, brandColor: u.accentColor, primaryColor: u.primaryColor }
}

/**
 * Boot-time application (called from main.tsx after applyBrandTheme):
 * landlord accent onto the CSS palette, company name into the tab title.
 * Unknown/unclaimed slugs resolve to null and the generic portal stands.
 */
/** The resolved portal brand for this host, or null (also null off-portal).
 *  A university subdomain resolves synchronously from the static registry. */
export function usePortalBrand(): PortalBrand | null {
  const [brand, setBrand] = useState<PortalBrand | null>(UNIVERSITY ? universityAsPortalBrand(UNIVERSITY) : null)
  useEffect(() => {
    if (UNIVERSITY) return // static — nothing to fetch
    let cancelled = false
    void fetchPortalBrand().then((b) => { if (!cancelled) setBrand(b) })
    return () => { cancelled = true }
  }, [])
  return brand
}

export function applyPortalBrandTheme(): void {
  if (!PORTAL_SLUG) return
  void fetchPortalBrand().then((b) => {
    if (!b) return
    if (b.brandColor) applyLandlordBrand(b.brandColor, b.primaryColor)
    if (b.companyName) document.title = `${b.companyName} — Resident portal`
  })
}

/** University subdomain equivalent of applyPortalBrandTheme — static registry,
 *  so the accent/primary ramps + tab title apply before first paint with no
 *  network round-trip. No-op off a university subdomain. */
export function applyUniversityBrandTheme(): void {
  if (!UNIVERSITY) return
  applyLandlordBrand(UNIVERSITY.accentColor, UNIVERSITY.primaryColor)
  document.title = `${UNIVERSITY.name} — Renter portal`
}
