// Type declarations for the pure-data SEO manifest (routes.mjs).
// routes.mjs stays plain ESM so Node build scripts (scripts/prerender.mjs)
// can import it without a compile step; this file gives the TS app layer
// full typing for the same module. ONE source of truth, two consumers.

/** One entry in the route-meta manifest. */
export interface SeoRoute {
  /** Route path as registered in App.tsx, e.g. '/pricing'. */
  path: string
  /** Page title WITHOUT the brand suffix (useSeo appends it). */
  title: string
  /** 50–160 char meta description. */
  description: string
  /** Optional og:image override (site-relative path). */
  image?: string
  /** Keep out of sitemap + prerender; emit robots noindex. */
  noindex?: boolean
  /** ISO date (YYYY-MM-DD) — sitemap <lastmod>. */
  lastmod?: string
  /** Sitemap hint. */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  /** Sitemap hint, 0.0–1.0. */
  priority?: number
  /** Per-route structured data, appended alongside the site-wide @graph. */
  jsonLd?: Record<string, unknown>
}

/** Shape consumed by useSeo() — a subset of SeoRoute. */
export interface RouteSeoArgs {
  title: string
  description: string
  path: string
  image?: string
  noindex?: boolean
}

export declare const SITE: {
  origin: string
  name: string
  titleSuffix: string
  ogImage: string
  ogImageWidth: number
  ogImageHeight: number
  twitterCard: string
}

export declare const ROUTES: SeoRoute[]

/** SEO meta for one registered route; throws for unregistered paths. */
export declare function getRouteSeo(path: string): RouteSeoArgs

/** Routes eligible for the sitemap + prerender (everything not noindex). */
export declare function indexableRoutes(): SeoRoute[]
