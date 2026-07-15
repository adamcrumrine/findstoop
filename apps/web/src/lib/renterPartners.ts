// Co-brand shape for the public renter tools (Renter Check / Deposit Check).
//
// The university registry (universityPortals.ts) is now the single source of
// truth: a partner ?ref code IS a university slug, so one entry there powers
// both the subdomain portal and the ?ref co-brand. This file is a thin adapter
// that projects a university into the RenterPartner shape the renter tools and
// useRenterPartner already consume — plus the self-serve landlord codes, which
// still resolve at runtime via get_referral_brand (see useRenterPartner).

import { getUniversity, type UniversityPortal } from './universityPortals'

export interface RenterPartner {
  code: string
  name: string        // shown in the co-brand header
  tagline?: string    // shown under the page intro ("Provided by …")
  logoUrl?: string    // optional partner logo (e.g. '/universities/osu.png')
}

/** Project a university into the renter-tool co-brand header shape. */
export function universityToPartner(u: UniversityPortal | null | undefined): RenterPartner | null {
  if (!u) return null
  return { code: u.slug, name: u.partnerName, tagline: u.partnerTagline, logoUrl: u.logoUrl }
}

/** Resolve a ?ref code to a known university co-brand (null for unknown /
 *  self-serve landlord codes, which useRenterPartner resolves via RPC). */
export function getPartner(ref: string | null | undefined): RenterPartner | null {
  return universityToPartner(getUniversity(ref))
}
