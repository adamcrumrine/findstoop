// Auth security checks that run *around* Supabase Auth — Supabase Auth
// itself doesn't expose pre/post hooks we can plug into, so the client
// calls this edge function before + after signIn to enforce:
//
//   • Account lockout — block after 5 failed attempts in 15 minutes
//   • New-device email alert — notify the user when a sign-in lands from
//     an IP/user-agent we haven't seen for them before
//
// Called from Login.tsx as a pair:
//   action='check'  → returns {locked: bool} (does account-lockout precheck)
//   action='report' → records the attempt (success or fail), and on success
//                     fingerprints the device + emails the user if new
//
// Note: this is *additive* to Supabase Auth's own rate limits, not a
// replacement. Supabase blocks at 30 attempts/hour by default.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import {
  checkRateLimit, clientIp, hashEmail,
  isAccountLocked, recordLoginAttempt,
} from '../_shared/rateLimit.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

async function deviceFingerprint(userAgent: string, ipCity: string, ipRegion: string): Promise<string> {
  // Hash a coarse fingerprint — UA family + city/region. Stable across
  // page reloads but tolerates network changes (won't false-alarm on
  // every WiFi switch).
  const buf = new TextEncoder().encode(`${userAgent}|${ipCity}|${ipRegion}`)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function geoLookup(ip: string): Promise<{ country?: string; region?: string; city?: string }> {
  if (ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::1')) {
    return { country: 'US', region: 'DEV', city: 'localhost' }
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`)
    if (!res.ok) return {}
    const data = await res.json() as { country_code?: string; region_code?: string; city?: string }
    return { country: data.country_code, region: data.region_code, city: data.city }
  } catch {
    return {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)

  // IP-level rate limit — 30 sign-in checks per minute per IP. Catches
  // password-spraying that targets many emails from one host.
  const ip = clientIp(req)
  const ok = await checkRateLimit({ key: `auth-guard:${ip}`, windowSeconds: 60, maxCount: 30 })
  if (!ok) return json(req, { error: 'Too many sign-in attempts. Wait a minute.' }, { status: 429 })

  try {
    const body = await req.json() as {
      action?: 'check' | 'report'
      email?: string
      success?: boolean
      reason?: string
      user_id?: string
    }

    if (!body.action || !body.email) {
      return json(req, { error: 'action and email required' }, { status: 400 })
    }

    const emailHash = await hashEmail(body.email)
    const userAgent = req.headers.get('user-agent') ?? 'unknown'

    if (body.action === 'check') {
      const locked = await isAccountLocked(emailHash)
      return json(req, { locked })
    }

    // SECURITY: never trust verifiedUserId. For a "success" report the client
    // has just authenticated, so the request carries that user's JWT — verify
    // it and derive the id from the token. An attacker can't mint a victim's
    // JWT, so they can't register a device / suppress the new-device alert for
    // someone else (the old code trusted verifiedUserId outright). Failed-login
    // reports have no session and only touch the email-hash lockout counters.
    let verifiedUserId: string | null = null
    if (body.action === 'report' && body.success) {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '')
      if (token) {
        const auth = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )
        const { data: { user } } = await auth.auth.getUser(token)
        verifiedUserId = user?.id ?? null
      }
    }

    // action === 'report'
    await recordLoginAttempt({
      emailHash,
      ip,
      userAgent,
      success: !!body.success,
      reason: body.reason,
      userId: verifiedUserId,
    })

    // On successful, JWT-verified sign-in, do device fingerprinting + alert.
    if (body.success && verifiedUserId) {
      const geo = await geoLookup(ip)
      const fingerprint = await deviceFingerprint(userAgent, geo.city ?? '', geo.region ?? '')

      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )

      const { data: existing } = await admin
        .from('user_devices')
        .select('id, alert_sent_at')
        .eq('user_id', verifiedUserId)
        .eq('fingerprint', fingerprint)
        .maybeSingle()

      if (existing) {
        // Known device — bump last_seen_at
        await admin
          .from('user_devices')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        // New device — insert + send alert email
        await admin.from('user_devices').insert({
          user_id: verifiedUserId,
          fingerprint,
          user_agent: userAgent.slice(0, 500),
          ip_country: geo.country ?? null,
          ip_region:  geo.region  ?? null,
          ip_city:    geo.city    ?? null,
        })

        // Send the alert email (best-effort, never blocks)
        if (resend) {
          try {
            const { data: profile } = await admin
              .from('profiles')
              .select('email, full_name')
              .eq('id', verifiedUserId)
              .single()

            if (profile?.email) {
              const where = [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'an unknown location'
              const when  = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET'
              await resend.emails.send({
                from: `FindStoop Security <${RESEND_FROM}>`,
                to: profile.email,
                subject: 'New sign-in to your FindStoop account',
                html: `
                  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;line-height:1.5">
                    <h2 style="margin:0 0 12px;color:#0f172a">New sign-in to your account</h2>
                    <p style="color:#334155;margin:0 0 16px">
                      We just saw a sign-in to your FindStoop account from a device or location
                      we hadn't seen for you before.
                    </p>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-size:14px;color:#0f172a">
                      <p style="margin:0 0 4px"><strong>Where:</strong> ${where}</p>
                      <p style="margin:0 0 4px"><strong>When:</strong> ${when}</p>
                      <p style="margin:0"><strong>Device:</strong> ${userAgent.slice(0, 100).replace(/[<>]/g, '')}</p>
                    </div>
                    <p style="color:#334155;margin:16px 0 0">
                      <strong>If this was you</strong> — you can ignore this email. We'll only send these for sign-ins from new devices or locations.
                    </p>
                    <p style="color:#dc2626;margin:8px 0 0">
                      <strong>If this wasn't you</strong> — change your password right away
                      and turn on two-factor authentication in your account settings.
                    </p>
                    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
                      FindStoop · ${new Date().getFullYear()}<br/>
                      You're getting this because new-device alerts are on for every account.
                    </p>
                  </div>
                `,
              })
              await admin
                .from('user_devices')
                .update({ alert_sent_at: new Date().toISOString() })
                .eq('user_id', verifiedUserId)
                .eq('fingerprint', fingerprint)
            }
          } catch {
            // Don't block the auth flow on email failure
          }
        }
      }
    }

    return json(req, { ok: true })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
