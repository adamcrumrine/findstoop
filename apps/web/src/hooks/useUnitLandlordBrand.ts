// Landlord branding for the pre-auth application journey (/apply/:unitId).
//
// The applicant has no session, so RLS blocks reading the landlord's profile
// directly; get_unit_public_brand (SECURITY DEFINER, migration
// 20260702000001) resolves unit → property → manager and returns only the
// three branding columns. Same LandlordBranding shape and "all-empty means
// null" contract as useLandlordBranding, so callers fall back to the
// build-time BRAND cleanly. Errors resolve to null — a branding hiccup must
// never break the application form.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LandlordBranding } from './useLandlordBranding'

interface BrandRow {
  company_name: string | null
  company_logo_url: string | null
  brand_color: string | null
  brand_primary_color: string | null
}

export function useUnitLandlordBrand(unitId: string | undefined): LandlordBranding | null {
  const [branding, setBranding] = useState<LandlordBranding | null>(null)

  useEffect(() => {
    if (!unitId) { setBranding(null); return }
    let cancelled = false

    ;(async () => {
      const { data, error } = await supabase.rpc('get_unit_public_brand', { p_unit_id: unitId })
      if (cancelled) return
      const row: BrandRow | null = !error && Array.isArray(data) ? (data[0] ?? null) : null

      const companyName = (row?.company_name ?? '').trim() || null
      const logoUrl = row?.company_logo_url ?? null
      const brandColor = row?.brand_color ?? null
      const primaryColor = row?.brand_primary_color ?? null
      // Nothing customized (or unit/brand not found) → report "no landlord
      // branding" so the page renders the build brand untouched.
      if (!companyName && !logoUrl && !brandColor && !primaryColor) { setBranding(null); return }
      setBranding({ companyName, logoUrl, brandColor, primaryColor })
    })()

    return () => { cancelled = true }
  }, [unitId])

  return branding
}
