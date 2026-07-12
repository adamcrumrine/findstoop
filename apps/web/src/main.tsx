import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from '@findstoop/shared/hooks/AuthProvider'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { installGlobalErrorHandlers } from './lib/analytics'
import { applyBrandTheme } from './lib/brand'
import { applyPortalBrandTheme } from './lib/portalBrand'
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

// Register service worker — auto-updates silently in background
registerSW({ immediate: false })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
        <Toaster position="top-right" />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
