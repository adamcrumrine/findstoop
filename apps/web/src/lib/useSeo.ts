// Per-route SEO metadata updates without adding a dependency.
//
// SPAs without SSR have a limit on what client-side metadata buys you:
//   • Social-share unfurls (Twitter, Slack, FB) read the RAW HTML — they
//     don't execute JS, so they see whatever is in index.html
//   • Googlebot DOES execute JS and indexes the rendered page, so updating
//     title + description per-route still helps search ranking
//   • Browser tab title + bookmark name come from document.title at the
//     moment of bookmarking — also user-facing value
//
// So we keep strong defaults in index.html (for unfurls) AND update per-route
// (for Googlebot rendering + UX).
//
// Usage:
//   useSeo({
//     title: 'Pricing',
//     description: 'Simple per-unit pricing — $9/unit/month. Every feature included.',
//     path: '/pricing',
//   })

import { useEffect } from 'react'
import { BRAND, PORTAL_BASE_DOMAIN } from './brand'
import { getRouteSeo, SITE } from '../seo/routes.mjs'

const SITE_ORIGIN = BRAND.origin
const TITLE_SUFFIX = BRAND.titleSuffix

// Duplicate-content guard: the findstoop.com Vercel deployment also answers
// on landlord portal slugs ({company}.findstoop.com), university co-brand
// subdomains ({school}.findstoop.com), the my.findstoop.com resident front
// door, and any white-label custom domain (hawkinvestments.com). Every one
// of those hosts serves the identical SPA bundle and identical prerendered
// dist/<path>/index.html files as findstoop.com — to a search engine that's
// duplicate content, not a distinct site.
//
// Mechanism chosen: force `noindex` client-side, keyed off
// window.location.hostname, rather than rewriting the canonical tag.
//   - Googlebot executes JS, so a client-side noindex is honored the same as
//     a static one — this is effective, not cosmetic.
//   - The canonical tag is left alone (still self-referential to the current
//     origin/path) because noindex already removes the page from the index;
//     rewriting canonical on top would be redundant and, for portal pages
//     whose on-page copy genuinely differs per landlord/university, would
//     point Google at a findstoop.com URL that doesn't render the same
//     content — a worse signal than just leaving canonical alone.
//   - The prerendered static HTML (scripts/prerender.mjs) already bakes a
//     findstoop.com canonical into every dist/<path>/index.html regardless of
//     which host serves the file, which is the safe default for the non-JS
//     crawler case (social unfurlers, older bots) — nothing to change there.
// Derived from the brand registry's PORTAL_BASE_DOMAIN (not hardcoded here)
// so this stays correct if the platform's apex domain ever changes.
const CANONICAL_HOSTS = new Set([PORTAL_BASE_DOMAIN, `www.${PORTAL_BASE_DOMAIN}`])

/** Pure (no DOM) so it's unit-testable: true when `hostname` is the
 *  canonical marketing site and may be indexed. */
export function isCanonicalHost(hostname: string): boolean {
  return CANONICAL_HOSTS.has(hostname)
}

interface SeoArgs {
  /** Page-specific title (omit the brand — we append it). */
  title: string
  /** 50–160 chars. Should be derived from existing on-page copy. */
  description: string
  /** Path WITHOUT origin, e.g. '/pricing'. Used for canonical + og:url. */
  path: string
  /** Optional override for og:image (defaults to the brand's horizontal logo). */
  image?: string
  /** Set true on auth pages / etc. to keep search engines out. */
  noindex?: boolean
}

function upsertMeta(selector: string, attr: 'name' | 'property', name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function useSeo({ title, description, path, image, noindex }: SeoArgs) {
  useEffect(() => {
    const fullTitle = title + TITLE_SUFFIX
    const canonical = `${SITE_ORIGIN}${path}`
    const ogImage   = image || `${SITE_ORIGIN}${BRAND.logo.horizontal}`
    // Route-level noindex OR a non-canonical host (see CANONICAL_HOSTS above).
    const effectiveNoindex = noindex || !isCanonicalHost(window.location.hostname)

    document.title = fullTitle

    upsertMeta('meta[name="description"]',           'name',     'description',     description)
    upsertMeta('meta[name="robots"]',                'name',     'robots',          effectiveNoindex ? 'noindex, nofollow' : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1')

    upsertMeta('meta[property="og:title"]',          'property', 'og:title',        fullTitle)
    upsertMeta('meta[property="og:description"]',    'property', 'og:description',  description)
    upsertMeta('meta[property="og:url"]',            'property', 'og:url',          canonical)
    upsertMeta('meta[property="og:image"]',          'property', 'og:image',        ogImage)

    upsertMeta('meta[name="twitter:title"]',         'name',     'twitter:title',   fullTitle)
    upsertMeta('meta[name="twitter:description"]',   'name',     'twitter:description', description)
    upsertMeta('meta[name="twitter:image"]',         'name',     'twitter:image',   ogImage)

    upsertLink('canonical', canonical)
  }, [title, description, path, image, noindex])
}

/**
 * Per-route SEO driven by the single-source-of-truth manifest
 * (src/seo/routes.mjs). Marketing pages call this instead of hand-writing
 * useSeo values, so the client-side meta can never drift from what the
 * build-time prerender (scripts/prerender.mjs) and sitemap emit.
 *
 * The manifest holds Stoop copy (the only prerendered/deployed marketing
 * site). White-label and portal brands re-point the product name at runtime,
 * matching the previous inline `${BRAND.name}` template behavior.
 */
export function useRouteSeo(path: string) {
  const base = getRouteSeo(path) // throws loudly if the path isn't registered
  const args =
    BRAND.name === SITE.name
      ? base
      : {
          ...base,
          title: base.title.split(SITE.name).join(BRAND.name),
          description: base.description.split(SITE.name).join(BRAND.name),
        }
  useSeo(args)
}
