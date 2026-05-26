// Geocode a free-form street address via Google Maps Geocoding API.
// Used by the Avail import wizard to auto-fill city/state/ZIP that Avail
// doesn't export. Server-side so the API key never leaves the function.
//
// Auth: requires a logged-in user (any role). JWT enforced by Supabase
// gateway (verify_jwt = true in config.toml — default).
//
// Rate limit: 60 calls / minute / user. A typical migration is <10
// addresses; this is plenty for the user but stops anyone from turning
// the endpoint into a free geocoder.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const GOOGLE_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''

interface GeocodeResult {
  city: string | null
  state: string | null         // 2-letter code
  zip: string | null
  formatted_address: string | null
  place_id: string | null
  confidence: string | null    // Google's location_type: ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE
}

interface GoogleAddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface GoogleGeocodeResult {
  address_components: GoogleAddressComponent[]
  formatted_address: string
  place_id: string
  geometry: { location_type: string }
}

interface GoogleGeocodeResponse {
  status: string
  results: GoogleGeocodeResult[]
  error_message?: string
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function pickComponent(components: GoogleAddressComponent[], type: string, short = false): string | null {
  const hit = components.find((c) => c.types.includes(type))
  if (!hit) return null
  return short ? hit.short_name : hit.long_name
}

function parseResult(g: GoogleGeocodeResult): GeocodeResult {
  const c = g.address_components
  return {
    city:  pickComponent(c, 'locality') ?? pickComponent(c, 'sublocality') ?? pickComponent(c, 'administrative_area_level_3'),
    state: pickComponent(c, 'administrative_area_level_1', true),
    zip:   pickComponent(c, 'postal_code'),
    formatted_address: g.formatted_address,
    place_id: g.place_id,
    confidence: g.geometry?.location_type ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req)
  if (req.method !== 'POST') return json(req, { ok: false, message: 'Method not allowed' }, { status: 405 })

  if (!GOOGLE_API_KEY) {
    return json(req, { ok: false, message: 'Server is missing GOOGLE_MAPS_API_KEY' }, { status: 500 })
  }

  // Auth — extract caller's user id from JWT for the rate-limit bucket
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) return json(req, { ok: false, message: 'Unauthorized' }, { status: 401 })

  const allowed = await checkRateLimit({
    key: `geocode-address:${user.id}`,
    windowSeconds: 60,
    maxCount: 60,
  })
  if (!allowed) {
    return json(req, { ok: false, message: 'Rate limit — try again in a minute' }, { status: 429 })
  }

  let body: { address?: string }
  try { body = await req.json() } catch { return json(req, { ok: false, message: 'Invalid JSON' }, { status: 400 }) }
  const address = (body.address ?? '').trim()
  if (!address || address.length < 5) {
    return json(req, { ok: false, message: 'Address is required' }, { status: 400 })
  }

  // Hint Google with country=US — every FindStoop manager is US-based and
  // bare addresses like "301 E 14th Ave" are ambiguous globally.
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('components', 'country:US')
  url.searchParams.set('key', GOOGLE_API_KEY)

  let google: GoogleGeocodeResponse
  try {
    const resp = await fetch(url.toString())
    google = await resp.json() as GoogleGeocodeResponse
  } catch (e) {
    return json(req, { ok: false, message: `Google API request failed: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 502 })
  }

  if (google.status === 'ZERO_RESULTS' || !google.results?.length) {
    return json(req, { ok: false, message: 'No match found' })
  }
  if (google.status !== 'OK') {
    return json(req, { ok: false, message: google.error_message ?? `Google status: ${google.status}` }, { status: 502 })
  }

  const result = parseResult(google.results[0])
  return json(req, { ok: true, result })
})
