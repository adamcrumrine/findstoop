// accept-team-invite — the invitee turns a pending membership into a real one.
//
// Separate from invite-comanager on purpose. A pending row grants nothing, so
// acceptance is the moment access actually begins, and it must be the invitee's
// own act: otherwise a mistyped address would hand a stranger the portfolio.
//
// Runs with the service role rather than an RLS policy because the only field
// the invitee may change is accepted_at. A self-update policy broad enough to
// stamp that would also have let them rewrite their own `permissions` and
// promote themselves from view-only to edit.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

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

    // Only this caller's own pending, unrevoked invitations. Never by id from
    // the request body — that would let anyone accept anyone's invitation.
    const { data: pending } = await admin
      .from('team_members')
      .select('team_id, team:teams(name)')
      .eq('user_id', user.id)
      .is('accepted_at', null)
      .is('revoked_at', null)

    const rows = (pending ?? []) as unknown as Array<{ team_id: string; team: { name: string | null } | null }>
    if (rows.length === 0) return json(req, { ok: true, accepted: 0, message: 'No pending invitations' })

    const { error: updErr } = await admin
      .from('team_members')
      .update({ accepted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
    if (updErr) return json(req, { ok: false, message: updErr.message }, { status: 400 })

    return json(req, { ok: true, accepted: rows.length, team: rows[0].team?.name ?? null })
  } catch (err) {
    return json(req, { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
