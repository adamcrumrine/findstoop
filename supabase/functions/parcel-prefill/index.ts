// Pre-fills the Rental Analysis form from county auditor records BEFORE
// purchase: address (+ optional ZIP) → geocode → county parcel lookup → beds/
// baths/sqft/year/type + value. Free to call (public data), auth + rate-limited
// so it can't be farmed as an anonymous parcel API.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { geocode } from '../rent-estimate/census.ts'
import { lookupParcel } from '../rent-estimate/parcel.ts'

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

  if (!(await checkRateLimit({ key: `parcel-prefill:${user.id}`, windowSeconds: 60, maxCount: 30 }))) {
    return json(req, { ok: false, message: 'Rate limit — try again in a minute' }, { status: 429 })
  }

  let body: { address?: string; zip?: string }
  try { body = await req.json() } catch { return json(req, { ok: false, message: 'Invalid JSON' }, { status: 400 }) }
  const address = (body.address ?? '').trim()
  const zip = (body.zip ?? '').trim()
  if (!address || address.length < 5) return json(req, { ok: false, message: 'Address is required' }, { status: 400 })

  const geo = await geocode(zip ? `${address}, ${zip}` : address).catch(() => null)
  if (!geo) return json(req, { ok: true, found: false, reason: 'address_not_found' })

  const houseNumber = address.match(/^\s*(\d+)/)?.[1] ?? null
  const parcel = await lookupParcel(geo, zip, houseNumber).catch(() => null)

  return json(req, {
    ok: true,
    found: !!parcel,
    parcel: parcel ? {
      bedrooms: parcel.bedrooms,
      bathrooms: parcel.bathrooms,
      sqft: parcel.sqft,
      yearBuilt: parcel.yearBuilt,
      propertyType: parcel.propertyType,
      assessedValue: parcel.assessedValue,
      source: parcel.source,
    } : null,
    geography: {
      countyName: geo.countyName,
      stateName: geo.stateName,
      matchedAddress: geo.matchedAddress,
    },
  })
})
