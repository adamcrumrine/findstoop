// renter-lead — Renter Check funnel actions (L2).
//
// Two anonymous, capability-token-gated actions on a prior lease analysis:
//   • email_summary  — email the renter their plain-English summary (lead capture)
//   • invite_landlord — TENANT-INITIATED invite to the renter's landlord
//
// We intentionally do NOT cold-email landlords on our own initiative — the
// renter chooses to invite them. The token (issued by explain-lease and held
// only in the renter's browser) authorizes acting on a specific analysis.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'
import { tokensMatch } from '../_shared/screeningAuth.ts'

const APP_URL        = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'
const resend = new Resend(RESEND_API_KEY)

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
const SHELL = (inner: string) =>
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
     <div style="text-align:center;padding:20px 0;border-bottom:1px solid #eee;margin-bottom:24px">
       <span style="font-size:24px;font-weight:700;color:#00A896;letter-spacing:-0.02em">FindStoop</span>
     </div>${inner}</div>`

interface AnalysisShape {
  summary?: string
  red_flags?: Array<{ severity?: string; issue?: string; why_it_matters?: string }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  try {
    const ip = clientIp(req)
    const allowed = await checkRateLimit({ key: `renter-lead:${ip}`, windowSeconds: 3600, maxCount: 30 })
    if (!allowed) return json(req, { ok: false, message: 'Too many requests — try again shortly.' }, { status: 429 })

    const { analysis_id, access_token, action, tenant_email } = await req.json().catch(() => ({})) as {
      analysis_id?: string; access_token?: string; action?: string; tenant_email?: string
    }
    if (!analysis_id || !access_token || !action) {
      return json(req, { ok: false, message: 'Missing fields' }, { status: 400 })
    }

    const { data: row } = await admin
      .from('lease_analyses')
      .select('id, access_token, landlord_name, landlord_email, property_address, summary, analysis')
      .eq('id', analysis_id)
      .maybeSingle()
    if (!row || !tokensMatch(access_token, row.access_token)) {
      return json(req, { ok: false, message: 'Not authorized' }, { status: 403 })
    }

    // ── Email the renter their summary ──────────────────────────────────────
    if (action === 'email_summary') {
      const email = (tenant_email ?? '').trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json(req, { ok: false, message: 'Enter a valid email.' }, { status: 400 })
      }
      const a = (row.analysis ?? {}) as AnalysisShape
      const flags = (a.red_flags ?? []).slice(0, 6)
        .map((f) => `<li style="margin-bottom:6px"><strong>${escapeHtml(f.issue ?? '')}</strong><br><span style="color:#6E6E73;font-size:13px">${escapeHtml(f.why_it_matters ?? '')}</span></li>`)
        .join('')
      const html = SHELL(`
        <h1 style="font-size:20px;margin:0 0 12px">Your lease, in plain English</h1>
        <p>${escapeHtml(a.summary ?? row.summary ?? '')}</p>
        ${flags ? `<h2 style="font-size:15px;margin:20px 0 8px">Red flags worth a closer look</h2><ul style="padding-left:18px">${flags}</ul>` : ''}
        <p style="margin-top:20px"><a href="${APP_URL}/renter-check" style="color:#00A896;font-weight:600">Check another lease</a></p>
        <p style="color:#8E8E93;font-size:12px;margin-top:20px">This is general information, not legal advice. We don't keep your lease file.</p>
      `)
      const { error } = await resend.emails.send({ from: `FindStoop <${RESEND_FROM}>`, to: email, subject: 'Your lease summary from FindStoop', html })
      if (error) return json(req, { ok: false, message: `Email failed: ${error.message}` }, { status: 500 })
      await admin.from('lease_analyses').update({ tenant_email: email, emailed_summary_at: new Date().toISOString() }).eq('id', row.id)
      return json(req, { ok: true })
    }

    // ── Tenant-initiated landlord invite ────────────────────────────────────
    if (action === 'invite_landlord') {
      const to = (row.landlord_email ?? '').trim()
      if (!to) return json(req, { ok: false, message: "We couldn't find your landlord's email in the lease." }, { status: 400 })
      const name = row.landlord_name ?? 'there'
      const where = row.property_address ? ` for ${escapeHtml(row.property_address)}` : ''
      const html = SHELL(`
        <h1 style="font-size:20px;margin:0 0 12px">A renter thought you'd want to see this</h1>
        <p>Hi ${escapeHtml(name)},</p>
        <p>One of your renters just used FindStoop's free lease tool${where} and invited you to take a look.</p>
        <p>FindStoop helps landlords handle the recurring paperwork — lease renewals, rent increases, late-payment notices, deposit letters, entry notices — as professional, Ohio-ready documents with e-signature, in minutes.</p>
        <p style="text-align:center;margin:26px 0">
          <a href="${APP_URL}/register" style="display:inline-block;background:#00A896;color:white;padding:12px 30px;text-decoration:none;border-radius:8px;font-weight:600">See what FindStoop does</a>
        </p>
        <p style="color:#8E8E93;font-size:12px;margin-top:20px">You're getting this because a renter you're leasing to chose to invite you. If that wasn't intended, you can ignore this email.</p>
      `)
      const { error } = await resend.emails.send({ from: `FindStoop <${RESEND_FROM}>`, to, subject: 'A renter invited you to FindStoop', html })
      if (error) return json(req, { ok: false, message: `Email failed: ${error.message}` }, { status: 500 })
      await admin.from('lease_analyses').update({ landlord_invited_at: new Date().toISOString() }).eq('id', row.id)
      return json(req, { ok: true })
    }

    return json(req, { ok: false, message: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Something went wrong.' }, { status: 500 })
  }
})
