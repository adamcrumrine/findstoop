// University co-brand registry.
//
// A university gives its students a co-branded front door to the platform. One
// entry here powers BOTH channels a school can use:
//
//   1. Subdomain portal — {slug}.findstoop.com (e.g. osu.findstoop.com). The
//      whole resident experience wears the university's name, logo, and colors
//      pre- and post-sign-in, and student renter features are always on. Many
//      unrelated property managers' tenants can live under one university front
//      door — the university is the storefront, each tenant's own landlord is
//      still who they pay and sign with.
//   2. Co-brand links — ?ref={slug} on the public renter tools (Renter Check /
//      Deposit Check). The off-campus housing office hands students a link; the
//      tool wears the office's name next to "Powered by Stoop". This is the
//      same registry the Renter Check co-brand used to read from.
//
// Onboarding a school is one entry here plus (optionally) a logo asset — no DB
// table, no RPC, no deploy of new machinery. See docs/university-portals.md.
//
// Colors are ONE-or-two hex values; consumers derive the full 50–900 accent /
// primary ramps from them via deriveBrandRamp (lib/landlordBrand.ts), which
// darkens the text-carrying steps until they clear WCAG AA — so any school's
// palette produces readable buttons and headers.
//
// `logoUrl` is optional: drop a logo at apps/web/public/universities/<slug>.png
// (or .svg) and set it here; otherwise the portal renders the university's
// name as text. Left unset until the asset is committed, so no broken image.

export interface UniversityPortal {
  /** Subdomain label AND ?ref code — lowercase, a valid DNS label. */
  slug: string
  /** Full display name — 'Ohio State University'. Fronts the portal. */
  name: string
  /** Short name for tight copy — 'Ohio State'. */
  shortName: string
  /** Optional logo, e.g. '/universities/osu.png'. Falls back to the name. */
  logoUrl?: string
  /** Header / nav / footer shading, 6-digit hex. */
  primaryColor: string
  /** Buttons / links accent, 6-digit hex. */
  accentColor: string
  /** Portal-voice line for the landing hero ("for Ohio State students"). */
  tagline: string
  /** Co-brand name shown on the public renter tools (?ref header). */
  partnerName: string
  /** Sub-line under the renter-tool intro ("Provided by …"). */
  partnerTagline?: string
  /** Campus links surfaced in the tenant Renter Resources hub. */
  campusLinks: { label: string; url: string }[]
  /** The school's off-campus-housing office — shown in Renter Resources. */
  housingOffice: { name: string; email?: string; phone?: string; url?: string }
}

const UNIVERSITIES: Record<string, UniversityPortal> = {
  osu: {
    slug: 'osu',
    name: 'Ohio State University',
    shortName: 'Ohio State',
    // Drop apps/web/public/universities/osu.png and set logoUrl to use it.
    primaryColor: '#BB0000', // Scarlet — the header / nav surface.
    accentColor: '#BB0000',  // Scarlet — buttons and links (AA-guarded on derive).
    tagline: 'The renter portal for Ohio State students.',
    partnerName: 'Ohio State Off-Campus Housing',
    partnerTagline: 'A free resource for Buckeye renters, from Ohio State Off-Campus Housing.',
    campusLinks: [
      { label: 'Off-Campus & Commuter Student Services', url: 'https://offcampus.osu.edu' },
      { label: 'Housing listings & roommate finder', url: 'https://offcampus.osu.edu/listings' },
      { label: 'Student Legal Services', url: 'https://studentlegal.osu.edu' },
    ],
    housingOffice: {
      name: 'Off-Campus & Commuter Student Services',
      email: 'offcampus@osu.edu',
      phone: '(614) 292-0100',
      url: 'https://offcampus.osu.edu',
    },
  },
  // Planned schools — reserved as subdomain slugs (see the reserve-slugs
  // migration) but not live until an entry here is uncommented and confirmed.
  // miami: { slug: 'miami', name: 'Miami University', shortName: 'Miami', primaryColor: '#C3142D', accentColor: '#C3142D', tagline: 'The renter portal for Miami students.', partnerName: 'Miami University Off-Campus Housing', campusLinks: [], housingOffice: { name: 'Off-Campus Housing' } },
  // ohiou: { slug: 'ohiou', name: 'Ohio University', shortName: 'Ohio U', primaryColor: '#00694E', accentColor: '#00694E', tagline: 'The renter portal for Ohio University students.', partnerName: 'Ohio University Off-Campus Living', campusLinks: [], housingOffice: { name: 'Off-Campus Living' } },
  // kent:  { slug: 'kent',  name: 'Kent State University', shortName: 'Kent State', primaryColor: '#002664', accentColor: '#002664', tagline: 'The renter portal for Kent State students.', partnerName: 'Kent State Off-Campus & Commuter', campusLinks: [], housingOffice: { name: 'Off-Campus & Commuter Services' } },
}

/** The live university for a slug (subdomain label or ?ref code), or null. */
export function getUniversity(slug: string | null | undefined): UniversityPortal | null {
  if (!slug) return null
  return UNIVERSITIES[slug.trim().toLowerCase()] ?? null
}

/** True when a subdomain label is a live university portal (so it must win
 *  over landlord portal-slug resolution and never hit get_portal_brand). */
export function isUniversitySlug(slug: string | null | undefined): boolean {
  return getUniversity(slug) != null
}

/** All live university slugs — for reference / debugging. */
export const UNIVERSITY_SLUGS: string[] = Object.keys(UNIVERSITIES)
