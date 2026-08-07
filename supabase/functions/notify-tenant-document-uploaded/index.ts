// notify-tenant-document-uploaded — a landlord uploaded a file to a lease.
//
// Distinct from notify-tenant-document-ready, which serves the document
// BUILDER: that one reads generated_documents, stamps status='sent', writes an
// audit event and links to /sign-document. An uploaded file has none of those —
// no signature flow, no delivery state, no audit trail — so reusing it would
// have meant lying about a row in a table this document isn't in.
//
// Until this existed, uploading a file was silent. The tenant got a badge dot
// the next time they happened to open the app, and nothing at all if they
// didn't.
//
// Goes to EVERY tenant on the lease, not just leases.tenant_id. A four-person
// student lease is four people who need to see the notice.
//
// Fail-soft per recipient: one tenant with a dead push subscription or a bad
// address must not stop the others being told.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { sendPushToProfile } from '../_shared/webPush.ts'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { emailFrom, emailFooterHtml, emailHeaderHtml, brandAccent, companyDisplayName } from '../_shared/emailBranding.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '')
const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false }, { status: 405 })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

    const admin: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

    const { data: callerRow } = await admin
      .from('profiles')
      .select('full_name, role, company_name, company_logo_url, brand_color')
      .eq('id', user.id).maybeSingle()
    const caller = callerRow as {
      full_name?: string | null; role?: string; company_name?: string | null
      company_logo_url?: string | null; brand_color?: string | null
    } | null
    if (!caller || (caller.role !== 'manager' && caller.role !== 'admin')) {
      return json(req, { ok: false, message: 'Only landlords can send documents' }, { status: 403 })
    }

    const { document_id } = await req.json().catch(() => ({})) as { document_id?: string }
    if (!document_id) return json(req, { ok: false, message: 'document_id required' }, { status: 400 })

    const { data: docRow } = await admin
      .from('documents').select('id, lease_id, name, type').eq('id', document_id).maybeSingle()
    const doc = docRow as { id: string; lease_id: string; name: string; type: string } | null
    if (!doc) return json(req, { ok: false, message: 'Document not found' }, { status: 404 })

    // Ownership: the caller must manage the property this lease sits on.
    const { data: leaseRow } = await admin
      .from('leases')
      .select('id, tenant_id, unit:units(unit_number, property:properties(name, address, manager_id))')
      .eq('id', doc.lease_id).maybeSingle()
    const lease = leaseRow as unknown as {
      id: string; tenant_id: string | null
      unit: { unit_number: string | null; property: { name: string | null; address: string; manager_id: string } | null } | null
    } | null
    const property = lease?.unit?.property
    if (!lease || !property) return json(req, { ok: false, message: 'Lease not found' }, { status: 404 })
    if (caller.role !== 'admin' && property.manager_id !== user.id) {
      return json(req, { ok: false, message: 'You do not manage this lease' }, { status: 403 })
    }

    // Everyone on the lease: junction table plus the legacy primary column.
    const { data: ltRows } = await admin
      .from('lease_tenants').select('tenant_id').eq('lease_id', doc.lease_id)
    const tenantIds = Array.from(new Set([
      ...((ltRows ?? []) as Array<{ tenant_id: string }>).map((r) => r.tenant_id),
      ...(lease.tenant_id ? [lease.tenant_id] : []),
    ]))
    if (tenantIds.length === 0) return json(req, { ok: true, notified: 0, skipped: 'no_tenants' })

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email, notification_email_enabled')
      .in('id', tenantIds)

    const company = companyDisplayName(caller.company_name)
    const accent = brandAccent(company ? caller.brand_color : null)
    const companyName = company ?? caller.full_name ?? 'Your landlord'
    const label = property.name ?? property.address
    const link = `${APP_URL}/tenant/documents`

    let pushed = 0, emailed = 0
    for (const p of (profiles ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null; notification_email_enabled?: boolean | null }>) {
      // Push first — it is the one that reaches a phone that isn't open.
      try {
        await sendPushToProfile(admin, p.id, {
          title: 'New document',
          body: `${companyName} added "${doc.name}" for ${label}.`,
          url: '/tenant/documents',
          // Collapse key: several uploads in a row replace rather than stack.
          tag: `documents:${doc.lease_id}`,
        })
        pushed += 1
      } catch { /* fail-soft: a dead subscription must not block the rest */ }

      if (p.email && p.notification_email_enabled !== false) {
        const first = (p.full_name ?? 'there').split(' ')[0] || 'there'
        try {
          await resend.emails.send({
            from: emailFrom(company, RESEND_FROM),
            to: p.email,
            subject: `New document for ${label}`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
                ${emailHeaderHtml(company, caller.company_logo_url ?? null, caller.brand_color ?? null)}
                <h1 style="font-size:22px;font-weight:700;margin:0 0 16px 0">New document</h1>
                <p>Hi ${escapeHtml(first)},</p>
                <p><strong>${escapeHtml(companyName)}</strong> added a document for your home:</p>
                <div style="background:#F4FBFA;border:1px solid #B6E5DE;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0;font-weight:600;color:#00736B">${escapeHtml(doc.name)}</p>
                  <p style="margin:4px 0 0 0;font-size:14px">${escapeHtml(label)}${lease.unit?.unit_number ? ` · Unit ${escapeHtml(lease.unit.unit_number)}` : ''}</p>
                </div>
                <p style="margin:24px 0">
                  <a href="${link}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">View document</a>
                </p>
                ${emailFooterHtml(company)}
              </div>`,
          })
          emailed += 1
        } catch { /* fail-soft */ }
      }
    }

    return json(req, { ok: true, notified: tenantIds.length, pushed, emailed })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
