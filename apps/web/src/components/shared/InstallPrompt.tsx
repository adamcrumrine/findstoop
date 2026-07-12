// "Add to home screen" nudge for the tenant portal — tenants are phone-first
// and open the app a dozen times a year, exactly the visit pattern where an
// icon on the home screen beats a bookmark.
//
// Shows a dismissible banner on the SECOND visit (first visits are for the
// task at hand, not app adoption), never in standalone mode, and never again
// after dismissal. Chromium: uses the captured beforeinstallprompt event.
// iOS Safari (no install API): shows Share → Add to Home Screen instructions.

import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { BRAND } from '../../lib/brand'

const DISMISS_KEY = 'stoop_install_dismissed'
const VISITS_KEY = 'stoop_visit_count'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Captured at module scope — the browser fires beforeinstallprompt once,
// early, possibly before the component mounts.
let deferredPrompt: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
  })
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return
    const visits = Number(localStorage.getItem(VISITS_KEY) ?? '0') + 1
    localStorage.setItem(VISITS_KEY, String(visits))
    if (visits < 2) return
    if (isIos()) {
      setIos(true)
      setShow(true)
    } else if (deferredPrompt) {
      setShow(true)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  const install = async () => {
    if (!deferredPrompt) return dismiss()
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    if (outcome === 'accepted') setShow(false)
    else dismiss()
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 inset-x-3 z-40 max-w-md mx-auto bg-white border border-gray-200 rounded-2xl shadow-lg p-4 print:hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full inline-flex items-center justify-center text-gray-400 hover:bg-gray-100"
      >
        <X className="w-4 h-4" strokeWidth={2} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <img src={BRAND.logo.square} alt="" className="w-10 h-10 rounded-xl object-contain shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Add {BRAND.name} to your home screen</p>
          {ios ? (
            <p className="text-xs text-mute mt-1 leading-relaxed">
              Tap <Share className="w-3.5 h-3.5 inline -mt-0.5" strokeWidth={2} aria-label="Share" /> then{' '}
              <span className="font-medium whitespace-nowrap">
                <SquarePlus className="w-3.5 h-3.5 inline -mt-0.5" strokeWidth={2} aria-hidden="true" /> Add to Home Screen
              </span>{' '}
              — rent, maintenance, and messages one tap away.
            </p>
          ) : (
            <>
              <p className="text-xs text-mute mt-1">Rent, maintenance, and messages one tap away.</p>
              <button
                type="button"
                onClick={install}
                className="mt-2.5 bg-brand-600 text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-brand-700 transition-colors"
              >
                Install app
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
