// Refresh stale data when the app comes back to the foreground.
//
// Installed-PWA users have no refresh button: they background the app,
// come back 20 minutes later, and see whatever loaded at launch. This hook
// calls `refresh` when the tab becomes visible again after being hidden
// for at least `staleMs`, and when the browser regains connectivity —
// the two moments an app-like experience is expected to catch up on its own.
//
// The default threshold is generous (5 minutes) on purpose: most hooks'
// reload() flips their `loading` flag, so refreshing on every quick
// app-switch would flash skeletons over data the user was just reading.

import { useEffect, useRef } from 'react'

export function useForegroundRefresh(refresh: () => void, staleMs = 5 * 60_000) {
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })

  useEffect(() => {
    if (typeof document === 'undefined') return
    let hiddenAt: number | null = null

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (hiddenAt !== null && Date.now() - hiddenAt >= staleMs) {
        hiddenAt = null
        refreshRef.current()
      }
    }
    const onOnline = () => {
      if (document.visibilityState === 'visible') refreshRef.current()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [staleMs])
}
