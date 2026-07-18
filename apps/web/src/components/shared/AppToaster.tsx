// Viewport-aware toast host. On phones, toasts render bottom-center just
// above the fixed tab bar (the thumb zone, and clear of the notch); on
// desktop they keep the original top-right placement.

import { useEffect, useRef, useState } from 'react'
import { Toaster, useToasterStore } from 'react-hot-toast'

const MOBILE_QUERY = '(max-width: 639px)'

// Subtle haptic tick alongside outcome toasts. Watching the toast store
// gives every existing toast.success/error call haptics without touching
// the ~100 call sites. navigator.vibrate is a no-op where unsupported
// (iOS Safari, desktops) — Android gets the feedback.
function useToastHaptics() {
  const { toasts } = useToasterStore()
  const seen = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue
      seen.current.add(t.id)
      if (t.type === 'success') navigator.vibrate(12)
      else if (t.type === 'error') navigator.vibrate([15, 40, 15])
    }
  }, [toasts])
}

export default function AppToaster() {
  useToastHaptics()
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return mobile ? (
    <Toaster
      position="bottom-center"
      containerStyle={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
    />
  ) : (
    <Toaster position="top-right" />
  )
}
