// Public applicant status lookup for /application-status/:token.
//
// The applicant has no session, so get_application_public_status (SECURITY
// DEFINER, migration 20260702000003) resolves the unguessable token to the
// minimum the status page needs: first name, property/unit label, submitted
// date, a coarse status, and the landlord's three public branding columns
// (same set as get_unit_public_brand). Missing and revoked tokens both come
// back as an empty result — the page shows one generic not-found either way.
//
// Branding follows the useUnitLandlordBrand contract: "all-empty means null"
// so callers fall back to the build-time BRAND cleanly, and a branding hiccup
// must never break the status page.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LandlordBranding } from './useLandlordBranding'

export type PublicApplicationStatus =
  | 'received'
  | 'under_review'
  | 'screening_in_progress'
  | 'approved'
  | 'declined'
  | 'withdrawn'

export interface ApplicationStatusResult {
  firstName: string
  propertyName: string
  unitNumber: string
  /** ISO timestamp the application was submitted. */
  submittedAt: string
  status: PublicApplicationStatus
  /** Landlord branding, or null to fall back to the build brand. */
  branding: LandlordBranding | null
}

interface StatusRow {
  first_name: string
  property_name: string
  unit_number: string
  submitted_at: string
  status: string
  company_name: string | null
  company_logo_url: string | null
  brand_color: string | null
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'received', 'under_review', 'screening_in_progress', 'approved', 'declined', 'withdrawn',
])

export function useApplicationStatus(token: string | undefined): {
  loading: boolean
  result: ApplicationStatusResult | null
} {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ApplicationStatusResult | null>(null)

  useEffect(() => {
    if (!token) { setResult(null); setLoading(false); return }
    let cancelled = false
    setLoading(true)

    ;(async () => {
      const { data, error } = await supabase.rpc('get_application_public_status', { p_token: token })
      if (cancelled) return
      const row: StatusRow | null = !error && Array.isArray(data) ? (data[0] ?? null) : null

      if (!row || !KNOWN_STATUSES.has(row.status)) {
        setResult(null)
        setLoading(false)
        return
      }

      const companyName = (row.company_name ?? '').trim() || null
      const logoUrl = row.company_logo_url ?? null
      const brandColor = row.brand_color ?? null
      setResult({
        firstName: row.first_name,
        propertyName: row.property_name,
        unitNumber: row.unit_number,
        submittedAt: row.submitted_at,
        status: row.status as PublicApplicationStatus,
        branding: (companyName || logoUrl || brandColor)
          ? { companyName, logoUrl, brandColor }
          : null,
      })
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [token])

  return { loading, result }
}
