// Sliding-window rate limit + login-attempt logging for edge functions.
// Delegates to the SECURITY DEFINER RPCs in migration 20260523000040.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RateLimitArgs {
  key: string             // e.g. 'start-screening:127.0.0.1'
  windowSeconds: number   // length of the bucket
  maxCount: number        // allowed events per window
}

/**
 * Returns TRUE if the caller is still under the limit. FALSE = throttled.
 * Bumps the counter as a side effect on every call.
 * Silent on infrastructure failure (fails open — don't block users if our
 * own rate-limit DB is down).
 */
export async function checkRateLimit({ key, windowSeconds, maxCount }: RateLimitArgs): Promise<boolean> {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data, error } = await admin.rpc('rate_limit_check', {
      p_key:            key,
      p_window_seconds: windowSeconds,
      p_max_count:      maxCount,
    })
    if (error) return true
    return data === true
  } catch {
    return true
  }
}

/** Best-effort client IP from common headers. */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// ── Login attempt helpers ──────────────────────────────────────────────

/** Hash an email so we never store raw emails in login_attempts. */
export async function hashEmail(email: string): Promise<string> {
  const enc = new TextEncoder().encode(email.trim().toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function isAccountLocked(emailHash: string): Promise<boolean> {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data, error } = await admin.rpc('login_is_locked', { p_email_hash: emailHash })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

export async function recordLoginAttempt(args: {
  emailHash: string
  ip: string
  userAgent: string
  success: boolean
  reason?: string
  userId?: string | null
}): Promise<void> {
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    await admin.rpc('record_login_attempt', {
      p_email_hash: args.emailHash,
      p_ip_address: args.ip,
      p_user_agent: args.userAgent.slice(0, 500),
      p_success:    args.success,
      p_reason:     args.reason ?? null,
      p_user_id:    args.userId ?? null,
    })
  } catch {
    // Silent — security logging must never block the request
  }
}
