// notify-tenant-lease-ready
//
// Triggered by the manager from the lease card. Verifies caller owns the
// property, then sends a branded "your lease is ready to review and sign"
// email to the tenant with a deep link into the signing page on their portal.
//
// Idempotent: re-sending updates a timestamp on the lease (sent_for_signature_at)
// and just sends another email — useful as a "nudge" button.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { emailFrom, emailFooterHtml, emailHeaderHtml, brandAccent, companyDisplayName } from '../_shared/emailBranding.ts'

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    const { data: caller } = await admin
      .from('profiles')
      .select('full_name, role, email, company_name, company_logo_url, brand_color')
      .eq('id', user.id)
      .single()
    if (!caller || (caller.role !== 'manager' && caller.role !== 'admin')) {
      return json({ error: 'Only landlords can send leases for signature' }, { status: 403 })
    }

    const { leaseId } = await req.json() as { leaseId?: string }
    if (!leaseId) return json({ error: 'leaseId required' }, { status: 400 })

    const { data: lease } = await admin
      .from('leases')
      .select('id, tenant_id, unit_id, start_date, end_date, rent_amount, status')
      .eq('id', leaseId)
      .single()
    if (!lease) return json({ error: 'Lease not found' }, { status: 404 })

    const { data: unit } = await admin
      .from('units')
      .select('id, unit_number, property_id')
      .eq('id', lease.unit_id)
      .single()
    if (!unit) return json({ error: 'Unit not found' }, { status: 404 })

    const { data: property } = await admin
      .from('properties')
      .select('id, manager_id, name, address, city, state, zip')
      .eq('id', unit.property_id)
      .single()
    if (!property) return json({ error: 'Property not found' }, { status: 404 })

    if (caller.role !== 'admin' && property.manager_id !== user.id) {
      return json({ error: 'You do not manage this property' }, { status: 403 })
    }

    const { data: tenant } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', lease.tenant_id)
      .single()
    if (!tenant?.email) return json({ error: 'Tenant has no email on file' }, { status: 400 })

    // Stamp the lease so we know it was sent for signature.
    await admin
      .from('leases')
      .update({ sent_for_signature_at: new Date().toISOString() })
      .eq('id', leaseId)

    // When the landlord has set a company name, the email presents as coming
    // from the company (with "via FindStoop" attribution); otherwise it keeps
    // today's exact FindStoop presentation.
    const company       = companyDisplayName(caller.company_name)
    const accent        = brandAccent(company ? caller.brand_color : null)
    const landlordName  = caller.full_name ?? 'Your landlord'
    const companyName   = company ?? landlordName
    const tenantName    = tenant.full_name ?? 'there'
    const tenantFirst   = tenantName.split(' ')[0] || 'there'
    const signLink      = `${APP_URL}/tenant/sign-lease/${leaseId}`
    const propertyLabel = `${property.name} — Unit ${unit.unit_number}`
    const propertyAddr  = `${property.address}, ${property.city}, ${property.state} ${property.zip}`

    const subject = company
      ? `Your lease from ${company} is ready to sign`
      : `Your lease is ready to review and sign`
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
        ${emailHeaderHtml(company, caller.company_logo_url, caller.brand_color)}
        <h1 style="font-size:22px;font-weight:700;color:#3A3A3C;margin:0 0 16px 0">Your lease is ready to sign</h1>
        <p>Hi ${escapeHtml(tenantFirst)},</p>
        <p><strong>${escapeHtml(companyName)}</strong> has sent you a lease to review and sign for:</p>
        <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-weight:600;color:#00736B">${escapeHtml(propertyLabel)}</p>
          <p style="margin:4px 0 0 0;color:#3A3A3C;font-size:13px">${escapeHtml(propertyAddr)}</p>
          <p style="margin:8px 0 0 0;color:#3A3A3C;font-size:13px">
            ${new Date(lease.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            – ${new Date(lease.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            · $${Number(lease.rent_amount).toLocaleString()}/mo
          </p>
        </div>
        <p>Read the lease carefully, then sign electronically. You'll get a copy emailed to you once both parties have signed.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${signLink}" style="display:inline-block;background:${accent};color:white;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600">Review & sign lease</a>
        </p>
        <p style="color:#8E8E93;font-size:12px;line-height:1.5">If the button doesn't work, copy and paste this link:<br><a href="${signLink}" style="color:#00A896;word-break:break-all">${signLink}</a></p>
        <p style="color:#8E8E93;font-size:12px;margin-top:24px">Questions about the lease? Reply directly to this email — it goes to ${escapeHtml(companyName)}.</p>
        ${company ? emailFooterHtml(company) : ''}
      </div>
    `

    const { error: emailErr } = await resend.emails.send({
      from: emailFrom(company, RESEND_FROM),
      to: tenant.email,
      bcc: caller.email ?? undefined, // owning landlord gets a copy
      subject,
      html,
      replyTo: caller.email ?? undefined,
    })
    if (emailErr) return json({ error: `Email failed: ${emailErr.message}` }, { status: 500 })

    return json({ ok: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 })
  }
})
