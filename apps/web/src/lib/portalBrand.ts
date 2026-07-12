// Landlord portal brand — resolves {company}.findstoop.com's slug to the
// landlord's public branding (name, logo, accent) via the anon-callable
// get_portal_brand RPC, and applies it pre-auth. Module-level promise cache:
// one fetch per page load, shared by the boot theme and any component.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { applyLandlordBrand } from './landlordBrand'
import { PORTAL_SLUG } from './brand'

export interface PortalBrand {
  companyName: string | null
  logoUrl: string | null
  brandColor: string | null
}

let cache: Promise<PortalBrand | null> | null = null

export function fetchPortalBrand(): Promise<PortalBrand | null> {
  if (!PORTAL_SLUG) return Promise.resolve(null)
  cache ??= (async () => {
    try {
      const { data } = await supabase.rpc('get_portal_brand', { p_slug: PORTAL_SLUG })
      const row = (Array.isArray(data) ? data[0] : data) as
        | { company_name: string | null; company_logo_url: string | null; brand_color: string | null }
        | null
      if (!row || (!row.company_name && !row.company_logo_url && !row.brand_color)) return null
      return { companyName: row.company_name, logoUrl: row.company_logo_url, brandColor: row.brand_color }
    } catch {
      return null
    }
  })()
  return cache
}

/**
 * Boot-time application (called from main.tsx after applyBrandTheme):
 * landlord accent onto the CSS palette, company name into the tab title.
 * Unknown/unclaimed slugs resolve to null and the generic portal stands.
 */
/** The resolved portal brand for this host, or null (also null off-portal). */
export function usePortalBrand(): PortalBrand | null {
  const [brand, setBrand] = useState<PortalBrand | null>(null)
  useEffect(() => {
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
    if (b.brandColor) applyLandlordBrand(b.brandColor)
    if (b.companyName) document.title = `${b.companyName} — Resident portal`
  })
}
