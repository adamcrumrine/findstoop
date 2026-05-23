import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import { AuthProvider } from '@findstoop/shared/hooks/AuthProvider'
import App from './App.tsx'
import './index.css'

// Register service worker — auto-updates silently in background
registerSW({ immediate: false })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      <Toaster position="top-right" />
    </AuthProvider>
  </React.StrictMode>,
)
