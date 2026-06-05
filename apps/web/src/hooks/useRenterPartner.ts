// Resolves a ?ref= code to co-brand info for the public renter tools.
//
// Two sources, checked in order:
//   1. The static university registry (renterPartners.ts) — instant, no network.
//   2. A self-serve landlord code — resolved via get_referral_brand (anon RPC).
//
// Returns the same RenterPartner shape either way, so callers render one header.

import { useEffect, useState } from 'react'
import { getPartner, type RenterPartner } from '../lib/renterPartners'
import { getReferralBrand } from '@findstoop/shared/api/referralPartners'

export function useRenterPartner(ref: string | null | undefined): RenterPartner | null {
  const staticPartner = getPartner(ref)
  const [partner, setPartner] = useState<RenterPartner | null>(staticPartner)

  useEffect(() => {
    const code = ref?.trim().toLowerCase()
    if (!code) { setPartner(null); return }
    const known = getPartner(code)
    if (known) { setPartner(known); return }

    let cancelled = false
    setPartner(null)
    getReferralBrand(code).then((brand) => {
      if (cancelled || !brand) return
      setPartner({ code, name: brand.name, tagline: brand.tagline ?? undefined, logoUrl: brand.logoUrl ?? undefined })
    })
    return () => { cancelled = true }
  }, [ref])

  return partner
}
