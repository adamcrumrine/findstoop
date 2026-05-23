// Best-effort visitor-state detection via a free IP-geolocation API.
//
// Returns a 2-letter US state code (e.g. 'OH') or null if detection fails.
// We use this as a soft UX block on signup pages — VPNs / corporate proxies
// can bypass it, but it filters out the casual case where someone in a
// currently-paused state tries to register.
//
// Server-side enforcement (e.g. property creation in a blocked state) is the
// actual safety net; this hook is a friendlier upstream gate.

import { useEffect, useState } from 'react'

interface GeoState {
  state: string | null     // 2-letter code like 'OH', null if undetected
  country: string | null   // 2-letter code like 'US'
  detected: boolean        // false during initial load, true once attempted
  failed: boolean          // true if the API call failed entirely
}

export function useGeoState(): GeoState {
  const [geo, setGeo] = useState<GeoState>({ state: null, country: null, detected: false, failed: false })

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()

    // ipapi.co — 1000 free requests/day, HTTPS, returns ISO-3166 region codes.
    // If they're down or rate-limit us, we fail open (no block) — the
    // property-creation step still enforces.
    fetch('https://ipapi.co/json/', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('geo lookup failed'))))
      .then((data: { region_code?: string; country_code?: string }) => {
        if (cancelled) return
        setGeo({
          state: data.region_code ?? null,
          country: data.country_code ?? null,
          detected: true,
          failed: false,
        })
      })
      .catch(() => {
        if (cancelled) return
        setGeo({ state: null, country: null, detected: true, failed: true })
      })

    // Cap at 2.5s — if the geo service is slow, just give up and let signup proceed.
    const timeout = setTimeout(() => {
      if (!cancelled) {
        ctrl.abort()
        setGeo((g) => g.detected ? g : { state: null, country: null, detected: true, failed: true })
      }
    }, 2500)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      ctrl.abort()
    }
  }, [])

  return geo
}
