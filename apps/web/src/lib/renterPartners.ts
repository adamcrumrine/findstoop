// White-label / co-brand registry for Renter Check (L3).
//
// A university off-campus housing office can hand students a co-branded link
// (e.g. /renter-check?ref=osu). Adding a school = one entry here. The ?ref code
// also flows to explain-lease and is stored as referral_source for attribution.
//
// `logoUrl` is optional — drop a partner logo at /public/partners/<code>.png to
// use it; otherwise we render the partner's name as text next to "Powered by Stoop".

export interface RenterPartner {
  code: string
  name: string        // shown in the co-brand header
  tagline?: string    // shown under the page intro ("Provided by …")
  logoUrl?: string    // optional partner logo (e.g. '/partners/osu.png')
}

const PARTNERS: Record<string, RenterPartner> = {
  osu: {
    code: 'osu',
    name: 'Ohio State Off-Campus Housing',
    tagline: 'A free resource for Buckeye renters, from Ohio State Off-Campus Housing.',
  },
  // miami:  { code: 'miami',  name: 'Miami University Off-Campus Housing', tagline: '…' },
  // ohiou:  { code: 'ohiou',  name: 'Ohio University Off-Campus Living',   tagline: '…' },
  // kent:   { code: 'kent',   name: 'Kent State Off-Campus & Commuter',    tagline: '…' },
}

export function getPartner(ref: string | null | undefined): RenterPartner | null {
  if (!ref) return null
  return PARTNERS[ref.trim().toLowerCase()] ?? null
}
