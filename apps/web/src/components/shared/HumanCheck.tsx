// HumanCheck — Cloudflare Turnstile, the "are you human" check on signup,
// sign-in, password reset, and the public rental application.
//
// Off until VITE_TURNSTILE_SITE_KEY is set: renders nothing and reports no
// token, and every caller treats "off" as passed. Most people never see it —
// appearance 'interaction-only' shows a checkbox only when Cloudflare isn't
// sure. Tokens are single-use: call reset() after any failed submit so the
// next attempt gets a fresh one.
//
// The token is verified server-side — by Supabase Auth for auth calls, and by
// supabase/functions/_shared/turnstile.ts for edge functions.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''

/** True when the human check is switched on for this build. */
export const HUMAN_CHECK_ENABLED = SITE_KEY.length > 0

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile failed to load')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export interface HumanCheckHandle { reset: () => void }

interface Props {
  /** Fresh token, or null when it expires or errors. */
  onToken: (token: string | null) => void
  className?: string
}

const HumanCheck = forwardRef<HumanCheckHandle, Props>(function HumanCheck({ onToken, className }, ref) {
  const el = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null)
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
    },
  }), [])

  useEffect(() => {
    if (!HUMAN_CHECK_ENABLED || !el.current) return
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !el.current || !window.turnstile) return
      widgetId.current = window.turnstile.render(el.current, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        callback: (t: string) => onTokenRef.current(t),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      })
    }).catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  if (!HUMAN_CHECK_ENABLED) return null
  return <div ref={el} className={className} />
})

export default HumanCheck
