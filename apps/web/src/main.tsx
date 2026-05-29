import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from '@findstoop/shared/hooks/AuthProvider'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { installGlobalErrorHandlers } from './lib/analytics'
import App from './App.tsx'
import './index.css'

// Capture uncaught errors / promise rejections before anything renders.
installGlobalErrorHandlers()

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
