#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Post-build SEO prerender + sitemap generator.  Runs after `vite build`
// (see package.json "build") and consumes the SAME manifest the client
// meta uses: src/seo/routes.mjs.  Zero dependencies — Node stdlib only.
//
// WHAT IT DOES
//   1. For every indexable route in the manifest, copies dist/index.html to
//      dist/<path>/index.html with the route's <title>, meta description,
//      canonical, robots, og:*, twitter:* swapped in, and the route's
//      JSON-LD (if any) APPENDED as a second <script type="application/ld+json">
//      — the site-wide @graph stays in place. The root route ('/') is
//      updated in dist/index.html itself.
//   2. Writes dist/sitemap.xml (with <lastmod>) from the same route list.
//      public/sitemap.xml was deleted — this generated file is the only
//      sitemap, so it can never drift from the routes.
//
// WHY THIS WORKS ON VERCEL (static analysis, root vercel.json)
//   Vercel's request pipeline runs its filesystem check BEFORE user
//   `rewrites` (rewrites sit in the handle:"filesystem"-follows phase of the
//   routing table). So GET /pricing finds dist/pricing/index.html and serves
//   it — social crawlers (which never execute JS) get the route's real tags.
//   Only paths with no file behind them fall through to the SPA rewrite
//   [{ source: "/((?!api/).*)", destination: "/index.html" }].
//   "trailingSlash": false in root vercel.json makes /pricing/ 308-redirect
//   to /pricing, so the directory copies can't create /pricing vs /pricing/
//   duplicate-content splits (canonical tags also point at the no-slash URL).
//   The service worker's navigateFallback still serves the SPA shell for
//   repeat visitors — prerendered copies matter for crawlers + first paint,
//   and they are deliberately NOT precached (they're written after workbox
//   generates the SW manifest).
//
// WHITE-LABEL BUILDS (VITE_BRAND != stoop) are skipped: the manifest is
// findstoop.com copy, and white-label metadata is handled by the
// brand-index-html plugin in vite.config.ts. Those brands are portal
// experiences with no marketing surface to prerender.
//
// FAILURE POLICY: loud. Any anchor tag not found, any route emitting
// nothing, or a sitemap count mismatch exits non-zero and fails the build.
// Silent partial success is the failure mode this script exists to avoid.
//
// TO ADD A ROUTE: add its entry to src/seo/routes.mjs and its <Route> to
// App.tsx. This script and the sitemap pick it up automatically.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { SITE, indexableRoutes } from '../src/seo/routes.mjs'

const brand = process.env.VITE_BRAND || 'stoop'
if (brand !== 'stoop') {
  console.log(`[prerender] VITE_BRAND=${brand} — white-label build, skipping prerender + sitemap (findstoop.com only).`)
  process.exit(0)
}

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const INDEX = join(DIST, 'index.html')
if (!existsSync(INDEX)) fail(`dist/index.html not found at ${INDEX} — run vite build first`)

const template = readFileSync(INDEX, 'utf8')
const routes = indexableRoutes()

function fail(msg) {
  console.error(`\n[prerender] FATAL: ${msg}\n`)
  process.exit(1)
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Replace exactly one occurrence of `re` in `html` or die. The replacement
 * goes through a function so `$` in copy ("$9 per unit") is never treated
 * as a regex replacement pattern.
 */
function swap(html, re, replacement, label, route) {
  const m = html.match(re)
  if (!m) fail(`anchor not found for ${label} while prerendering ${route} (regex: ${re})`)
  return html.replace(re, () => replacement)
}

const metaRe = (attr, key) =>
  new RegExp(`<meta\\s+${attr}="${key.replace(/[:./-]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`)

function renderRoute(r) {
  const fullTitle = r.title + SITE.titleSuffix
  const canonical = SITE.origin + r.path
  const desc = r.description
  const ogImage = SITE.origin + (r.image || SITE.ogImage)
  const robots = r.noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'

  let html = template
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(fullTitle)}</title>`, '<title>', r.path)
  html = swap(html, metaRe('name', 'description'), `<meta name="description" content="${esc(desc)}" />`, 'meta description', r.path)
  html = swap(html, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(canonical)}" />`, 'canonical', r.path)
  html = swap(html, metaRe('name', 'robots'), `<meta name="robots" content="${robots}" />`, 'robots', r.path)

  html = swap(html, metaRe('property', 'og:title'), `<meta property="og:title" content="${esc(fullTitle)}" />`, 'og:title', r.path)
  html = swap(html, metaRe('property', 'og:description'), `<meta property="og:description" content="${esc(desc)}" />`, 'og:description', r.path)
  html = swap(html, metaRe('property', 'og:url'), `<meta property="og:url" content="${esc(canonical)}" />`, 'og:url', r.path)
  html = swap(html, metaRe('property', 'og:image'), `<meta property="og:image" content="${esc(ogImage)}" />`, 'og:image', r.path)
  // TRUE pixel dimensions of the share image (index.html historically claimed
  // 1200×630; the wordmark is 1149×345 — see SITE in routes.mjs).
  html = swap(html, metaRe('property', 'og:image:width'), `<meta property="og:image:width" content="${SITE.ogImageWidth}" />`, 'og:image:width', r.path)
  html = swap(html, metaRe('property', 'og:image:height'), `<meta property="og:image:height" content="${SITE.ogImageHeight}" />`, 'og:image:height', r.path)

  html = swap(html, metaRe('name', 'twitter:title'), `<meta name="twitter:title" content="${esc(fullTitle)}" />`, 'twitter:title', r.path)
  html = swap(html, metaRe('name', 'twitter:description'), `<meta name="twitter:description" content="${esc(desc)}" />`, 'twitter:description', r.path)
  html = swap(html, metaRe('name', 'twitter:image'), `<meta name="twitter:image" content="${esc(ogImage)}" />`, 'twitter:image', r.path)

  // Per-route structured data — a SECOND ld+json block; the site-wide
  // @graph (Organization/WebSite/SoftwareApplication) stays untouched.
  if (r.jsonLd) {
    const json = JSON.stringify(r.jsonLd).replace(/</g, '\\u003c')
    html = swap(
      html,
      /<\/head>/,
      `<script type="application/ld+json">${json}</script>\n  </head>`,
      'route JSON-LD (</head>)',
      r.path,
    )
  }
  return html
}

// ── 1. Per-route prerendered copies ──────────────────────────────────────
const emitted = []
for (const r of routes) {
  const html = renderRoute(r)
  if (!html || html.length < 1000) fail(`route ${r.path} produced empty/suspiciously small output`)
  const outFile = r.path === '/' ? INDEX : join(DIST, ...r.path.split('/').filter(Boolean), 'index.html')
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, html)
  emitted.push(outFile)
}
if (emitted.length !== routes.length) fail(`emitted ${emitted.length} files for ${routes.length} routes`)

// ── 2. Sitemap from the same manifest ────────────────────────────────────
const urlXml = routes
  .map((r) => {
    const loc = SITE.origin + r.path
    const parts = [`    <loc>${esc(loc)}</loc>`]
    if (r.lastmod) parts.push(`    <lastmod>${r.lastmod}</lastmod>`)
    if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`)
    if (r.priority !== undefined) parts.push(`    <priority>${r.priority.toFixed(2)}</priority>`)
    return `  <url>\n${parts.join('\n')}\n  </url>`
  })
  .join('\n')
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlXml}\n</urlset>\n`

const urlCount = (sitemap.match(/<url>/g) || []).length
if (urlCount !== routes.length) fail(`sitemap has ${urlCount} <url> entries for ${routes.length} routes`)
writeFileSync(join(DIST, 'sitemap.xml'), sitemap)

console.log(`[prerender] ${emitted.length} routes prerendered, sitemap.xml with ${urlCount} URLs:`)
for (const f of emitted) console.log(`  ${f.slice(DIST.length).replaceAll('\\', '/')}`)
