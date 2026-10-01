import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@findstoop/shared/hooks/useAuth'
import Dialog from './Dialog'

// Signs a user out after a stretch of inactivity, with a one-minute warning.
//
// Without this a session lived forever on whatever device signed in — the
// access token refreshes itself hourly and Supabase's own session limits are
// off. A landlord's dashboard holds tenant contact details, bank status and
// screening results, so a laptop left open in an office was a standing risk.
//
// Activity is shared across tabs through localStorage: typing in one tab must
// not let another tab, idle in the background, sign the user out from under
// it. Each tab reads the shared "last active" stamp rather than its own.
//
// The deadline is checked on a coarse interval against wall-clock time, not a
// single long setTimeout — phones suspend timers in background tabs, and a
// timeout would fire late (or never) after the device wakes. Comparing
// Date.now() to the stamp is correct the moment the page resumes.

const STORAGE_KEY = 'stoop:last-active'
const WARN_MS = 60_000
const TICK_MS = 5_000
// Recording on every mousemove would hammer localStorage; activity within
// this window is already "now" for any timeout measured in minutes.
const WRITE_THROTTLE_MS = 15_000
const EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const

function readLastActive(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(v) && v > 0 ? v : Date.now()
  } catch {
    return Date.now()
  }
}

function writeLastActive(t: number) {
  try { localStorage.setItem(STORAGE_KEY, String(t)) } catch { /* private mode — this tab still tracks itself */ }
}

interface Props {
  /** Inactivity allowed before signing out, warning included. */
  timeoutMs: number
  /** Where to send the user afterwards ('/login' or '/login/renter'). */
  loginPath: string
}

export default function IdleSignOut({ timeoutMs, loginPath }: Props) {
  const { signOut } = useAuth()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastWrite = useRef(0)
  const signingOut = useRef(false)
  // Mirror for the activity listener, which is bound once.
  const secondsLeftRef = useRef<number | null>(null)
  useEffect(() => { secondsLeftRef.current = secondsLeft }, [secondsLeft])

  const markActive = useCallback(() => {
    const now = Date.now()
    if (now - lastWrite.current < WRITE_THROTTLE_MS) return
    lastWrite.current = now
    writeLastActive(now)
  }, [])

  const stayActive = useCallback(() => {
    lastWrite.current = 0
    markActive()
    setSecondsLeft(null)
  }, [markActive])

  const expire = useCallback(async () => {
    if (signingOut.current) return
    signingOut.current = true
    try { await signOut() } catch { /* the redirect below still ends the session view */ }
    // Hard redirect, like the manual sign-out buttons: navigate() can race
    // AuthProvider's listener and bounce back into a protected route.
    window.location.href = `${loginPath}?reason=idle`
  }, [signOut, loginPath])

  useEffect(() => {
    // A fresh mount starts the clock, so a session restored from a tab that
    // was closed hours ago isn't signed out the instant it opens — the
    // Supabase session itself is still valid, and the person is clearly here.
    lastWrite.current = 0
    markActive()

    // While the warning is up, ordinary activity doesn't dismiss it — the
    // person has to answer it, so a stray scroll can't hide the countdown.
    const onActivity = () => { if (secondsLeftRef.current === null) markActive() }
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const tick = () => {
      const idleFor = Date.now() - readLastActive()
      const remaining = timeoutMs - idleFor
      if (remaining <= 0) { void expire(); return }
      if (remaining <= WARN_MS) setSecondsLeft(Math.ceil(remaining / 1000))
      else setSecondsLeft(null) // another tab was used — stand down
    }
    const id = window.setInterval(tick, TICK_MS)
    // Check straight away when a backgrounded tab comes back into view.
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [timeoutMs, markActive, expire])

  // A smooth one-second countdown while the warning is showing.
  useEffect(() => {
    if (secondsLeft === null) return
    const id = window.setTimeout(() => {
      const remaining = timeoutMs - (Date.now() - readLastActive())
      if (remaining <= 0) void expire()
      else setSecondsLeft(remaining <= WARN_MS ? Math.ceil(remaining / 1000) : null)
    }, 1000)
    return () => window.clearTimeout(id)
  }, [secondsLeft, timeoutMs, expire])

  return (
    <Dialog
      open={secondsLeft !== null}
      onClose={stayActive}
      overlayClassName="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      panelClassName="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
    >
      {(titleId) => (
        <>
          <h2 id={titleId} className="text-lg font-semibold text-ink">Still there?</h2>
          <p className="text-sm text-mute mt-2 leading-relaxed">
            For your security you'll be signed out in{' '}
            <strong className="text-ink tabular-nums">{secondsLeft ?? 0}s</strong> because there's been no
            activity for a while.
          </p>
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={() => void expire()}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
              Sign out
            </button>
            <button type="button" onClick={stayActive}
              className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
              Stay signed in
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
