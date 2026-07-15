# University co-branded portals

A university gets its own front door to the platform — `osu.findstoop.com` —
where its students run their whole rental life: pay rent, sign a lease, request
maintenance, and reach the renter-help tools. The university's name, logo, and
colors front the experience; each student's own landlord stays who they pay and
sign with.

It works like a company portal (`{company}.findstoop.com`, see
[white-label.md](white-label.md)), with three differences:

- Many unrelated property managers' tenants live under one university front
  door. The university is the storefront, not the landlord.
- The university experience carries more branding and more features than a
  company portal — student renter tools are always on.
- A manager can also mark a single tenant as a student without any university,
  turning the same tools on à la carte.

Ohio State (`osu`) is the worked example throughout, and the only live school.

## Onboarding a university

Hand-onboarded — no database table, no admin screen. One registry entry plus a
reserved-slug migration.

1. **Registry entry** — add the school to `UNIVERSITIES` in
   `apps/web/src/lib/universityPortals.ts`: `slug`, display `name`, `shortName`,
   `primaryColor` + `accentColor` (one or two hex values — the full 50–900 ramps
   are derived and WCAG-guarded automatically), `tagline`, the renter-tool
   co-brand (`partnerName` / `partnerTagline`), `campusLinks`, and the
   `housingOffice` contact. The `osu` entry is the template.

2. **Logo** (optional) — drop `apps/web/public/universities/<slug>.png` (or
   `.svg`) and set `logoUrl`. Left unset, the portal renders the school's name
   as text, so there is never a broken image. Ohio State ships without a logo
   asset today; add `universities/osu.png` and set `logoUrl` to turn it on.

3. **Reserve the slug** — add the slug to `portal_slug_is_reserved(...)` in a
   migration modeled on `20260714000001_reserve_university_portal_slugs.sql`, so
   no landlord can claim or shadow it as their own portal address. `osu`,
   `miami`, `ohiou`, and `kent` are already reserved (the planned three ahead of
   launch).

4. **DNS** — nothing to do. `*.findstoop.com` is already wildcarded to the same
   deployment, and OAuth redirects already allow `https://*.findstoop.com/**`.

The commented `miami` / `ohiou` / `kent` stubs in the registry show the shape
for the next three schools.

## The three access paths

A student reaches the co-brand three ways, all powered by the one registry
entry:

1. **Subdomain** — `osu.findstoop.com`. The full portal wears the Ohio State
   brand, and student renter tools are always on for anyone signed in there.
2. **Co-brand links** — `findstoop.com/renter-check?ref=osu` (and
   `?ref=osu` on the deposit tools). The off-campus housing office hands
   students a link and the tool wears "Ohio State Off-Campus Housing" next to
   "Powered by Stoop". A student who lands on `osu.findstoop.com/renter-check`
   with no `?ref` gets the same co-brand from the subdomain.
3. **Manager-marked student leases** — a manager flips one tenant's lease to a
   student lease and that tenant gets the renter tools, with no university
   involved. See "What managers do" below.

## What students see

**Pre-auth** (portal landing, sign-in, the renter tools): the Ohio State
co-brand — name, logo, and scarlet palette — with a "for Ohio State students"
voice and "Powered by Stoop" attribution per the brand rules. Reuses the
existing portal landing page and brand shell.

**Signed in**: Ohio State fronts the portal header and navigation. Their landlord
identity stays visible where it counts — money and legal surfaces belong to the
landlord, not the university:

- **Pay Rent** presents the landlord's company name and logo — a student always
  knows who they are actually paying.
- **Documents** and the lease are the landlord's; the university never appears
  as a party to the agreement.
- **Messages** thread with the landlord / property manager under the landlord's
  identity.

The Resources tab is always present on a university subdomain, and the Renter
Resources hub adds Ohio State's own campus links and off-campus-housing office
contact from the registry, on top of the standard tools (lease explainer,
Ohio tenant rights, move-in documentation, deposit protection).

## What managers do

Nothing is required. A manager's tenants show up under a university front door
automatically when they sign in on that subdomain, and the manager's own
branding continues to front the money and legal surfaces.

Optionally, a manager can mark an individual lease a **student lease** — the
à-la-carte path, no university needed. On the lease page
(`/manager/review-lease/:id`) there is a **Student lease** switch, matching the
Student Housing switch on a property. Flipping it on turns on the renter tools
for that one tenant. It is administrative, not a lease term, so it stays
available even after the lease is executed.

The student renter tools turn on when any of these is true: the property has
Student Housing mode on, the lease is marked a student lease, or the tenant is
on a university subdomain (`apps/web/src/lib/studentFeatures.ts`).

## How this differs from a company / landlord portal

| | Company portal | University portal |
|---|---|---|
| Who it fronts | One landlord's residents | Many landlords' tenants |
| Branding source | `get_portal_brand` RPC (runtime) | Static registry (instant) |
| Student renter tools | Off unless enabled | Always on |
| Campus resources | — | School links + housing office |
| Resolution order | Landlord slug | Wins **before** landlord slug |

A university subdomain is resolved before landlord slug resolution and never
hits the `get_portal_brand` RPC, so a school's name can't be shadowed by a
landlord slug — and it's reserved at the database besides.

## What stays landlord-owned

Under the university brand, the landlord still owns every surface where money or
a legal obligation changes hands:

- **Payments** — presented as the landlord's company (`useLandlordBranding`
  resolves the landlord even on a university subdomain).
- **The lease and documents** — the landlord is the counterparty; the
  university is never a signer.
- **Messages** — landlord / property-manager identity.

The university is the storefront and the source of campus help. The rent, the
lease, and the deposit are between the student and their landlord.

## Files

- `apps/web/src/lib/universityPortals.ts` — the registry.
- `apps/web/src/lib/renterPartners.ts` — `?ref` co-brand adapter over the
  registry.
- `apps/web/src/lib/brand.ts` — hostname resolution (`UNIVERSITY`,
  `UNIVERSITY_SLUG`; a university wins before `PORTAL_SLUG`).
- `apps/web/src/lib/portalBrand.ts` — applies the palette at boot and fronts the
  marketing shell.
- `apps/web/src/lib/studentFeatures.ts` — the one gating rule.
- `apps/web/src/components/layout/TenantLayout.tsx` — signed-in portal chrome.
- `apps/web/src/pages/tenant/RenterResources.tsx` — the hub + campus links.
- `apps/web/src/pages/marketing/PortalHome.tsx` — the pre-auth landing.
- `apps/web/src/pages/manager/ReviewLease.tsx` — the per-lease student switch.
- Migrations `20260714000001` (reserve slugs) and `20260714000002`
  (`leases.is_student`).
