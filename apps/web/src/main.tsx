import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from '@findstoop/shared/hooks/AuthProvider'
import ErrorBoundary from './components/shared/ErrorBoundary'
import AppToaster from './components/shared/AppToaster'
import OfflineBanner from './components/shared/OfflineBanner'
import { installGlobalErrorHandlers } from './lib/analytics'
import { applyBrandTheme } from './lib/brand'
import { applyPortalBrandTheme, applyUniversityBrandTheme } from './lib/portalBrand'
import App from './App.tsx'
import './index.css'

// Capture uncaught errors / promise rejections before anything renders.
installGlobalErrorHandlers()

// Point the accent palette / title / favicon at the active brand (VITE_BRAND)
// before first paint so white-label builds never flash Stoop styling.
applyBrandTheme()

// {company}.findstoop.com — layer the landlord's accent/title on top once
// their public brand resolves (async; generic portal renders meanwhile).
applyPortalBrandTheme()

// {university}.findstoop.com — static registry, so the university's palette and
// title apply synchronously before first paint (no fetch). No-op otherwise.
applyUniversityBrandTheme()

// Register service worker — auto-updates silently in background.
//
// autoUpdate reloads the page once a new worker takes over, but the browser
// only CHECKS for a new worker on a fresh navigation. A tab left open across
// a release kept serving the old build for days. Also check whenever the
// user comes back to the tab: if a release landed, the reload happens then —
// as they return, before they're mid-form — rather than on a timer.
registerSW({
  immediate: false,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    let lastCheck = 0
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      if (Date.now() - lastCheck < 60_000) return
      lastCheck = Date.now()
      registration.update().catch(() => { /* offline or transient — next return retries */ })
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <AppToaster />
        <OfflineBanner />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
