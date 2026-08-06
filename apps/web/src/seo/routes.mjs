// ─────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for per-route SEO metadata.
//
// This module is PURE DATA + PURE FUNCTIONS. It has ZERO side effects and
// imports nothing from the app: no `window`, no Supabase, no React, no
// brand.ts. That lets THREE consumers share one definition:
//
//   1. Runtime  — src/lib/useSeo.ts → useRouteSeo(path) upserts <head> tags
//                 client-side (Googlebot renders JS; tab titles; bookmarks).
//   2. Prerender — scripts/prerender.mjs bakes each route's tags into a static
//                 dist/<path>/index.html so social crawlers (which never run
//                 JS) unfurl the right title/description/image.
//   3. Sitemap  — scripts/prerender.mjs emits dist/sitemap.xml from the same
//                 list, so the sitemap can never drift from the pages.
//
// brand.ts is NOT pure (it reads window + import.meta.env), so the few brand
// constants needed here are inlined below as the Stoop canon. findstoop.com is
// the Stoop build; white-label brands re-point the *name* at runtime via
// useRouteSeo() (see useSeo.ts) and rebrand their static output in vite.config
// (the prerender step is skipped for them — see scripts/prerender.mjs).
//
// TO ADD A ROUTE: append one entry to ROUTES below + add its <Route> in
// App.tsx. Nothing else — the sitemap, the prerender, and the client meta all
// pick it up automatically. Types live in ./routes.d.mts.
// ─────────────────────────────────────────────────────────────────────────

/** Inlined Stoop brand constants (mirror of src/lib/brand.ts `stoop`). */
export const SITE = {
  origin: 'https://findstoop.com',
  name: 'Stoop',
  /** Appended to every route title by useSeo (from BRAND.titleSuffix). */
  titleSuffix: ' · Stoop',
  /** Default share image (path; consumers prefix `origin`). */
  ogImage: '/og-image.png',
  // Real pixel dimensions of the asset above. Regenerate it with
  // scripts/build-brand-assets.mjs; change the size there and these follow.
  // Previously this pointed at the transparent wordmark and claimed 1149×345
  // for a file that was actually 836×319 — wrong asset, wrong numbers.
  ogImageWidth: 1200,
  ogImageHeight: 630,
  twitterCard: 'summary_large_image',
}

const ORIGIN = SITE.origin
const LOGO = ORIGIN + SITE.ogImage

const ORG = { '@type': 'Organization', name: SITE.name, url: ORIGIN + '/' }
const PUBLISHER = {
  '@type': 'Organization',
  name: SITE.name,
  url: ORIGIN + '/',
  logo: { '@type': 'ImageObject', url: LOGO },
}

/** Article structured data for an education guide entry (no @context — combined into a @graph below). */
function articleLd(r) {
  return {
    '@type': 'Article',
    headline: r.title,
    description: r.description,
    url: ORIGIN + r.path,
    datePublished: r.lastmod,
    dateModified: r.lastmod,
    author: ORG,
    publisher: PUBLISHER,
    mainEntityOfPage: { '@type': 'WebPage', '@id': ORIGIN + r.path },
  }
}

/** BreadcrumbList structured data: Home > Education > <guide title>. */
function breadcrumbLd(r) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Education', item: ORIGIN + '/education' },
      { '@type': 'ListItem', position: 3, name: r.title, item: ORIGIN + r.path },
    ],
  }
}

// ── The manifest ─────────────────────────────────────────────────────────
// title:        page title WITHOUT the brand suffix (useSeo appends it).
// description:  50–160 char meta description (brand-approved on-page copy).
// lastmod:      ISO date — bump when the page's content materially changes.
// changefreq/priority: sitemap hints (Google largely ignores, kept for Bing).
// jsonLd:       optional per-route structured data (APPENDED alongside the
//               site-wide @graph in index.html — never replaces it).
// noindex:      set true to keep a route out of the sitemap + prerender and
//               emit robots "noindex, nofollow".
export const ROUTES = [
  {
    path: '/',
    title: 'Property management for landlords with a handful of units',
    description: 'List vacancies, screen applicants, sign leases, and accept rent online — built for landlords who own a handful of properties, not a hundred. $5 per unit per month.',
    lastmod: '2026-07-14', changefreq: 'weekly', priority: 1.0,
  },
  {
    path: '/tenability',
    title: 'Tenability™ — the 0–100 AI rentability score (from $5)',
    description: `Tenability™ is Stoop's private 0–100 rentability score. Two tiers: Tenability™ ($5 — verified income + ID + score) and Tenability™ Pro ($25 — adds selfie ID match and applicant-provided credit with AI authenticity scoring). Fair-Housing-safe by design, in minutes not days.`,
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.95,
  },
  {
    path: '/migrate',
    title: 'Migrate to Stoop — from Avail, Buildium, DoorLoop, AppFolio + more',
    description: 'Move your properties, units, tenants, and leases from Avail, Buildium, DoorLoop, TenantCloud, AppFolio, or TurboTenant to Stoop in under five minutes. Our import wizard maps CSV exports automatically and sends branded migration emails to your tenants.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.95,
  },
  {
    path: '/features',
    title: 'Features',
    description: 'Verified pre-qualification with AI Tenability™ scoring, e-sign leases, online rent collection, maintenance tracking, in-app messaging, and Schedule-E-friendly reports — every tool a small landlord actually uses.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.9,
  },
  {
    path: '/pricing',
    title: 'Pricing — $5 per unit per month',
    description: 'Simple per-unit pricing — $5 per unit per month, $50 per unit per year. Every feature included. Applicants pay $5 for verified pre-qualification. No setup fees, no upsells.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.9,
  },
  {
    path: '/how-it-works',
    title: 'How it works',
    description: 'Set up an account, list a vacancy, screen applicants, e-sign the lease, and start collecting rent — the five steps from sign-up to first paycheck on Stoop.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.8,
  },
  {
    path: '/tenants',
    title: 'For renters',
    description: 'Apply for rentals on Stoop with verified pre-qualification for $5, e-sign your lease from your phone, and pay rent free by ACH. Verified applications jump the queue and decisions land in under 24 hours.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.8,
  },
  {
    path: '/education',
    title: 'Education — practical guides for small landlords',
    description: 'Practical, jargon-free guides for landlords who own one rental, ten rentals, or are thinking about buying their first one. Tenant screening, Fair Housing compliance, lead-paint disclosure, move-in checklists, and more.',
    lastmod: '2026-07-14', changefreq: 'weekly', priority: 0.6,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Education — practical guides for small landlords',
      description: 'Practical, jargon-free guides for landlords who own one rental, ten rentals, or are thinking about buying their first one.',
      url: ORIGIN + '/education',
      isPartOf: { '@id': ORIGIN + '/#website' },
    },
  },
  {
    path: '/education/how-to-screen-tenants',
    title: 'How to screen tenants in 2026 — a complete guide for small landlords',
    description: 'A practical, jargon-free guide to tenant screening for small landlords: what to ask for, what the law allows, how to verify income, and where AI fits in. Updated for 2026.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.85,
  },
  {
    path: '/education/fair-housing-act-guide',
    title: `Fair Housing Act — a small landlord's compliance guide for 2026`,
    description: `A plain-English guide to the Fair Housing Act for individual landlords: protected classes, what you can and can't ask, advertising rules, reasonable accommodations, and the costliest mistakes to avoid.`,
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.85,
  },
  {
    path: '/education/lead-based-paint-disclosure',
    title: 'Lead-based paint disclosure for pre-1978 rentals — federal compliance guide',
    description: 'How to comply with the federal lead-based paint disclosure rule (24 CFR 35.92) for pre-1978 residential rentals: when it applies, what the form requires, penalties for skipping it, and a step-by-step compliance flow.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.8,
  },
  {
    path: '/education/move-in-checklist-guide',
    title: 'Move-in & move-out checklists for landlords — the deposit-saving guide',
    description: 'A complete guide to using move-in and move-out inspection checklists in residential rentals: what to document, how to photograph, state-by-state security-deposit rules, and how to make the checklist hold up if a dispute reaches small-claims court.',
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.8,
  },
  {
    path: '/education/security-deposit-rules-for-landlords',
    title: 'Security deposit rules for landlords — limits, timelines, and itemized deductions',
    description: `A national overview of security-deposit rules: how much you can charge, itemizing deductions, and return timelines — plus a highlighted look at Ohio's specific requirements.`,
    lastmod: '2026-07-13', changefreq: 'monthly', priority: 0.8,
  },
  {
    path: '/education/rental-application-process',
    title: 'The rental application process, step by step',
    description: 'A step-by-step walkthrough of the rental application process for landlords: what to collect, application fees, timelines, and moving from listing to signed lease.',
    lastmod: '2026-07-13', changefreq: 'monthly', priority: 0.75,
  },
  {
    path: '/education/lease-renewal-guide',
    title: 'Lease renewal — how and when to renew a tenant',
    description: `When to start the renewal conversation, how to handle a rent increase, what notice periods typically require, and how to decide whether to renew at all.`,
    lastmod: '2026-07-13', changefreq: 'monthly', priority: 0.75,
  },
  {
    path: '/education/month-to-month-vs-fixed-term-lease',
    title: 'Month-to-month vs. fixed-term leases — how to choose',
    description: 'The real tradeoffs between month-to-month and fixed-term leases: flexibility, turnover risk, rent increases, and which structure fits your property.',
    lastmod: '2026-07-13', changefreq: 'monthly', priority: 0.75,
  },
  {
    path: '/education/how-to-collect-rent-online',
    title: `How to collect rent online — a landlord's guide to ACH, cards, and checks`,
    description: 'ACH vs. card vs. check compared on cost, speed, and risk, plus how to set up autopay and late fees the right way.',
    lastmod: '2026-07-13', changefreq: 'monthly', priority: 0.75,
  },
  {
    path: '/education/moving-out-checklist-for-tenants',
    title: 'Moving-out checklist for tenants — how to get your full deposit back',
    description: `A tenant's move-out checklist: notice, cleaning, photographing the unit, and what to do if your landlord withholds part of your security deposit.`,
    lastmod: '2026-07-13', changefreq: 'monthly', priority: 0.75,
  },
  // ── Public tenant tools (index targets — prerendered + in the sitemap) ──
  {
    path: '/renter-check',
    title: 'Renter Check — a plain-English read of your lease',
    description: `Upload any lease PDF and get a plain-English breakdown of what you owe, the red flags to watch for, and your rights as a renter. Free, no login. General information, not legal advice.`,
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.6,
  },
  {
    path: '/deposit-check',
    title: 'Deposit Check — is your security-deposit deduction fair?',
    description: `Upload your landlord's security-deposit letter and see each deduction judged fair, questionable, or unfair, plus the total you may be owed back. Free, no login. General information, not legal advice.`,
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.6,
  },
  {
    path: '/deposit-demand',
    title: 'Security-deposit demand letter generator',
    description: `Generate a print-ready demand letter for the security deposit your landlord owes you, prefilled from your lease. General information, not legal advice.`,
    lastmod: '2026-07-14', changefreq: 'monthly', priority: 0.5,
  },
  // ── Legal / policy (low priority, rarely change) ──
  {
    path: '/screening-terms',
    title: 'Screening Terms',
    description: `Plain-language terms covering Stoop's tenant pre-qualification — what we collect, how it's used, automated screening tools, your rights, and data deletion.`,
    lastmod: '2026-07-14', changefreq: 'yearly', priority: 0.3,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description: `How Stoop collects, uses, and protects landlord, tenant, and applicant data. What we share, what we don't, and your rights.`,
    lastmod: '2026-07-14', changefreq: 'yearly', priority: 0.3,
  },
  {
    path: '/terms',
    title: 'Terms of Service',
    description: 'The agreement between Stoop and the landlords, tenants, and applicants who use the platform.',
    lastmod: '2026-07-14', changefreq: 'yearly', priority: 0.3,
  },
  {
    path: '/fair-housing',
    title: 'Fair Housing Statement',
    description: 'Stoop is committed to equal housing opportunity. We comply with the federal Fair Housing Act and applicable state and local fair-housing laws.',
    lastmod: '2026-07-14', changefreq: 'yearly', priority: 0.3,
  },
  {
    path: '/accessibility',
    title: 'Accessibility Statement',
    description: `Stoop's commitment to accessible design, the standards we follow, known limitations, and how to report accessibility barriers.`,
    lastmod: '2026-07-14', changefreq: 'yearly', priority: 0.3,
  },
]

// Attach Article + BreadcrumbList structured data to every education guide
// (DRY — reuses the entry's own title/description/lastmod so they can't
// drift). Combined into one @graph so each guide emits a single JSON-LD
// script tag, matching the site-wide @graph pattern in index.html.
for (const r of ROUTES) {
  if (r.path.startsWith('/education/') && !r.jsonLd) {
    r.jsonLd = { '@context': 'https://schema.org', '@graph': [articleLd(r), breadcrumbLd(r)] }
  }
}

// FAQPage structured data for /pricing — mirrors EXACTLY the visible
// "Pricing questions" FAQ section rendered in src/pages/marketing/Pricing.tsx.
// If that section's copy changes, update both places together.
{
  const pricingRoute = ROUTES.find((r) => r.path === '/pricing')
  pricingRoute.jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'When do I start paying?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `You can sign up, add properties, and invite tenants without paying anything. Billing only starts once your first lease goes active — that's when the unit counts as a "paid unit" at $5/month.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What counts as a unit?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Anything you'd rent to a separate household. A single-family home is one unit. A duplex is two. Vacant units don't count — we only charge for active leases.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Can I cancel?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes, in one click. Monthly subscriptions stop at the end of the current billing period; you keep access until then. Annual prepay isn't refundable, but access continues through the end of your prepaid term.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What about portfolios over 50 units?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The standard plan covers up to 50 units. If you're managing more, you've outgrown the DIY category — reach out and we'll talk about volume pricing.`,
        },
      },
      {
        '@type': 'Question',
        name: `Why isn't there a free tier?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `We could offer one, but every other landlord platform with a free tier monetizes by charging your tenants — surcharges, screening reports, optional "speed-up" fees. We'd rather charge a flat, honest $5/unit/mo and keep the experience clean for your renters.`,
        },
      },
      {
        '@type': 'Question',
        name: `Annual prepay — what's the catch?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `No catch other than the non-refundable bit: prepaying $50/unit for the year saves you 16.7% over monthly. If you cancel mid-year, you keep access through the end of the prepaid term — but no refund. Units you remove mid-year don't generate a credit.`,
        },
      },
    ],
  }
}

/**
 * SEO meta for one route, shaped for useSeo(). Throws if the path is not
 * registered — a loud, immediate signal to add it to ROUTES.
 */
export function getRouteSeo(path) {
  const r = ROUTES.find((x) => x.path === path)
  if (!r) throw new Error(`[seo] no route meta registered for "${path}" — add it to src/seo/routes.mjs`)
  return {
    title: r.title,
    description: r.description,
    path: r.path,
    image: r.image,
    noindex: r.noindex,
  }
}

/** Routes eligible for the sitemap + prerender (everything not noindex). */
export function indexableRoutes() {
  return ROUTES.filter((r) => !r.noindex)
}
