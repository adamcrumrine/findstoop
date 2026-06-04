// application-decision — manager approves or declines a rental application.
//
// Approve:
//   • Generates a magic invite link for the applicant via admin.generateLink.
//     This creates the auth.users row + (via the on_auth_user_created trigger)
//     a tenant profile.
//   • Sends a branded acceptance email through Resend with the action link
//     baked in so the applicant can land directly into the account-setup flow.
//   • Inserts a 'pending' lease row pre-populated from the application (rent
//     pulled from the unit, dates defaulted to move_in_date + 12 months).
//   • Flips the unit to status='pending' so it stops appearing as available.
//
// Decline:
//   • Sends a polite rejection email through Resend. No DB writes beyond the
//     status flag the client already set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { generateLeaseText } from '../_shared/leaseTemplates.ts'

const APP_URL        = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

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

interface Application {
  id: string
  unit_id: string
  first_name: string
  last_name: string
  email: string
  desired_move_in_date: string | null
  status: string
}

interface Unit {
  id: string
  unit_number: string
  rent_amount: number
  property_id: string
}

interface Property {
  id: string
  manager_id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
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
      .select('full_name, role, email, phone, company_name')
      .eq('id', user.id)
      .single()
    if (!callerProfile || (callerProfile.role !== 'manager' && callerProfile.role !== 'admin')) {
      return json({ error: 'Only landlords can act on applications' }, { status: 403 })
    }

    // ── Validate body ─────────────────────────────────────────────────
    const { applicationId, decision, declineReason } = await req.json() as {
      applicationId?: string
      decision?: 'approve' | 'decline'
      declineReason?: string
    }
    if (!applicationId || (decision !== 'approve' && decision !== 'decline')) {
      return json({ error: 'applicationId and decision (approve|decline) are required' }, { status: 400 })
    }

    // ── Load application + unit + property ────────────────────────────
    const { data: appRow, error: appErr } = await admin
      .from('applications')
      .select('id, unit_id, first_name, last_name, email, desired_move_in_date, status')
      .eq('id', applicationId)
      .single<Application>()
    if (appErr || !appRow) return json({ error: 'Application not found' }, { status: 404 })

    const { data: unit } = await admin
      .from('units')
      .select('id, unit_number, rent_amount, property_id')
      .eq('id', appRow.unit_id)
      .single<Unit>()
    if (!unit) return json({ error: 'Unit not found' }, { status: 404 })

    const { data: property } = await admin
      .from('properties')
      .select('id, manager_id, name, address, city, state, zip')
      .eq('id', unit.property_id)
      .single<Property>()
    if (!property) return json({ error: 'Property not found' }, { status: 404 })

    // Caller must own this property (admin bypass).
    if (callerProfile.role !== 'admin' && property.manager_id !== user.id) {
      return json({ error: 'You do not manage this property' }, { status: 403 })
    }

    const landlordName  = callerProfile.full_name ?? 'Your landlord'
    const companyName   = callerProfile.company_name ?? landlordName
    const replyTo       = callerProfile.email ?? undefined
    const firstName     = appRow.first_name || 'there'
    const fullName      = `${appRow.first_name} ${appRow.last_name}`.trim()
    const cleanEmail    = appRow.email.toLowerCase().trim()
    const propertyLabel = `${property.name} — Unit ${unit.unit_number}`
    const propertyAddr  = `${property.address}, ${property.city}, ${property.state} ${property.zip}`

    // ────────────────────────────────────────────────────────────────────
    // Decline path
    // ────────────────────────────────────────────────────────────────────
    if (decision === 'decline') {
      await admin
        .from('applications')
        .update({ status: 'declined', decided_at: new Date().toISOString() })
        .eq('id', applicationId)

      const subject = `Update on your application for ${property.name}`
      const reasonBlock = declineReason?.trim()
        ? `<p style="background:#F4F4F5;border:1px solid #E4E4E7;border-radius:8px;padding:12px;color:#3A3A3C;margin:16px 0">${escapeHtml(declineReason.trim())}</p>`
        : ''
      const html = renderEmail({
        title: `Update on your application`,
        bodyHtml: `
          <p>Hi ${escapeHtml(firstName)},</p>
          <p>Thank you for applying to <strong>${escapeHtml(propertyLabel)}</strong>. After reviewing your application, ${escapeHtml(landlordName)} won't be moving forward with your application this time.</p>
          ${reasonBlock}
          <p>We know this isn't the news you were hoping for. We wish you the best in your housing search.</p>
          <p style="color:#8E8E93;font-size:13px">— FindStoop, on behalf of ${escapeHtml(companyName)}</p>
        `,
      })
      const { error: emailErr } = await resend.emails.send({
        from: `FindStoop <${RESEND_FROM}>`,
        to: cleanEmail,
        bcc: replyTo, // owning landlord gets a copy
        subject,
        html,
        replyTo,
      })
      if (emailErr) return json({ error: `Email failed: ${emailErr.message}` }, { status: 500 })
      return json({ ok: true, decision: 'decline' })
    }

    // ────────────────────────────────────────────────────────────────────
    // Approve path — invite, pending lease, unit→pending, email
    // ────────────────────────────────────────────────────────────────────

    // Mark the application approved (idempotent — UI already does this too,
    // but we set decided_at server-side to be authoritative).
    await admin
      .from('applications')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('id', applicationId)

    // Look up / create the tenant auth user via invite link.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: cleanEmail,
      options: {
        redirectTo: `${APP_URL}/login`,
        data: { role: 'tenant', full_name: fullName },
      },
    })

    let tenantUserId: string | null = null
    let actionLink: string | null = null

    if (linkErr) {
      // Possible the email is already registered — find their auth user.
      // generateLink doesn't return the user when the email already exists,
      // so we look them up via the profiles table.
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', cleanEmail)
        .maybeSingle()
      if (existingProfile?.id) {
        tenantUserId = existingProfile.id
        actionLink = null   // existing tenant; they already have an account
      } else {
        return json({ error: `Could not invite applicant: ${linkErr.message}` }, { status: 400 })
      }
    } else {
      tenantUserId = linkData?.user?.id ?? null
      actionLink = linkData?.properties?.action_link ?? null
    }

    if (!tenantUserId) {
      return json({ error: 'Could not resolve tenant user id' }, { status: 500 })
    }

    // Create a pending lease, pre-populated from the application + unit.
    // Dates: prefer the applicant's desired move-in; fall back to "today".
    // End date defaults to +12 months — manager can adjust before signing.
    const startDateIso = appRow.desired_move_in_date ?? new Date().toISOString().split('T')[0]
    const startDate = new Date(startDateIso)
    const endDate = new Date(startDate)
    endDate.setFullYear(endDate.getFullYear() + 1)
    const endDateIso = endDate.toISOString().split('T')[0]

    // Auto-draft the lease document. Template body is the user's own
    // attorney-drafted lease (see _shared/leaseTemplates.ts). Merge values
    // come from the application + property + manager profile.
    let documentUrl: string | null = null
    try {
      const leaseText = generateLeaseText({
        landlord_name: landlordName,
        landlord_entity: companyName,
        landlord_phone: (callerProfile as { phone?: string | null }).phone ?? null,
        landlord_email: callerProfile.email ?? null,
        tenant_name: fullName || cleanEmail,
        tenant_email: cleanEmail,
        property_address: property.address,
        unit_label: unit.unit_number,
        city: property.city,
        state: property.state,
        zip: property.zip,
        start_date: startDateIso,
        end_date: endDateIso,
        rent_amount: Number(unit.rent_amount),
        security_deposit: 0,
        pet_deposit: null,
        payment_due_day: 1,
        utility_notes: null,
        pets_allowed: false,
      })
      const docPath = `lease-docs/${property.manager_id}/${Date.now()}-${appRow.id}.txt`
      const blob = new Blob([leaseText], { type: 'text/plain' })
      const { error: upErr } = await admin.storage
        .from('user-uploads')
        .upload(docPath, blob, { contentType: 'text/plain', upsert: true })
      if (!upErr) {
        const { data: pub } = admin.storage.from('user-uploads').getPublicUrl(docPath)
        documentUrl = pub?.publicUrl ?? null
      } else {
        console.warn('Lease document upload failed (continuing without doc):', upErr.message)
      }
    } catch (e) {
      console.warn('Template generation failed (continuing without doc):', (e as Error).message)
    }

    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .insert({
        unit_id: unit.id,
        tenant_id: tenantUserId,
        start_date: startDateIso,
        end_date: endDateIso,
        rent_amount: unit.rent_amount,
        status: 'pending',
        signed_at: null,
        document_url: documentUrl,
      })
      .select('id')
      .single()

    if (leaseErr) {
      // Common case: a pending lease already exists for this unit+tenant.
      // Don't fail the approval — just continue.
      console.warn('Pending lease insert failed (continuing):', leaseErr.message)
    }

    // Park the unit at 'pending' so it stops appearing in apply links.
    await admin.from('units').update({ status: 'pending' }).eq('id', unit.id)

    // Branded acceptance email — includes the magic invite link if we got one.
    const ctaLabel = actionLink ? 'Set up my renter account' : 'Sign in to FindStoop'
    const ctaHref  = actionLink ?? `${APP_URL}/login/renter`
    const subject = `You've been approved for ${propertyLabel}`
    const html = renderEmail({
      title: 'You’re approved!',
      bodyHtml: `
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>Great news — <strong>${escapeHtml(landlordName)}</strong> approved your application for:</p>
        <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-weight:600;color:#00736B">${escapeHtml(propertyLabel)}</p>
          <p style="margin:4px 0 0 0;color:#3A3A3C;font-size:13px">${escapeHtml(propertyAddr)}</p>
          <p style="margin:8px 0 0 0;color:#3A3A3C;font-size:13px">Monthly rent: <strong>$${Number(unit.rent_amount).toLocaleString()}</strong></p>
        </div>
        <p>The next step is to set up your FindStoop account so you can review and sign your lease, pay rent, and submit maintenance requests — all from one place.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${ctaHref}" style="display:inline-block;background:#00A896;color:white;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600">${ctaLabel}</a>
        </p>
        ${actionLink ? `<p style="color:#8E8E93;font-size:12px;line-height:1.5">If the button doesn’t work, copy and paste this link into your browser:<br><a href="${actionLink}" style="color:#00A896;word-break:break-all">${actionLink}</a></p>` : ''}
        <p style="color:#8E8E93;font-size:12px;margin-top:24px">After you sign in, your draft lease will be waiting in your dashboard.</p>
      `,
    })

    const { error: emailErr } = await resend.emails.send({
      from: `FindStoop <${RESEND_FROM}>`,
      to: cleanEmail,
      bcc: replyTo, // owning landlord gets a copy
      subject,
      html,
      replyTo,
    })
    if (emailErr) {
      return json({ ok: true, decision: 'approve', leaseId: lease?.id, emailWarning: emailErr.message })
    }

    return json({ ok: true, decision: 'approve', leaseId: lease?.id })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 },
    )
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderEmail({ title, bodyHtml }: { title: string; bodyHtml: string }): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
      <div style="text-align:center;padding:24px 0;border-bottom:1px solid #eee;margin-bottom:24px">
        <span style="font-size:24px;font-weight:700;color:#00A896;letter-spacing:-0.02em">FindStoop</span>
      </div>
      <h1 style="font-size:22px;font-weight:700;color:#3A3A3C;margin:0 0 16px 0">${title}</h1>
      ${bodyHtml}
    </div>
  `
}
