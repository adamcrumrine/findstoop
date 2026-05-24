// Lightweight client-side analytics for the admin dashboard.
//
// Design notes:
//   • Session id lives in sessionStorage so each browser tab = one session.
//     Reset when the tab closes — not a long-lived cookie.
//   • We NEVER send emails, names, phone, addresses, or payment data.
//     Metadata is restricted to type-safe primitives at the callsite.
//   • Page paths are normalized: query strings stripped, UUIDs in the path
//     replaced with ':id' so paths cluster meaningfully (/manager/properties/abc
//     → /manager/properties/:id).
//   • Failures are silent — we never block the UI on a tracking write.

import { supabase } from './supabase'

type EventType = 'page_view' | 'sign_in' | 'sign_up' | 'sign_out' | 'action' | 'error'

interface TrackArgs {
  event_type: EventType
  page_path?: string
  metadata?: Record<string, string | number | boolean | null>
}

const SESSION_KEY = 'findstoop_session_id'

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

const UUID_RE = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ALPHANUM_ID_RE = /\/[0-9a-zA-Z_-]{20,}/g

/** Strip query strings and replace dynamic segments with :id. */
export function normalizePath(rawPath: string): string {
  const pathOnly = rawPath.split('?')[0].split('#')[0]
  return pathOnly
    .replace(UUID_RE, '/:id')
    .replace(ALPHANUM_ID_RE, '/:id')
}

let lastLoggedPath: string | null = null

/** Fire-and-forget event log. Caller is responsible for keeping metadata PII-free. */
export async function track({ event_type, page_path, metadata }: TrackArgs): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    // Look up role lazily — admin dashboard cares about role distribution.
    let user_role: string | null = null
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      user_role = profile?.role ?? null
    }

    // Don't log admin's own activity — the admin dashboard is for watching
    // *users*, not for the admin to watch themselves. Skipping at the source
    // keeps the analytics_events table small and the activity feed clean.
    if (user_role === 'admin') return

    await supabase.from('analytics_events').insert({
      session_id: getSessionId(),
      user_id: user?.id ?? null,
      user_role,
      event_type,
      page_path: page_path ? normalizePath(page_path) : null,
      metadata: metadata ?? null,
    })
  } catch {
    // Silent — analytics must never break the UX.
  }
}

/**
 * Track a page view. Deduped: consecutive calls with the same path are no-ops.
 * Wire this into the BrowserRouter / route change effect.
 */
export function trackPageView(path: string): void {
  const normalized = normalizePath(path)
  if (normalized === lastLoggedPath) return
  lastLoggedPath = normalized
  void track({ event_type: 'page_view', page_path: normalized })
}

/** Helper: track named user actions (button clicks, form submissions, etc.). */
export function trackAction(name: string, metadata?: TrackArgs['metadata']): void {
  void track({ event_type: 'action', metadata: { name, ...(metadata ?? {}) } })
}

/** Helper: track sign-in / sign-up / sign-out. */
export function trackAuth(kind: 'sign_in' | 'sign_up' | 'sign_out'): void {
  void track({ event_type: kind })
}

/** Helper: track client-side error. */
export function trackError(message: string, metadata?: TrackArgs['metadata']): void {
  void track({
    event_type: 'error',
    metadata: { message: message.slice(0, 200), ...(metadata ?? {}) },
  })
}
