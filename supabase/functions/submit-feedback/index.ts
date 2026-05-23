// Manager submits a bug report / feature request / general feedback. We:
//   1. Insert a row into `feedback` (admin portal pulls from here)
//   2. Send an outbound email to support@findstoop.com via Resend.
//      Resend's catch-all route forwards that to the owner's personal Gmail.
// No real inbox at support@ — replies just bounce / go to whatever the SMTP
// path is configured to. The DB row is the source of truth.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
// Default to the owner's personal mailbox — avoids needing a real
// support@findstoop.com inbox. Replies go to the submitter (reply_to is set
// below), so hitting Reply in Gmail reaches the manager directly.
const SUPPORT_EMAIL  = Deno.env.get('FINDSTOOP_SUPPORT_EMAIL')  ?? 'adamcrumrine@gmail.com'
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')        ?? 'noreply@findstoop.com'

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as {
      kind?: 'bug' | 'feature' | 'other'
      subject?: string
      body?: string
      page_url?: string
    }
    const kind = body.kind
    const subject = (body.subject ?? '').trim()
    const description = (body.body ?? '').trim()
    if (!kind || !['bug', 'feature', 'other'].includes(kind)) return json({ error: 'kind required' }, { status: 400 })
    if (!subject) return json({ error: 'subject required' }, { status: 400 })
    if (!description) return json({ error: 'body required' }, { status: 400 })

    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, role, company_name')
      .eq('id', user.id)
      .single()

    const { data: row, error: insErr } = await admin.from('feedback').insert({
      submitter_id: user.id,
      submitter_email: profile?.email ?? user.email ?? null,
      submitter_name: profile?.full_name ?? null,
      kind,
      subject,
      body: description,
      page_url: body.page_url ?? null,
    }).select().single()
    if (insErr) throw new Error(insErr.message)

    // Outbound notification to support@. Resend forwards to personal Gmail.
    const kindLabel = { bug: '🐞 Bug', feature: '✨ Feature request', other: '💬 Feedback' }[kind]
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px">
        <p style="font-size:14px;color:#666;margin:0 0 8px">FindStoop · in-app feedback</p>
        <h2 style="margin:0 0 4px;font-size:18px">${kindLabel} — ${escapeHtml(subject)}</h2>
        <p style="color:#888;font-size:13px;margin:0 0 16px">
          from <strong>${escapeHtml(profile?.full_name ?? profile?.email ?? user.email ?? 'unknown')}</strong>
          ${profile?.company_name ? ` · ${escapeHtml(profile.company_name)}` : ''}
          ${profile?.role ? ` · ${profile.role}` : ''}
        </p>
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px">
          ${escapeHtml(description)}
        </div>
        ${body.page_url ? `<p style="font-size:12px;color:#888;margin-top:14px">Submitted from <a href="${escapeHtml(body.page_url)}">${escapeHtml(body.page_url)}</a></p>` : ''}
        <p style="font-size:12px;color:#999;margin-top:16px">
          Submitter: ${escapeHtml(profile?.email ?? user.email ?? '')} ·
          Feedback id: <code>${row.id}</code>
        </p>
      </div>
    `

    try {
      await resend.emails.send({
        from: `FindStoop Feedback <${RESEND_FROM}>`,
        to: SUPPORT_EMAIL,
        reply_to: profile?.email ?? user.email ?? undefined,
        subject: `[${kind === 'bug' ? 'BUG' : kind === 'feature' ? 'FEATURE' : 'FEEDBACK'}] ${subject}`,
        html,
      })
    } catch (err) {
      // Email failure is non-fatal — the row is already saved.
      // eslint-disable-next-line no-console
      console.warn('Resend send failed', err instanceof Error ? err.message : err)
    }

    return json({ ok: true, id: row.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: msg }, { status: 400 })
  }
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;'
  ))
}
