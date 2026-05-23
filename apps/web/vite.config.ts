import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'FindStoop',
        short_name: 'FindStoop',
        description: 'Property management made simple',
        theme_color: '#00A896',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
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
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'icons/*.png', 'favicon-*.png', 'apple-touch-icon.png', 'findstoop-logo*.png'],
        globIgnores: ['**/illustrations/**'],
        // Network-first for API calls, cache-first for assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
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
        navigateFallbackDenylist: [/^\/api\//, /\/offline\.html$/],
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
