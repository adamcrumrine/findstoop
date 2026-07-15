// Resolves co-brand info for the public renter tools (Renter Check / Deposit
// Check). Sources, checked in order:
//   1. A ?ref= code matching a university slug — the static registry, instant.
//   2. A ?ref= code that's a self-serve landlord code — get_referral_brand RPC.
//   3. No ?ref, but served on a {university}.findstoop.com subdomain — the
//      subdomain's own university co-brand (so a student who lands here without
//      a link still sees their school's front door).
//
// Returns the same RenterPartner shape every way, so callers render one header.

import { useEffect, useState } from 'react'
import { getPartner, universityToPartner, type RenterPartner } from '../lib/renterPartners'
import { getReferralBrand } from '@findstoop/shared/api/referralPartners'
import { UNIVERSITY } from '../lib/brand'

export function useRenterPartner(ref: string | null | undefined): RenterPartner | null {
  // Fallback co-brand from the subdomain (null off a university host).
  const subdomainPartner = universityToPartner(UNIVERSITY)
  const staticPartner = getPartner(ref) ?? subdomainPartner
  const [partner, setPartner] = useState<RenterPartner | null>(staticPartner)

  useEffect(() => {
    const code = ref?.trim().toLowerCase()
    if (!code) { setPartner(subdomainPartner); return }
    const known = getPartner(code)
    if (known) { setPartner(known); return }

    let cancelled = false
    // While the landlord code resolves, keep the subdomain co-brand rather
    // than flashing to the generic header.
    setPartner(subdomainPartner)
    getReferralBrand(code).then((brand) => {
      if (cancelled || !brand) return
      setPartner({ code, name: brand.name, tagline: brand.tagline ?? undefined, logoUrl: brand.logoUrl ?? undefined })
    })
    return () => { cancelled = true }
  // subdomainPartner is derived from a module-const (UNIVERSITY) — stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])

  return partner
}
