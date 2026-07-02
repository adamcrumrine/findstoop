// Tenant invite — manager-initiated.
// Verifies caller is manager/admin, then uses admin.generateLink to create
// the auth user + magic invite link, then sends a branded email via Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { emailFrom, emailFooterHtml, emailHeaderHtml, brandAccent, companyDisplayName } from '../_shared/emailBranding.ts'

const APP_URL          = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM      = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

const resend = new Resend(RESEND_API_KEY)

// Tiny HTML escaper so user-provided names (manager full_name, vendor
// label) don't punch out of the email template.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!))
}

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
      .select('full_name, role, email, company_name, company_logo_url, brand_color')
      .eq('id', user.id)
      .single()
    if (!callerProfile || (callerProfile.role !== 'manager' && callerProfile.role !== 'admin')) {
      return json({ error: 'Only landlords can invite tenants' }, { status: 403 })
    }

    // ── Validate body ─────────────────────────────────────────────────
    // `migrationFrom` is set by the portfolio-import wizard to change the
    // email copy from "your landlord added you" to "your landlord just
    // moved to FindStoop — your lease came with them."
    const {
      email, fullName, full_name, phone, applyUnitId, migrationFrom, skipEmail,
    } = await req.json() as {
      email?: string
      fullName?: string
      full_name?: string         // accept snake_case for callers from server-side code
      phone?: string | null      // optional — digits only; written to profiles.phone
      applyUnitId?: string
      migrationFrom?: string     // e.g. "Avail" — display name of prior platform
      skipEmail?: boolean        // create profile silently — manager invites later from Tenants page
    }
    const callerFullName = fullName ?? full_name
    if (!email || !email.includes('@')) {
      return json({ error: 'Valid email required' }, { status: 400 })
    }
    const cleanEmail = email.toLowerCase().trim()
    const applyLink = applyUnitId ? `${APP_URL}/apply/${applyUnitId}` : null
    const isMigration = !!migrationFrom

    // ── Detect an already-registered tenant ───────────────────────────
    // If this email is already in profiles, the manager probably wants
    // to add them to a lease, not re-invite. Bail with a friendly 200
    // result rather than an error from generateLink ("user already
    // registered"), which is confusing UX.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, full_name, role')
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (existingProfile) {
      return json({
        alreadyExists: true,
        tenantId: existingProfile.id,
        name: existingProfile.full_name ?? cleanEmail,
        role: existingProfile.role,
      })
    }

    // ── Generate the invite link ──────────────────────────────────────
    // type 'invite' creates the auth user (if not yet) and returns a magic
    // action link that signs them in + lets them set a password.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: cleanEmail,
      options: {
        redirectTo: `${APP_URL}/login`,
        data: { role: 'tenant', full_name: callerFullName ?? '' },
      },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      // Belt-and-suspenders: if the profile lookup missed (e.g. orphaned
      // auth.users row without a profile), surface a clean already-exists
      // result rather than a raw Supabase error.
      const msg = linkErr?.message?.toLowerCase() ?? ''
      if (msg.includes('already') && msg.includes('registered')) {
        return json({ alreadyExists: true, name: cleanEmail })
      }
      return json({ error: linkErr?.message ?? 'Could not generate invite link' }, { status: 400 })
    }

    const actionLink = linkData.properties.action_link
    // The invite goes out on behalf of the landlord — when they've set a
    // company name, present the company as the inviter (branding); otherwise
    // fall back to their personal name, exactly as before.
    const company = companyDisplayName(callerProfile.company_name)
    const accent = brandAccent(company ? callerProfile.brand_color : null)
    const inviterName = company ?? callerProfile.full_name ?? 'Your landlord'
    const tenantFirstName = (callerFullName?.split(' ')[0]) || 'there'
    const newTenantId = linkData.user?.id ?? null

    // Persist the optional phone (and name, if not already on the profile)
    // onto profiles. generateLink creates the auth.users row + a profiles
    // row via the on-signup trigger, but the trigger doesn't see our
    // caller-supplied phone. Write it explicitly.
    if (newTenantId && (phone || callerFullName)) {
      const cleanPhone = phone ? String(phone).replace(/\D/g, '') : null
      const profilePatch: Record<string, unknown> = {}
      if (cleanPhone) profilePatch.phone = cleanPhone
      if (callerFullName) profilePatch.full_name = callerFullName
      if (Object.keys(profilePatch).length > 0) {
        await admin.from('profiles').update(profilePatch).eq('id', newTenantId)
      }
    }

    // ── Send branded invite email via Resend ──────────────────────────
    // Subject + headline branch on migration context — "your landlord
    // moved platforms" reads very differently from a cold invite.
    const subject = isMigration
      ? `Your lease moved to FindStoop — set up your renter account`
      : `${inviterName} invited you to FindStoop`

    const headline = isMigration
      ? `Your landlord just moved from <strong>${escapeHtml(migrationFrom!)}</strong> to FindStoop`
      : `<strong>${escapeHtml(inviterName)}</strong> added you to FindStoop`

    const body = isMigration
      ? `<p><strong>${escapeHtml(inviterName)}</strong> recently moved their property management from ${escapeHtml(migrationFrom!)} to FindStoop — and brought your lease with them. Your lease terms, rent amount, and dates carry over unchanged.</p>
         <p>Click below to claim your FindStoop renter account. From here you'll pay rent (ACH is free), submit maintenance requests with photos, sign documents, and access everything in one place. Nothing changes about your lease itself.</p>`
      : `<p><strong>${escapeHtml(inviterName)}</strong> added you to FindStoop — the all-in-one platform you'll use to pay rent, submit maintenance requests, sign leases, and access your lease documents.</p>
         <p>Click below to set up your account. The link signs you in directly — no password to remember on the first try.</p>`

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
        ${emailHeaderHtml(company, callerProfile.company_logo_url, callerProfile.brand_color)}
        <p>Hi ${escapeHtml(tenantFirstName)},</p>
        <p>${headline}.</p>
        ${body}
        <p style="text-align:center;margin:28px 0">
          <a href="${actionLink}" style="display:inline-block;background:${accent};color:white;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600">${isMigration ? 'Claim my renter account' : 'Set up my renter account'}</a>
        </p>
        ${isMigration ? `
        <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px 0;font-weight:600;color:#00736B">What stays the same</p>
          <ul style="margin:0;padding-left:20px;font-size:13px;color:#3A3A3C;line-height:1.65">
            <li>Your lease — same rent, same terms, same start/end dates</li>
            <li>Your relationship with ${escapeHtml(inviterName)}</li>
            <li>Any payment history or documents already on file</li>
          </ul>
        </div>
        ` : ''}
        ${applyLink ? `
        <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px 0;font-weight:600;color:#00736B">Apply for the unit</p>
          <p style="margin:0 0 12px 0;font-size:13px;color:#3A3A3C">${escapeHtml(inviterName)} also shared a rental application for you to fill out:</p>
          <a href="${applyLink}" style="display:inline-block;background:white;color:${accent};border:1px solid ${accent};padding:8px 20px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px">Open application</a>
        </div>
        ` : ''}
        <p style="color:#8E8E93;font-size:12px;line-height:1.5">If the button doesn't work, copy and paste this link into your browser:<br><a href="${actionLink}" style="color:#00A896;word-break:break-all">${actionLink}</a></p>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;color:#8E8E93;font-size:12px;line-height:1.5">
          <p>You're receiving this because ${escapeHtml(inviterName)} ${isMigration ? 'moved your lease to FindStoop' : 'added you as a renter on FindStoop'}.</p>
          <p>If you weren't expecting this, you can safely ignore this email.</p>
        </div>
        ${company ? emailFooterHtml(company) : ''}
      </div>
    `

    // skipEmail: the auth user + profile are still created (so the tenant
    // can be linked to a lease and pay rent), but no welcome email goes
    // out. Used by the "save executed lease" flow where the manager wants
    // to invite from the Tenants page later. The actionLink stays in the
    // database for the future invite — no token regeneration needed.
    if (skipEmail) {
      return json({
        ok: true,
        alreadyExists: false,
        tenantId: newTenantId,
        emailSent: false,
        email: cleanEmail,
      })
    }

    const { data: emailData, error: emailErr } = await resend.emails.send({
      from: emailFrom(company, RESEND_FROM),
      to: cleanEmail,
      bcc: callerProfile.email ?? undefined, // owning landlord gets a copy
      subject,
      html,
      replyTo: callerProfile.email ?? undefined,
    })
    if (emailErr) {
      return json({ error: `Email failed to send: ${emailErr.message}` }, { status: 500 })
    }

    return json({
      ok: true,
      alreadyExists: false,
      tenantId: newTenantId,
      messageId: emailData?.id,
      emailSent: true,
      email: cleanEmail,
    })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 },
    )
  }
})
