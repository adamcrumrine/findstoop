// Tenant invite — manager-initiated.
// Verifies caller is manager/admin, then uses admin.generateLink to create
// the auth user + magic invite link, then sends a branded email via Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'

const APP_URL          = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM      = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

const resend = new Resend(RESEND_API_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('full_name, role, email')
      .eq('id', user.id)
      .single()
    if (!callerProfile || (callerProfile.role !== 'manager' && callerProfile.role !== 'admin')) {
      return json({ error: 'Only landlords can invite tenants' }, { status: 403 })
    }

    // ── Validate body ─────────────────────────────────────────────────
    const { email, fullName, applyUnitId } = await req.json() as {
      email?: string
      fullName?: string
      applyUnitId?: string
    }
    if (!email || !email.includes('@')) {
      return json({ error: 'Valid email required' }, { status: 400 })
    }
    const cleanEmail = email.toLowerCase().trim()
    const applyLink = applyUnitId ? `${APP_URL}/apply/${applyUnitId}` : null

    // ── Generate the invite link ──────────────────────────────────────
    // type 'invite' creates the auth user (if not yet) and returns a magic
    // action link that signs them in + lets them set a password.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: cleanEmail,
      options: {
        redirectTo: `${APP_URL}/login`,
        data: { role: 'tenant', full_name: fullName ?? '' },
      },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      return json({ error: linkErr?.message ?? 'Could not generate invite link' }, { status: 400 })
    }

    const actionLink = linkData.properties.action_link
    const inviterName = callerProfile.full_name ?? 'Your landlord'
    const tenantFirstName = (fullName?.split(' ')[0]) || 'there'

    // ── Send branded invite email via Resend ──────────────────────────
    const subject = `${inviterName} invited you to FindStoop`
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
        <div style="text-align:center;padding:24px 0;border-bottom:1px solid #eee;margin-bottom:24px">
          <span style="font-size:24px;font-weight:700;color:#00A896;letter-spacing:-0.02em">FindStoop</span>
        </div>
        <p>Hi ${tenantFirstName},</p>
        <p><strong>${inviterName}</strong> added you to FindStoop — the all-in-one platform you'll use to pay rent, submit maintenance requests, sign leases, and access your lease documents.</p>
        <p>Click below to set up your account. The link signs you in directly — no password to remember on the first try.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${actionLink}" style="display:inline-block;background:#00A896;color:white;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600">Set up my renter account</a>
        </p>
        ${applyLink ? `
        <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px 0;font-weight:600;color:#00736B">Apply for the unit</p>
          <p style="margin:0 0 12px 0;font-size:13px;color:#3A3A3C">${inviterName} also shared a rental application for you to fill out:</p>
          <a href="${applyLink}" style="display:inline-block;background:white;color:#00A896;border:1px solid #00A896;padding:8px 20px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px">Open application</a>
        </div>
        ` : ''}
        <p style="color:#8E8E93;font-size:12px;line-height:1.5">If the button doesn't work, copy and paste this link into your browser:<br><a href="${actionLink}" style="color:#00A896;word-break:break-all">${actionLink}</a></p>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;color:#8E8E93;font-size:12px;line-height:1.5">
          <p>You're receiving this because ${inviterName} added you as a renter on FindStoop.</p>
          <p>If you weren't expecting this, you can safely ignore this email.</p>
        </div>
      </div>
    `

    const { data: emailData, error: emailErr } = await resend.emails.send({
      from: `FindStoop <${RESEND_FROM}>`,
      to: cleanEmail,
      subject,
      html,
      replyTo: callerProfile.email ?? undefined,
    })
    if (emailErr) {
      return json({ error: `Email failed to send: ${emailErr.message}` }, { status: 500 })
    }

    return json({ ok: true, messageId: emailData?.id, email: cleanEmail })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 },
    )
  }
})
