// notify-tenant-lease-ready
//
// Triggered by the manager from the lease card. Verifies caller owns the
// property, then sends a branded "your lease is ready to review and sign"
// email to every tenant who has to sign, with a deep link into the signing
// page on their portal. Who has to sign mirrors lease_required_signer_ids:
// primary lease_tenants rows, else every row, else the legacy tenant_id.
//
// Idempotent: re-sending updates a timestamp on the lease (sent_for_signature_at)
// and emails whoever hasn't signed yet — useful as a "nudge" button.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { emailFrom, emailFooterHtml, emailHeaderHtml, brandAccent, companyDisplayName } from '../_shared/emailBranding.ts'
import { managerCc } from '../_shared/managerCopy.ts'

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

    const { data: ltRows } = await admin
      .from('lease_tenants')
      .select('tenant_id, is_primary, sort_order')
      .eq('lease_id', leaseId)
      .order('sort_order', { ascending: true, nullsFirst: false })
    const rows = (ltRows ?? []) as Array<{ tenant_id: string; is_primary: boolean }>
    const primaries = rows.filter((r) => r.is_primary)
    const signerIds = (primaries.length > 0 ? primaries : rows).map((r) => r.tenant_id)
    if (signerIds.length === 0 && lease.tenant_id) signerIds.push(lease.tenant_id)
    if (signerIds.length === 0) return json({ error: 'This lease has no tenants' }, { status: 400 })

    const [{ data: profiles }, { data: sigs }] = await Promise.all([
      admin.from('profiles').select('id, full_name, email').in('id', signerIds),
      admin.from('lease_signatures').select('signer_id').eq('lease_id', leaseId).eq('signer_role', 'tenant'),
    ])
    const signed = new Set(((sigs ?? []) as Array<{ signer_id: string }>).map((s) => s.signer_id))
    type Signer = { id: string; full_name: string | null; email: string | null }
    const byId = new Map(((profiles ?? []) as Signer[]).map((p) => [p.id, p]))
    const unsigned = signerIds.filter((id) => !signed.has(id))
      .map((id) => byId.get(id))
      .filter((p): p is Signer => !!p)
    if (unsigned.length === 0) return json({ error: 'Every tenant has already signed this lease' }, { status: 400 })
    const recipients = unsigned.filter((p): p is Signer & { email: string } => !!p.email)
    const noEmail = unsigned.filter((p) => !p.email).map((p) => p.full_name ?? 'A tenant')
    if (recipients.length === 0) return json({ error: 'No tenant on this lease has an email on file' }, { status: 400 })

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
    const signLink      = `${APP_URL}/tenant/sign-lease/${leaseId}`
    const propertyLabel = `${property.name} — Unit ${unit.unit_number}`
    const propertyAddr  = `${property.address}, ${property.city}, ${property.state} ${property.zip}`

    const subject = company
      ? `Your lease from ${company} is ready to sign`
      : `Your lease is ready to review and sign`
    // One email per tenant: each is addressed to them by name, and a
    // roommate shouldn't see the others' addresses.
    const sent: string[] = []
    const sentTo: Array<{ name: string; email: string }> = []
    const failed: string[] = []
    for (const tenant of recipients) {
      const tenantName  = tenant.full_name ?? tenant.email
      const tenantFirst = (tenant.full_name ?? '').split(' ')[0] || 'there'
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
          <p>Read the lease carefully, then sign electronically. You'll get a copy emailed to you once everyone has signed.</p>
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
        // Owning landlord, visibly — on the first email only, not once per roommate.
        cc: tenant === recipients[0] ? managerCc(caller.email, tenant.email) : undefined,
        subject,
        html,
        replyTo: caller.email ?? undefined,
      })
      if (emailErr) failed.push(`${tenantName}: ${emailErr.message}`)
      else { sent.push(tenantName); sentTo.push({ name: tenantName, email: tenant.email }) }
    }
    if (sent.length === 0) return json({ error: `Email failed — ${failed.join('; ')}` }, { status: 500 })

    // The landlord is CC'd on one tenant's email only, so their inbox can't
    // show who else got it. Send them one link-free receipt: who was emailed,
    // who couldn't be, who has already signed. Best-effort — the tenant
    // emails already went out, so a failure here doesn't fail the send.
    let managerNotified = false
    if (caller.email) {
      const alreadySigned = signerIds.filter((id) => signed.has(id))
        .map((id) => byId.get(id)?.full_name ?? 'A tenant')
      const li = (s: string) => `<li style="margin:2px 0">${s}</li>`
      const section = (title: string, items: string[]) => items.length === 0 ? '' : `
        <p style="margin:16px 0 4px 0;font-weight:600">${title}</p>
        <ul style="margin:0;padding-left:20px">${items.map(li).join('')}</ul>`
      const receipt = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
          <h1 style="font-size:20px;font-weight:700;margin:0 0 12px 0">Lease sent for signature</h1>
          <p style="margin:0">${escapeHtml(propertyLabel)}<br><span style="color:#8E8E93;font-size:13px">${escapeHtml(propertyAddr)}</span></p>
          ${section(`Emailed (${sentTo.length})`, sentTo.map((t) => `${escapeHtml(t.name)} — ${escapeHtml(t.email)}`))}
          ${section('Not reached', [
            ...noEmail.map((n) => `${escapeHtml(n)} — no email on file`),
            ...failed.map((f) => escapeHtml(f)),
          ])}
          ${section('Already signed', alreadySigned.map(escapeHtml))}
          <p style="margin-top:16px">Every tenant on the lease has to sign. Add your signature once they have — the lease activates when everyone has signed.</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${APP_URL}/manager/leases" style="display:inline-block;background:${accent};color:white;padding:10px 24px;text-decoration:none;border-radius:8px;font-weight:600">View leases</a>
          </p>
        </div>
      `
      const { error: receiptErr } = await resend.emails.send({
        from: emailFrom(company, RESEND_FROM),
        to: caller.email,
        subject: `Sent for signature to ${sentTo.length} tenant${sentTo.length === 1 ? '' : 's'} — ${propertyLabel}`,
        html: receipt,
      })
      managerNotified = !receiptErr
    }

    return json({ ok: true, sent, failed, noEmail, managerNotified })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 })
  }
})
