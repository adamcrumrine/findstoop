// invite-comanager — the primary adds someone to their management team.
//
// Creates a PENDING team_members row and emails a sign-in link. Pending grants
// nothing: managers_i_act_for only counts rows with accepted_at set. That
// matters because the invitee may already have a Stoop account — if a pending
// row granted access, a mistyped address would hand a stranger read access to
// the whole portfolio without them doing anything. Acceptance is a separate
// deliberate act (accept-team-invite).
//
// Only the team's primary may invite. A view-only member cannot quietly widen
// the team.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4.0.1'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { emailFrom, emailFooterHtml, emailHeaderHtml, brandAccent, companyDisplayName, PLATFORM_NAME } from '../_shared/emailBranding.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://findstoop.com'
const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '')
const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@findstoop.com'

const DEFAULT_PERMISSIONS = {
  payments: 'view', leases: 'view', maintenance: 'view', tenants: 'view', messages: 'edit',
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

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
      .from('profiles').select('full_name, role, company_name, company_logo_url, brand_color')
      .eq('id', user.id).maybeSingle()
    const caller = callerRow as {
      full_name?: string | null; role?: string; company_name?: string | null
      company_logo_url?: string | null; brand_color?: string | null
    } | null
    if (!caller || (caller.role !== 'manager' && caller.role !== 'admin')) {
      return json(req, { ok: false, message: 'Only landlords can invite teammates' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as { email?: string; permissions?: Record<string, string> }
    const email = (body.email ?? '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { ok: false, code: 'bad_email', message: 'Enter a valid email address.' }, { status: 400 })
    }

    // The caller must be the PRIMARY of the team they're adding to.
    const { data: teamRow } = await admin
      .from('teams').select('id, name').eq('primary_manager_id', user.id).maybeSingle()
    const team = teamRow as { id: string; name: string | null } | null
    if (!team) {
      return json(req, { ok: false, message: 'Only the account primary can invite teammates' }, { status: 403 })
    }

    // Existing account? Then we attach to it; otherwise the link creates one.
    const { data: existing } = await admin
      .from('profiles').select('id, role, full_name').ilike('email', email).maybeSingle()
    const existingProfile = existing as { id: string; role: string; full_name: string | null } | null

    if (existingProfile?.role === 'tenant') {
      return json(req, {
        ok: false, code: 'is_tenant',
        message: 'That address already belongs to a tenant account and cannot join a management team.',
      }, { status: 409 })
    }

    let inviteeId = existingProfile?.id ?? null
    let actionLink: string | null = null

    if (!inviteeId) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: `${APP_URL}/manager/team/accept` },
      })
      if (linkErr || !linkData?.user) {
        return json(req, { ok: false, message: linkErr?.message ?? 'Could not create the invite' }, { status: 400 })
      }
      inviteeId = linkData.user.id
      actionLink = linkData.properties?.action_link ?? null
      // New accounts land as managers so the portal renders for them; what
      // they can actually see is decided by RLS, not by this column.
      await admin.from('profiles')
        .upsert({ id: inviteeId, email, role: 'manager' }, { onConflict: 'id' })
    } else {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${APP_URL}/manager/team/accept` },
      })
      actionLink = linkData?.properties?.action_link ?? null
    }

    const { error: memberErr } = await admin.from('team_members').upsert({
      team_id: team.id,
      user_id: inviteeId,
      permissions: body.permissions ?? DEFAULT_PERMISSIONS,
      invited_by: user.id,
      invited_at: new Date().toISOString(),
      accepted_at: null,
      revoked_at: null,
    }, { onConflict: 'team_id,user_id' })
    if (memberErr) return json(req, { ok: false, message: memberErr.message }, { status: 400 })

    const company = companyDisplayName(caller.company_name)
    const accent = brandAccent(company ? caller.brand_color : null)
    const inviterName = caller.full_name ?? 'A landlord'
    const teamName = company ?? team.name ?? `${inviterName}'s team`

    try {
      await resend.emails.send({
        from: emailFrom(company, RESEND_FROM),
        to: email,
        subject: `${inviterName} invited you to help manage ${teamName}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#3A3A3C;line-height:1.55">
            ${emailHeaderHtml(company, caller.company_logo_url ?? null, caller.brand_color ?? null)}
            <h1 style="font-size:22px;font-weight:700;margin:0 0 16px 0">You've been added to a management team</h1>
            <p><strong>${esc(inviterName)}</strong> invited you to help manage <strong>${esc(teamName)}</strong> on ${PLATFORM_NAME}.</p>
            <p>You'll be able to see the portfolio — properties, leases, payments and maintenance — and message tenants. You won't be able to change anything unless ${esc(inviterName)} grants it.</p>
            ${actionLink ? `<p style="margin:24px 0"><a href="${actionLink}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Accept invitation</a></p>` : ''}
            <p style="font-size:13px;color:#8A8A8E">If you weren't expecting this, ignore it — the invitation grants nothing until you accept.</p>
            ${emailFooterHtml(company)}
          </div>`,
      })
    } catch { /* the row exists; a bounced email is recoverable by re-inviting */ }

    return json(req, { ok: true, invited: email, pending: true })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
