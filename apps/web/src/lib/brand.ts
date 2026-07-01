// White-label brand registry.
//
// The app ships as "Stoop" by default; setting VITE_BRAND at build time swaps
// every user-visible brand surface — name, logos, accent palette, support
// contacts, SEO origin — without forking any component code. Components must
// never hardcode a brand name, logo path, or findstoop.com URL; they read
// BRAND instead. The accent palette flows through CSS custom properties (see
// applyBrandTheme + tailwind.config.ts), so Tailwind's `brand-*` utilities
// re-color automatically.
//
//   npm run dev                      → Stoop
//   VITE_BRAND=hawk npm run dev      → Hawk Investments
//
// Adding a brand: add an entry to BRANDS, drop logo assets in
// apps/web/public/brands/<id>/, and build with VITE_BRAND=<id>.
// See docs/white-label.md.

export interface Brand {
  id: string
  /** User-visible product/company name — "Stoop", "Hawk Investments". */
  name: string
  /** Name used in legal copy (Terms, Privacy, PDF footers). */
  legalName: string
  /** Short tab-title suffix, e.g. " · Stoop". */
  titleSuffix: string
  tagline: string
  description: string
  /** Canonical site origin for SEO / share links, no trailing slash. */
  origin: string
  /** Bare domain for user-visible copy ("findstoop.com"). */
  domain: string
  supportEmail: string
  helloEmail: string
  logo: {
    /** Wordmark for headers, letterheads, auth pages. */
    horizontal: string
    /** Square mark for spinners, modals, app icons. */
    square: string
  }
  favicon: {
    /** Only set for non-default brands — swapped in at boot. */
    svg?: string
  }
  /** Browser-chrome theme color (mobile address bar, PWA). */
  themeColor: string
  /**
   * Accent ramp as space-separated RGB triplets ("46 89 132") so Tailwind
   * alpha modifiers (bg-brand-500/10) keep working. 500/600 must clear
   * WCAG AA: white text on 500 ≥ 4.5:1, 600 on white ≥ 4.5:1.
   */
  colors: Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900', string>
  /** Hero gradient endpoints, RGB triplets. Decorative — no AA requirement. */
  gradient: [string, string]
}

const stoop: Brand = {
  id: 'stoop',
  name: 'Stoop',
  legalName: 'Stoop',
  titleSuffix: ' · Stoop',
  tagline: 'Property management built for landlords with a handful of units',
  description:
    'Run your rentals like a pro without becoming one. Stoop combines listings, verified pre-qualification, e-sign leases, rent collection, and maintenance in one tool — $9 per unit per month.',
  origin: 'https://findstoop.com',
  domain: 'findstoop.com',
  supportEmail: 'support@findstoop.com',
  helloEmail: 'hello@findstoop.com',
  logo: {
    horizontal: '/stoop_logo_horizontal_trans.png',
    square: '/stoop_logo_square_trans.png',
  },
  favicon: {},
  themeColor: '#00A896',
  colors: {
    50: '230 249 246',
    100: '179 235 227',
    200: '128 221 207',
    300: '77 207 187',
    400: '0 180 162',
    500: '0 130 117',
    600: '0 110 98',
    700: '0 89 81',
    800: '0 62 57',
    900: '0 42 38',
  },
  gradient: ['0 168 150', '0 180 162'],
}

// Deep navy + gold. 500 vs white = 7.30:1, 600 vs white = 9.60:1 — both
// comfortably past the 4.5:1 AA bar the Stoop ramp was tuned for.
const hawk: Brand = {
  id: 'hawk',
  name: 'Hawk Investments',
  legalName: 'Hawk Investments',
  titleSuffix: ' · Hawk Investments',
  tagline: 'Property management by Hawk Investments',
  description:
    'Hawk Investments combines listings, verified pre-qualification, e-sign leases, rent collection, and maintenance in one place for our properties and residents.',
  // Placeholder domain — update when Hawk's real domain is wired up.
  origin: 'https://hawkinvestments.com',
  domain: 'hawkinvestments.com',
  supportEmail: 'support@hawkinvestments.com',
  helloEmail: 'hello@hawkinvestments.com',
  logo: {
    horizontal: '/brands/hawk/logo-horizontal.svg',
    square: '/brands/hawk/logo-square.svg',
  },
  favicon: {
    svg: '/brands/hawk/logo-square.svg',
  },
  themeColor: '#1B2A41',
  colors: {
    50: '238 243 248',
    100: '213 226 238',
    200: '179 201 222',
    300: '143 174 203',
    400: '79 123 166',
    500: '46 89 132',
    600: '36 71 107',
    700: '27 56 83',
    800: '18 38 58',
    900: '11 24 38',
  },
  gradient: ['27 42 65', '46 89 132'],
}

export const BRANDS: Record<string, Brand> = { stoop, hawk }

const brandId = import.meta.env.VITE_BRAND || 'stoop'
export const BRAND: Brand = BRANDS[brandId] ?? stoop

/** True when running a white-label build (anything other than Stoop). */
export const IS_WHITE_LABEL = BRAND.id !== 'stoop'

/**
 * Brand accent as a CSS color string for places Tailwind classes can't
 * reach — chart fills/strokes, inline SVG attributes, canvas.
 * brandColor('500') → 'rgb(0 130 117)'.
 */
export function brandColor(step: keyof Brand['colors']): string {
  return `rgb(${BRAND.colors[step]})`
}

/**
 * Push the active brand into the document. Called once at boot (main.tsx).
 *
 * index.html ships Stoop's static metadata (social-share crawlers read raw
 * HTML), so for Stoop this is a no-op apart from setting the CSS variables'
 * initial values — which match the stylesheet defaults anyway. For other
 * brands it re-points the palette, tab title, theme-color, and favicon.
 */
export function applyBrandTheme(doc: Document = document) {
  const root = doc.documentElement
  for (const [step, triplet] of Object.entries(BRAND.colors)) {
    root.style.setProperty(`--brand-${step}`, triplet)
  }
  root.style.setProperty('--brand-grad-from', BRAND.gradient[0])
  root.style.setProperty('--brand-grad-to', BRAND.gradient[1])

  if (!IS_WHITE_LABEL) return

  doc.title = `${BRAND.name} — ${BRAND.tagline}`
  doc.querySelector('meta[name="description"]')?.setAttribute('content', BRAND.description)
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', BRAND.themeColor)
  doc.querySelector('meta[name="application-name"]')?.setAttribute('content', BRAND.name)
  doc.querySelector('meta[name="author"]')?.setAttribute('content', BRAND.name)

  if (BRAND.favicon.svg) {
    // Remove Stoop's PNG favicons so the SVG wins in every browser.
    doc.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((el) => el.remove())
    const link = doc.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    link.href = BRAND.favicon.svg
    doc.head.appendChild(link)
  }
}
