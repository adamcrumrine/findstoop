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

const SITE_ORIGIN = 'https://findstoop.com'
const TITLE_SUFFIX = ' · FindStoop'

interface SeoArgs {
  /** Page-specific title (omit the brand — we append it). */
  title: string
  /** 50–160 chars. Should be derived from existing on-page copy. */
  description: string
  /** Path WITHOUT origin, e.g. '/pricing'. Used for canonical + og:url. */
  path: string
  /** Optional override for og:image (defaults to /findstoop-logo.png). */
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
    const ogImage   = image || `${SITE_ORIGIN}/findstoop-logo.png`

    document.title = fullTitle

    upsertMeta('meta[name="description"]',           'name',     'description',     description)
    upsertMeta('meta[name="robots"]',                'name',     'robots',          noindex ? 'noindex, nofollow' : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1')

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
