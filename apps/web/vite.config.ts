import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// PWA manifest fields per white-label brand (VITE_BRAND). This mirrors
// src/lib/brand.ts, which can't be imported here because it reads
// import.meta.env. Icons stay shared until a brand supplies its own set.
const PWA_BRANDS: Record<string, { name: string; short_name: string; description: string; theme_color: string }> = {
  stoop: {
    name: 'Stoop — Property Management',
    short_name: 'Stoop',
    description: 'Property management software built for landlords with a handful of units. Listings, screening, e-sign leases, online rent, maintenance.',
    theme_color: '#00A896',
  },
  hawk: {
    name: 'Hawk Investments — Property Management',
    short_name: 'Hawk',
    description: 'Property management by Hawk Investments. Listings, screening, e-sign leases, online rent, maintenance.',
    theme_color: '#1B2A41',
  },
}
const pwaBrand = PWA_BRANDS[process.env.VITE_BRAND || 'stoop'] ?? PWA_BRANDS.stoop

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icons/*.png', 'robots.txt', 'sitemap.xml'],
      manifest: {
        ...pwaBrand,
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'en-US',
        categories: ['business', 'productivity', 'finance'],
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
      },
      workbox: {
        // Cache app shell + JS/CSS, but skip the marketing illustrations —
        // they're large PNGs that don't need to live in the offline cache.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'icons/*.png', 'favicon-*.png', 'apple-touch-icon.png', 'stoop_logo*.png', 'brands/**/*.svg'],
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
