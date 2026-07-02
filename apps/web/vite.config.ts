import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

// Build-time brand data (VITE_BRAND) for the PWA manifest and the static
// index.html metadata. This mirrors src/lib/brand.ts, which can't be imported
// here because it reads import.meta.env.
interface PwaIcon { src: string; sizes: string; type: string; purpose?: string }
interface BuildBrand {
  pwa: { name: string; short_name: string; description: string; theme_color: string; icons?: PwaIcon[] }
  /** Static-HTML metadata — null means "leave index.html's Stoop defaults". */
  html: {
    title: string
    description: string
    ogDescription: string
    name: string
    origin: string
    ogImage: string
    supportEmail: string
    faviconSvg: string
    appleTouchIcon: string
  } | null
}

const BUILD_BRANDS: Record<string, BuildBrand> = {
  stoop: {
    pwa: {
      name: 'Stoop — Property Management',
      short_name: 'Stoop',
      description: 'Property management software built for landlords with a handful of units. Listings, screening, e-sign leases, online rent, maintenance.',
      theme_color: '#00A896',
    },
    html: null,
  },
  hawk: {
    pwa: {
      name: 'Hawk Investments — Property Management',
      short_name: 'Hawk',
      description: 'Property management by Hawk Investments. Listings, screening, e-sign leases, online rent, maintenance.',
      theme_color: '#1B2A41',
      icons: [
        { src: '/brands/hawk/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
        { src: '/brands/hawk/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
        { src: '/brands/hawk/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
        { src: '/brands/hawk/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
        { src: '/brands/hawk/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
        { src: '/brands/hawk/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/brands/hawk/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
        { src: '/brands/hawk/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    html: {
      title: 'Hawk Investments — Resident portal & property management',
      description: 'Hawk Investments combines listings, verified pre-qualification, e-sign leases, rent collection, and maintenance in one place for our properties and residents.',
      ogDescription: 'Pay rent, request maintenance, sign your lease, and apply for a home — all online with Hawk Investments.',
      name: 'Hawk Investments',
      origin: 'https://hawkinvestments.com',
      ogImage: 'https://hawkinvestments.com/brands/hawk/logo-horizontal.svg',
      supportEmail: 'support@hawkinvestments.com',
      faviconSvg: '/brands/hawk/logo-square.svg',
      appleTouchIcon: '/brands/hawk/icons/icon-180x180.png',
    },
  },
}
const buildBrand = BUILD_BRANDS[process.env.VITE_BRAND || 'stoop'] ?? BUILD_BRANDS.stoop
const pwaBrand = buildBrand.pwa

/** Rewrite the content attribute of a <meta name|property="key"> tag. */
function setMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const re = new RegExp(`(<meta ${attr}="${key.replace(/[:.]/g, '\\$&')}" content=")[^"]*(")`)
  return html.replace(re, `$1${value}$2`)
}

// White-label builds ship brand-correct static metadata — social-share
// crawlers read raw HTML and never run the runtime applyBrandTheme() swap.
function brandIndexHtml() {
  return {
    name: 'brand-index-html',
    transformIndexHtml(html: string) {
      const b = buildBrand.html
      if (!b) return html

      html = html.replace(/<title>[^<]*<\/title>/, `<title>${b.title}</title>`)
      html = setMeta(html, 'name', 'theme-color', pwaBrand.theme_color)
      html = setMeta(html, 'name', 'description', b.description)
      html = setMeta(html, 'name', 'author', b.name)
      html = setMeta(html, 'name', 'application-name', b.name)
      html = setMeta(html, 'name', 'apple-mobile-web-app-title', b.name)
      html = setMeta(html, 'property', 'og:site_name', b.name)
      html = setMeta(html, 'property', 'og:title', b.title)
      html = setMeta(html, 'property', 'og:description', b.ogDescription)
      html = setMeta(html, 'property', 'og:url', `${b.origin}/`)
      html = setMeta(html, 'property', 'og:image', b.ogImage)
      html = setMeta(html, 'property', 'og:image:alt', `${b.name} logo`)
      html = setMeta(html, 'property', 'og:image:type', 'image/svg+xml')
      html = setMeta(html, 'name', 'twitter:title', b.title)
      html = setMeta(html, 'name', 'twitter:description', b.ogDescription)
      html = setMeta(html, 'name', 'twitter:image', b.ogImage)
      html = setMeta(html, 'name', 'twitter:image:alt', `${b.name} logo`)
      html = html.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${b.origin}/" />`)

      // Swap the Stoop PNG favicons for the brand's own icons.
      html = html
        .replace(/<link rel="icon" type="image\/png" sizes="32x32" href="[^"]*" \/>/, `<link rel="icon" type="image/svg+xml" href="${b.faviconSvg}" />`)
        .replace(/\s*<link rel="icon" type="image\/png" sizes="16x16" href="[^"]*" \/>/, '')
        .replace(/<link rel="apple-touch-icon" href="[^"]*" \/>/, `<link rel="apple-touch-icon" href="${b.appleTouchIcon}" />`)

      // Replace the Stoop structured data with a minimal brand Organization —
      // white-label sites aren't selling the SaaS, so no SoftwareApplication offer.
      const ldJson = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `${b.origin}/#org`,
            name: b.name,
            url: `${b.origin}/`,
            logo: b.ogImage,
            email: b.supportEmail,
          },
          {
            '@type': 'WebSite',
            '@id': `${b.origin}/#website`,
            url: `${b.origin}/`,
            name: b.name,
            publisher: { '@id': `${b.origin}/#org` },
            inLanguage: 'en-US',
          },
        ],
      }
      html = html.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json">\n    ${JSON.stringify(ldJson, null, 2).replace(/\n/g, '\n    ')}\n    </script>`,
      )
      html = html.replace(
        /<noscript>[^<]*<\/noscript>/,
        `<noscript>${b.name} requires JavaScript. Please enable JavaScript or use a modern browser to continue.</noscript>`,
      )
      return html
    },
    // The static public/ assets (offline page, sitemap, robots) are copied
    // verbatim by Vite; rebrand them in the build output so a white-label
    // deploy never serves Stoop naming or findstoop.com URLs from them.
    closeBundle() {
      const b = buildBrand.html
      if (!b) return
      const outDir = resolve(__dirname, 'dist')
      for (const file of ['offline.html', 'sitemap.xml', 'robots.txt']) {
        const path = resolve(outDir, file)
        if (!existsSync(path)) continue
        const rebranded = readFileSync(path, 'utf8')
          .replace(/https:\/\/findstoop\.com/g, b.origin)
          .replace(/findstoop\.com/g, b.origin.replace(/^https:\/\//, ''))
          .replace(/FindStoop|Stoop/g, b.name)
        writeFileSync(path, rebranded)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    brandIndexHtml(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icons/*.png', 'robots.txt', 'sitemap.xml'],
      manifest: {
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'en-US',
        categories: ['business', 'productivity', 'finance'],
        // Brands without their own icon set fall back to the shared one.
        icons: [
          { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        ...pwaBrand,
      },
      workbox: {
        // Cache app shell + JS/CSS, but skip the marketing illustrations —
        // they're large PNGs that don't need to live in the offline cache.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'icons/*.png', 'favicon-*.png', 'apple-touch-icon.png', 'stoop_logo*.png', 'brands/**/*.{svg,png}'],
        globIgnores: ['**/illustrations/**'],
        // Network-first for API calls, cache-first for assets
        runtimeCaching: [
          // NOTE: Supabase REST/Auth/Storage calls are intentionally NOT cached
          // by the service worker. They contain RLS-scoped data, mutate often,
          // and previously caused the SW to wait up to 10s before falling back
          // to stale cache — which manifested as pages "loading forever".
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Marketing illustrations — runtime CacheFirst, NOT precached.
            // Loaded on demand, then served from cache for repeat visits.
            urlPattern: /\/illustrations\/.*\.(png|webp|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'marketing-illustrations',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        // SPA fallback — serve index.html for all navigation requests
        // so React Router handles the URL. /offline.html is kept as a
        // static asset but only shown by the React app when offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /\/offline\.html$/, /\/robots\.txt$/, /\/sitemap\.xml$/],
      },
      devOptions: {
        enabled: false, // disable SW in dev to avoid caching issues
      },
    }),
  ],
  resolve: {
    alias: {
      '@findstoop/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-stripe':   ['@stripe/stripe-js', '@stripe/react-stripe-js'],
          'vendor-charts':   ['recharts'],
        },
      },
    },
  },
})
