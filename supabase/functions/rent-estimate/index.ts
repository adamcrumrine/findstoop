// rent-estimate — proprietary rental estimate from PUBLIC data, with an
// optional Pro tier that adds RentCast comparable rentals.
//
// Pipeline: geocode → ACS baseline (+ HUD SAFMR fallback/floor) → parcel
// attributes (county auditor → OGRIP → form fallback) → BLS recency trend →
// pure engine (_shared/rentEstimate.ts) → estimate + band + context.
// Pro tier additionally fetches RentCast comps (the only paid source).
//
// Tiers:
//   • basic — free; public-data estimate only.
//   • pro   — $19.99; adds comparable rentals. Gated server-side: only fetched
//             when the caller is entitled (paid — future — or complimentary).
//
// Complimentary accounts (hawk.pig.llc + anyone flagged reports_complimentary,
// + admins) bypass payment and get Pro free. See comp check below.
//
// Fully fail-soft: every external source degrades gracefully. Auth: logged-in
// user (any role). Rate-limited per user.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, corsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'
import { logApiCall, RENTCAST_COST_CENTS } from '../_shared/logging.ts'
import { computeEstimate, type SubjectUnit } from '../_shared/rentEstimate.ts'
import { geocode, fetchBaseline, fetchContext, ACS_YEAR } from './census.ts'
import { fetchHud, hudBaseline } from './hud.ts'
import { fetchRecency } from './bls.ts'
import { lookupParcel } from './parcel.ts'
import { fetchComps } from './rentcast.ts'

// Accounts that get free reporting and bypass the payment portal: anyone on an
// allow-listed email domain, plus accounts flagged reports_complimentary, plus
// admins. To comp another partner, add their domain here or flip the flag.
const COMP_DOMAINS = ['hawk.pig.llc']

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' })
const REPORT_PRICE_CENTS = parseInt(Deno.env.get('REPORT_PRICE_CENTS') ?? '549', 10)
// Pro is the RentCast tier. Keep OFF until RentCast is live (resale rights + key).
const PRO_ENABLED = Deno.env.get('REPORTS_PRO_ENABLED') === 'true'

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

interface ReqBody {
  address?: string
  zip?: string
  unitNumber?: string
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  yearBuilt?: number
  propertyType?: string
  tier?: 'basic' | 'pro'
  /** From a confirmed Stripe PaymentIntent (Basic). Verified server-side below.
   *  Not required for comped accounts. */
  paymentIntentId?: string
  persist?: boolean
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

  const allowed = await checkRateLimit({ key: `rent-estimate:${user.id}`, windowSeconds: 60, maxCount: 30 })
  if (!allowed) return json(req, { ok: false, message: 'Rate limit — try again in a minute' }, { status: 429 })

  let body: ReqBody
  try { body = await req.json() } catch { return json(req, { ok: false, message: 'Invalid JSON' }, { status: 400 }) }

  const address = (body.address ?? '').trim()
  const zip = (body.zip ?? '').trim()
  const bedrooms = Number(body.bedrooms ?? 0)
  const tier: 'basic' | 'pro' = body.tier === 'pro' ? 'pro' : 'basic'
  if (!address || address.length < 5) return json(req, { ok: false, message: 'Address is required' }, { status: 400 })
  if (!Number.isFinite(bedrooms) || bedrooms < 0) return json(req, { ok: false, message: 'Bedrooms is required' }, { status: 400 })

  // ── Entitlement: complimentary, Pro gate, Basic payment verification ────
  // Comp = email on an allow-listed domain, OR profile flagged, OR admin.
  const emailDomain = (user.email ?? '').split('@')[1]?.toLowerCase() ?? ''
  let comped = COMP_DOMAINS.includes(emailDomain)
  if (!comped) {
    const { data: prof } = await supabase.from('profiles').select('reports_complimentary, role').eq('id', user.id).single()
    comped = prof?.reports_complimentary === true || prof?.role === 'admin'
  }

  // Pro is the RentCast tier — gated off while RentCast is paused.
  if (tier === 'pro' && !PRO_ENABLED) {
    return json(req, { ok: false, message: 'Pro reports are coming soon.' }, { status: 403 })
  }

  // Basic requires a verified $4.99 PaymentIntent unless the account is comped.
  const piId = (body.paymentIntentId ?? '').trim()
  if (!comped) {
    if (!piId) return json(req, { ok: false, message: 'Payment required' }, { status: 402 })
    try {
      const pi = await stripe.paymentIntents.retrieve(piId)
      const paid = (pi.status === 'succeeded' || pi.status === 'processing')
        && pi.metadata?.findstoop_manager_id === user.id
        && pi.metadata?.kind === 'rental_analysis'
        && ((pi.amount_received ?? 0) >= REPORT_PRICE_CENTS || pi.amount >= REPORT_PRICE_CENTS)
      if (!paid) return json(req, { ok: false, message: 'Payment could not be verified' }, { status: 402 })
    } catch {
      return json(req, { ok: false, message: 'Payment could not be verified' }, { status: 402 })
    }
    // One report per payment (the UNIQUE column is the backstop).
    const { data: dupe } = await supabase.from('rent_reports').select('id').eq('payment_intent_id', piId).maybeSingle()
    if (dupe) return json(req, { ok: false, message: 'This payment was already redeemed' }, { status: 409 })
  }

  const entitledToPro = tier === 'pro' && PRO_ENABLED && comped

  const started = Date.now()

  // 1. Geocode → FIPS geography (also yields lat/lng for parcel lookup).
  const geo = await geocode(zip ? `${address}, ${zip}` : address)
  if (!geo) {
    await logApiCall({ function_name: 'rent-estimate', vendor: 'supabase', status_code: 422, user_id: user.id, error_message: 'geocode_miss' })
    return json(req, { ok: false, message: 'Could not locate that address' }, { status: 422 })
  }
  const effectiveZip = zip || ''

  // 2. Fetch every source in parallel — each fails soft to null. RentCast is
  //    only called for an entitled Pro request.
  const [acsBaseline, context, hud, recency, parcel, rentcast] = await Promise.all([
    fetchBaseline(geo, effectiveZip, bedrooms).catch(() => null),
    fetchContext(geo).catch(() => ({ medianGrossRent: null, medianHouseholdIncome: null, rentalVacancyRate: null, renterSharePct: null })),
    fetchHud(effectiveZip, bedrooms).catch(() => null),
    fetchRecency(ACS_YEAR),
    lookupParcel(geo, effectiveZip, address.match(/^\s*(\d+)/)?.[1] ?? null).catch(() => null),
    entitledToPro
      ? fetchComps(address, effectiveZip, bedrooms, body.bathrooms ?? null).catch(() => null)
      : Promise.resolve(null),
  ])

  // 3. Baseline: ACS (sharpest) → HUD SAFMR. Neither = can't estimate.
  const baseline = acsBaseline ?? hudBaseline(hud)
  if (!baseline) {
    await logApiCall({ function_name: 'rent-estimate', vendor: 'supabase', status_code: 422, user_id: user.id, error_message: 'no_baseline' })
    return json(req, { ok: false, message: 'No local rent data available for this area yet' }, { status: 422 })
  }

  // 4. Subject attributes: parcel data where available, else form values.
  const usedParcel = !!(parcel && (parcel.sqft || parcel.bedrooms))
  const subject: SubjectUnit = {
    bedrooms,
    bathrooms: parcel?.bathrooms ?? (Number.isFinite(Number(body.bathrooms)) ? Number(body.bathrooms) : null),
    sqft: parcel?.sqft ?? (Number.isFinite(Number(body.sqft)) ? Number(body.sqft) : null),
    yearBuilt: parcel?.yearBuilt ?? (Number.isFinite(Number(body.yearBuilt)) ? Number(body.yearBuilt) : null),
    propertyType: parcel?.propertyType ?? body.propertyType ?? null,
    attributesSource: usedParcel ? 'parcel' : 'user',
  }

  // 5. Run the engine.
  const result = computeEstimate({ baseline, subject, recency, safmrFloor: hud?.bedroomRent ?? null })

  const grossYieldPct = parcel?.assessedValue
    ? Math.round(((result.estimateMonthly * 12) / parcel.assessedValue) * 1000) / 10
    : null

  const sources = [
    `U.S. Census ACS 5-year (${baseline.vintageYear})`,
    hud ? 'HUD Fair Market Rents' : null,
    'BLS CPI — Rent of Primary Residence',
    parcel?.source ?? null,
    rentcast ? 'RentCast comparable rentals' : null,
  ].filter(Boolean)

  const payload = {
    tier,
    comped,
    estimate: result.estimateMonthly,
    low: result.low,
    high: result.high,
    confidence: result.confidence,
    factors: result.factors,
    baseline: result.baseline,
    caveats: result.caveats,
    context: {
      ...context,
      rentTrendFactor: recency.factor,
      rentTrendAsOf: recency.asOf,
      rentToIncomePct: context.medianHouseholdIncome
        ? Math.round(((result.estimateMonthly * 12) / context.medianHouseholdIncome) * 1000) / 10
        : null,
    },
    property: parcel ? {
      source: parcel.source,
      bedrooms: parcel.bedrooms,
      bathrooms: parcel.bathrooms,
      sqft: parcel.sqft,
      yearBuilt: parcel.yearBuilt,
      propertyType: parcel.propertyType,
      assessedValue: parcel.assessedValue,
      lastSalePrice: parcel.lastSalePrice,
      lastSaleDate: parcel.lastSaleDate,
      grossYieldPct,
    } : null,
    // Pro-only: comparable rentals + RentCast's own estimate (cross-check).
    comps: rentcast?.comps ?? null,
    vendorEstimate: rentcast ? { rent: rentcast.vendorRent, low: rentcast.vendorLow, high: rentcast.vendorHigh } : null,
    attributesSource: subject.attributesSource,
    dataSources: sources,
    geography: {
      state: geo.stateFips,
      county: geo.countyFips,
      tract: geo.tract,
      zip: effectiveZip,
      countyName: geo.countyName,
      stateName: geo.stateName,
    },
  }

  // 6. Persist to the user's saved reports (RLS scopes to auth.uid()). Paid
  //    reports always persist so the PaymentIntent is recorded (reuse guard).
  let reportId: string | null = null
  if (body.persist || !comped) {
    const { data: row } = await supabase.from('rent_reports').insert({
      user_id: user.id,
      address,
      unit_number: body.unitNumber ?? null,
      zip: effectiveZip || null,
      bedrooms,
      estimate: result.estimateMonthly,
      low: result.low,
      high: result.high,
      confidence: result.confidence,
      attributes_source: subject.attributesSource,
      tier,
      comped,
      payment_intent_id: comped ? null : piId,
      report: payload,
    }).select('id').single()
    reportId = row?.id ?? null
  }

  await logApiCall({
    function_name: 'rent-estimate', vendor: 'supabase', status_code: 200,
    latency_ms: Date.now() - started, user_id: user.id, reference_id: reportId,
    metadata: { tier, comped, baseline: baseline.source, parcel: parcel?.source ?? 'form', confidence: result.confidence },
  })
  // Track the paid RentCast call separately so it shows in the cost dashboard.
  if (rentcast) {
    await logApiCall({
      function_name: 'rent-estimate', vendor: 'rentcast', status_code: 200,
      user_id: user.id, reference_id: reportId, cost_cents: RENTCAST_COST_CENTS,
      metadata: { comps: rentcast.comps.length },
    })
  }

  return json(req, { ok: true, reportId, ...payload })
})
