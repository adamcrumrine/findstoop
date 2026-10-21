// submit-application — the only way a rental application gets created.
//
// The public Apply page used to INSERT straight into `applications` with the
// anon key (RLS: with_check true), so a script could flood any landlord with
// junk applications at no cost. This function sits in front of that insert:
//   • honeypot: a hidden form field humans never fill — if it's filled we
//     answer "ok" and save nothing, so the bot learns nothing
//   • Turnstile human check (no-op until TURNSTILE_SECRET_KEY is set)
//   • per-IP limits (5/hour, 20/day) and per unit+email (3/day)
//   • the unit must exist
// Migration 20261021000001 drops the anon insert policy so this can't be
// bypassed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit, clientIp } from '../_shared/rateLimit.ts'
import { verifyHuman } from '../_shared/turnstile.ts'

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const TEXT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'current_address', 'current_city', 'current_state',
  'current_zip', 'current_landlord_name', 'current_landlord_phone', 'reason_for_leaving', 'employer',
  'job_title', 'pets_description',
] as const
const DATE_FIELDS = ['date_of_birth', 'employment_start_date', 'desired_move_in_date'] as const
const NUMBER_FIELDS = ['current_rent', 'monthly_income', 'household_size'] as const

const clip = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}
const isoDate = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 && n < 100_000_000 ? n : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, { status: 405 })

  try {
    const body = await req.json().catch(() => ({})) as {
      unitId?: string
      fields?: Record<string, unknown>
      website?: string          // honeypot
      humanToken?: string
    }

    // Honeypot: pretend success, save nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return json(req, { ok: true, id: crypto.randomUUID(), statusToken: crypto.randomUUID() })
    }

    const ip = clientIp(req)
    const underLimit =
      await checkRateLimit({ key: `submit-application:ip-hour:${ip}`, windowSeconds: 3600, maxCount: 5 })
      && await checkRateLimit({ key: `submit-application:ip-day:${ip}`, windowSeconds: 86400, maxCount: 20 })
    if (!underLimit) {
      return json(req, { error: 'Too many applications from this connection — please try again later.' }, { status: 429 })
    }

    if (!await verifyHuman(body.humanToken, ip)) {
      return json(req, { error: 'Please complete the “I’m human” check and try again.' }, { status: 403 })
    }

    const f = body.fields ?? {}
    const unitId = typeof body.unitId === 'string' ? body.unitId : ''
    const row: Record<string, unknown> = { unit_id: unitId }
    for (const k of TEXT_FIELDS) row[k] = clip(f[k], k === 'reason_for_leaving' || k === 'pets_description' ? 2000 : 200)
    for (const k of DATE_FIELDS) row[k] = isoDate(f[k])
    for (const k of NUMBER_FIELDS) row[k] = num(f[k])
    row.has_pets = f.has_pets === true
    if (!row.has_pets) row.pets_description = null
    if (typeof row.email === 'string') row.email = (row.email as string).toLowerCase()
    if (typeof row.current_state === 'string') row.current_state = (row.current_state as string).toUpperCase().slice(0, 2)

    if (!row.first_name || !row.last_name || !row.email || !/^\S+@\S+\.\S+$/.test(row.email as string)) {
      return json(req, { error: 'Name and a valid email are required.' }, { status: 400 })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: unit } = await admin.from('units').select('id').eq('id', unitId).maybeSingle()
    if (!unit) return json(req, { error: 'This listing could not be found.' }, { status: 404 })

    // The same person re-submitting to the same unit over and over is a bot
    // or a stuck button either way.
    const dupOk = await checkRateLimit({
      key: `submit-application:unit-email:${unitId}:${row.email}`, windowSeconds: 86400, maxCount: 3,
    })
    if (!dupOk) {
      return json(req, { error: 'You’ve already applied to this home today — the landlord has your application.' }, { status: 429 })
    }

    const { data: inserted, error } = await admin
      .from('applications')
      .insert(row)
      .select('id, status_token')
      .single()
    if (error || !inserted) return json(req, { error: error?.message ?? 'Could not submit application' }, { status: 500 })

    return json(req, { ok: true, id: inserted.id, statusToken: inserted.status_token })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Could not submit application' }, { status: 400 })
  }
})
