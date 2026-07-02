# White-label / bespoke branding

The web app can ship under a different brand without forking any code. The
first white-label brand is **Hawk Investments** (`hawk`).

## Running a branded build

```bash
# Local dev
VITE_BRAND=hawk npm run dev

# Production build
VITE_BRAND=hawk npm run build
```

No `VITE_BRAND` (or an unknown id) falls back to Stoop. A branded deployment
is just a second Vercel project (or build target) pointed at the same repo
with `VITE_BRAND=hawk` in its environment, served from the brand's domain.

## What a brand controls

Everything lives in `apps/web/src/lib/brand.ts` (`BRANDS` registry):

| Surface | Field(s) |
| --- | --- |
| Company / product name in all copy | `name`, `legalName` |
| Tab titles + SEO (`useSeo`) | `titleSuffix`, `origin`, `description` |
| Logos (headers, auth, PDFs, spinners) | `logo.horizontal`, `logo.square` |
| Accent color palette (all `brand-*` Tailwind utilities) | `colors` (RGB triplets) |
| Hero gradient | `gradient` |
| Browser chrome / PWA theme color + icons | `themeColor` (+ `BUILD_BRANDS` in `vite.config.ts`) |
| Static HTML metadata (title, OG/Twitter unfurls, JSON-LD, favicon links) | `BUILD_BRANDS[id].html` in `vite.config.ts` (build-time plugin) |
| Support links & mailtos | `supportEmail`, `helloEmail`, `domain` |
| Favicon (non-default brands) | `favicon.svg` |
| CSV download filename prefix | `fileSlug` |
| Stock illustration hue shift | `illustrationFilter` (optional CSS filter) |
| Site personality | `experience: 'saas' \| 'portal'`, `marketingNav`, `portal` copy |

## Experience modes

- **`saas`** (Stoop): the public product site — full marketing nav, pricing,
  landlord sign-up CTAs.
- **`portal`** (Hawk): a property company's own front door — the homepage is a
  resident portal (`pages/marketing/PortalHome.tsx`: pay rent / maintenance /
  apply / sign in), the header nav collapses to `marketingNav`, CTAs become
  "Sign in", and the footer trims the SaaS links. Marketing routes still exist,
  they're just not surfaced.

## Per-landlord branding (runtime, any brand)

Independent of the build-time brand, each landlord can brand their tenants'
portal from **Settings → Company**: company name, logo (already existed), and
a new accent color (`profiles.brand_color`, migration
`20260701000001_landlord_brand_color.sql`).

- `apps/web/src/lib/landlordBrand.ts` derives a full 50–900 palette from the
  single hex and **auto-darkens the 500/600 steps until white-text contrast
  clears WCAG AA**, so any color a landlord picks stays accessible.
- `apps/web/src/hooks/useLandlordBranding.ts` resolves the tenant's manager
  (via their current lease) and reads the three branding fields.
- `TenantLayout` shows landlord logo → company name → build brand (in that
  order) and applies the accent while mounted; a **"Powered by Stoop"**
  attribution shows whenever another brand fronts the portal.

## Landlord-branded email

Tenant-facing transactional emails (invite, lease/document ready, application
decisions, rent/late/renewal/auto-pay lifecycle) present as the landlord's
company when `company_name` is set: `"Company via FindStoop" <noreply@…>`
from-header, logo/name header, `brand_color` accent, and a "Sent by …
via FindStoop" footer (`supabase/functions/_shared/emailBranding.ts`).
Manager-facing and security emails stay platform-branded. Everything still
sends from the existing Resend address — a custom from-domain per brand would
need DNS + Resend setup. Supabase *auth* emails (password reset, OTP) are
dashboard-managed templates; keep their copy brand-neutral ("your rental
portal") if white-label matters there.

## Pre-auth applicant branding

The `/apply/:unitId` flow (and its Stripe payment form) brands itself via the
anon-callable `get_unit_public_brand(unit_id)` RPC
(migration `20260702000001`), which exposes only the manager's
name/logo/color. Signed documents and the tenant portal use the authed
`useLandlordBranding` hook instead.

## Guardrails

- `apps/web/src/lib/brandLeaks.test.ts` fails CI if anyone hardcodes
  user-visible Stoop branding outside the registry (comments and the
  intentional attribution strings are exempt).
- `apps/web/src/lib/landlordBrand.test.ts` proves the contrast guarantee.
- CI builds the hawk brand alongside the default on every PR.
- `npm run smoke:brands` builds every brand and asserts the output carries its
  metadata, manifest, and rendered homepage branding (Chromium optional).
- `/brand-preview` (dev only): palette, core treatments, and a landlord
  accent-color simulator.
- White-label builds tag analytics events with `metadata.brand` for
  segmentation; default-brand rows are unchanged.

Component code never hardcodes a brand: it imports `BRAND` (and
`IS_WHITE_LABEL`, `brandColor()` for chart/SVG colors) from `lib/brand`.
The palette flows through CSS custom properties — Stoop defaults are in
`src/index.css`, and `applyBrandTheme()` overwrites them at boot — so
Tailwind's `bg-brand-500`, `text-brand-600/70`, `bg-brand-gradient`, etc.
re-color automatically.

## Adding a new brand

1. Add an entry to `BRANDS` in `apps/web/src/lib/brand.ts`. The accent ramp
   must keep the WCAG AA contrast the UI was tuned for: white text on `500`
   ≥ 4.5:1 and `600` on white ≥ 4.5:1.
2. Drop logo assets in `apps/web/public/brands/<id>/` (horizontal wordmark +
   square mark; SVG preferred). Marks should survive the
   `brightness-0 invert` treatment used on dark footers.
3. Add a matching entry to `BUILD_BRANDS` in `apps/web/vite.config.ts`
   (PWA manifest + static HTML metadata; icons optional — falls back to the
   shared set).
4. Build with `VITE_BRAND=<id>`.

## What stays "Stoop" on purpose

- `@findstoop/shared` package name, analytics/localStorage keys, Stripe and
  Supabase identifiers — internal, never user-visible.
- Generated lease/legal boilerplate in `packages/shared/src/lib/leaseTemplates.ts`
  ("This lease is generated by Stoop…") — the operating platform is still
  Stoop; a white-label brand is a storefront, not a new legal drafter.
- The `PoweredByStoop` badge and the "Powered by Stoop" footer line shown on
  white-label builds.
- Tenability™ — trademarked feature name.

## Hawk Investments specifics

- Palette: deep navy ramp (`#2E5984` 500 / `#24476B` 600 — 7.3:1 and 9.6:1
  vs white) with gold `#C9A227` accents in the logo.
- Logos in `apps/web/public/brands/hawk/` are generated placeholder marks —
  swap in real brand assets when available (keep the file names).
- `hawkinvestments.com`, `support@` / `hello@hawkinvestments.com` are
  placeholders in `brand.ts` — update to the real domain and inboxes before
  going live.
- PWA icons live in `apps/web/public/brands/hawk/icons/` (rendered from the
  square SVG); regenerate them if the mark changes.
