// notify-tenant-document-ready
//
// Triggered by the manager from the document builder's Deliver step. Verifies
// the caller owns the property the document belongs to, stamps sent_at + a
// 'sent' audit event, then emails the tenant a deep link — to the signing page
// for e-sign documents, or the read-only view for everything else.
//
// Mirrors notify-tenant-lease-ready. Idempotent — re-sending acts as a nudge.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'

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
      .select('full_name, role, email, company_name')
      .eq('id', user.id)
      .single()
    if (!caller || (caller.role !== 'manager' && caller.role !== 'admin')) {
      return json({ error: 'Only landlords can send documents' }, { status: 403 })
    }

    // `recipientId` lets an addendum notify each co-signer individually; it
    // defaults to the document's addressed tenant.
    const { documentId, recipientId } = await req.json() as { documentId?: string; recipientId?: string }
    if (!documentId) return json({ error: 'documentId required' }, { status: 400 })

    const { data: doc } = await admin
      .from('generated_documents')
      .select('id, property_id, tenant_id, title, requires_signature, status')
      .eq('id', documentId)
      .single()
    if (!doc) return json({ error: 'Document not found' }, { status: 404 })

    const { data: property } = await admin
      .from('properties')
      .select('id, manager_id, name, address, city, state, zip')
      .eq('id', doc.property_id)
      .single()
    if (!property) return json({ error: 'Property not found' }, { status: 404 })

    if (caller.role !== 'admin' && property.manager_id !== user.id) {
      return json({ error: 'You do not manage this property' }, { status: 403 })
    }

    const { data: tenant } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', recipientId ?? doc.tenant_id)
      .single()
    if (!tenant?.email) return json({ error: 'Tenant has no email on file' }, { status: 400 })

    const wantsSignature = doc.requires_signature
    const link = wantsSignature
      ? `${APP_URL}/sign-document/${documentId}`
      : `${APP_URL}/view/${documentId}`

    // Stamp sent + log the audit event (service role bypasses RLS).
    await admin
      .from('generated_documents')
      .update({ status: 'sent', delivery_method: wantsSignature ? 'esign' : 'email', sent_at: new Date().toISOString() })
      .eq('id', documentId)
    await admin.from('generated_document_events').insert({
      document_id: documentId,
      actor_id: user.id,
      event: 'sent',
      meta: { method: wantsSignature ? 'esign' : 'email' },
    })

    const landlordName  = caller.full_name ?? 'Your landlord'
    const companyName   = caller.company_name ?? landlordName
    const tenantFirst   = (tenant.full_name ?? 'there').split(' ')[0] || 'there'
    const propertyLabel = property.name ?? property.address
    const propertyAddr  = `${property.address}, ${property.city}, ${property.state} ${property.zip}`
    const cta           = wantsSignature ? 'Review & sign' : 'View document'

    const subject = wantsSignature
      ? `${escapeHtml(doc.title)} — please review and sign`
      : `${escapeHtml(doc.title)} from ${escapeHtml(companyName)}`

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
        <div style="text-align:center;padding:24px 0;border-bottom:1px solid #eee;margin-bottom:24px">
          <span style="font-size:24px;font-weight:700;color:#00A896;letter-spacing:-0.02em">FindStoop</span>
        </div>
        <h1 style="font-size:22px;font-weight:700;color:#3A3A3C;margin:0 0 16px 0">${escapeHtml(doc.title)}</h1>
        <p>Hi ${escapeHtml(tenantFirst)},</p>
        <p><strong>${escapeHtml(landlordName)}</strong> sent you a document about your home:</p>
        <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-weight:600;color:#00736B">${escapeHtml(propertyLabel)}</p>
          <p style="margin:4px 0 0 0;color:#3A3A3C;font-size:13px">${escapeHtml(propertyAddr)}</p>
        </div>
        ${wantsSignature ? '<p>Please read it carefully, then add your signature.</p>' : '<p>Please take a moment to read it.</p>'}
        <p style="text-align:center;margin:28px 0">
          <a href="${link}" style="display:inline-block;background:#00A896;color:white;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600">${cta}</a>
        </p>
        <p style="color:#8E8E93;font-size:12px;line-height:1.5">If the button doesn't work, copy and paste this link:<br><a href="${link}" style="color:#00A896;word-break:break-all">${link}</a></p>
        <p style="color:#8E8E93;font-size:12px;margin-top:24px">Questions? Reply directly to this email — it goes to ${escapeHtml(companyName)}.</p>
      </div>
    `

    const { error: emailErr } = await resend.emails.send({
      from: `FindStoop <${RESEND_FROM}>`,
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
