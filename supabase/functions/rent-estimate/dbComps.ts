// First-party lease comps: FindStoop's own database is ground-truth rent data
// no vendor has. We pull leases near the subject, gross aged rents up to
// today's market via the CPI rent index (a long-term tenant's unchanged rent
// understates the market — exactly what the gross-up corrects), and weight
// each comp by DISTANCE (haversine radius) and RECENCY before blending into
// the estimate.
//
// Privacy: other managers' leases are used ONLY as an anonymous aggregate
// (weighted median + effective sample size). A specific address+rent is only
// ever surfaced when the lease belongs to the requesting manager (their own
// data). This matches the platform's PII guardrails.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cpiFactorSince } from './bls.ts'
import type { Geography } from './census.ts'

export interface LeaseSignal {
  /** Kish effective sample size of the weighted comp set. */
  nEff: number
  /** Raw count of leases used. */
  n: number
  /** Distance+recency-weighted median of inflation-adjusted rents. */
  weightedMedianGrossed: number
  /** The subject property's own lease — populated ONLY when it belongs to the caller. */
  subject: {
    rent: number
    grossedRent: number
    startDate: string
    /** True when the tenant has been in place 2+ years (gross-up applied). */
    longTerm: boolean
  } | null
}

const RADIUS_MILES = 3
const MAX_COMPS = 50
const RECENCY_HALF_LIFE_YEARS = 3 // a 3-year-old lease counts half as much
const DISTANCE_POWER = 1.5 // weight = 1 / (1 + miles)^p
/** ZIP-matched comp with no coordinates yet — treated as this far away. */
const NO_COORDS_ASSUMED_MILES = 1.5

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8 // earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

interface WeightedRent { rent: number; weight: number }

/** Weighted median: walk the cumulative weight to its midpoint. */
export function weightedMedian(items: WeightedRent[]): number {
  if (!items.length) return 0
  const sorted = [...items].sort((a, b) => a.rent - b.rent)
  const total = sorted.reduce((s, i) => s + i.weight, 0)
  let cum = 0
  for (const i of sorted) {
    cum += i.weight
    if (cum >= total / 2) return i.rent
  }
  return sorted[sorted.length - 1].rent
}

/** Kish effective sample size — N independent-ish comps after weighting. */
export function effectiveN(weights: number[]): number {
  const sum = weights.reduce((s, w) => s + w, 0)
  const sumSq = weights.reduce((s, w) => s + w * w, 0)
  return sumSq > 0 ? (sum * sum) / sumSq : 0
}

interface LeaseRow {
  rent_amount: number | string | null
  start_date: string | null
  status: string
  unit: {
    bedrooms: number | null
    property: {
      address: string; zip: string; manager_id: string
      latitude: number | null; longitude: number | null
    } | null
  } | null
}

export async function fetchLeaseSignal(
  admin: SupabaseClient,
  geo: Geography,
  zip: string,
  bedrooms: number,
  houseNumber: string | null,
  streetToken: string | null,
  callerUserId: string,
): Promise<LeaseSignal | null> {
  if (!zip) return null

  // Active leases + recently ended ones (aged barometers, per the gross-up).
  const { data, error } = await admin
    .from('leases')
    .select(`
      rent_amount, start_date, status,
      unit:units!inner(
        bedrooms,
        property:properties!inner(address, zip, manager_id, latitude, longitude)
      )
    `)
    .in('status', ['active', 'pending', 'ended'])
    .gt('rent_amount', 0)
    .limit(500)
  if (error || !data) return null

  const now = Date.now()
  const rows = (data as unknown as LeaseRow[]).filter((l) => {
    const p = l.unit?.property
    if (!p || p.zip !== zip) return false
    if (l.unit?.bedrooms == null) return false
    if (Math.abs(l.unit.bedrooms - bedrooms) > 1) return false // same ±1 bed
    if (!l.start_date) return false
    // Aged records are fine (we gross them up) — but cap at 5 years stale.
    return (now - new Date(l.start_date).getTime()) < 5 * 31_557_600_000
  }).slice(0, MAX_COMPS)
  if (!rows.length) return null

  // Subject's own lease: house number + street token + ZIP all match.
  let subject: LeaseSignal['subject'] = null
  const weighted: WeightedRent[] = []

  for (const l of rows) {
    const p = l.unit!.property!
    const rent = Number(l.rent_amount)
    const startDate = l.start_date!
    const grossed = Math.round(rent * await cpiFactorSince(startDate))
    const ageYears = (now - new Date(startDate).getTime()) / 31_557_600_000

    // Exact-subject match?
    const addr = p.address.toLowerCase()
    const isSubject = !!houseNumber && !!streetToken &&
      new RegExp(`(^|\\D)${houseNumber}(\\D|$)`).test(addr) && addr.includes(streetToken)
    if (isSubject) {
      // Only surface (and strongly anchor on) the caller's OWN lease.
      if (p.manager_id === callerUserId && !subject) {
        subject = { rent, grossedRent: grossed, startDate, longTerm: ageYears >= 2 }
      }
      // Another manager's exact lease still joins the aggregate below — used,
      // never shown.
    }

    // Distance weight: real haversine when coords exist, neutral assumption
    // for same-ZIP rows not yet geocoded.
    const miles = (p.latitude != null && p.longitude != null)
      ? haversineMiles(geo.lat, geo.lng, p.latitude, p.longitude)
      : NO_COORDS_ASSUMED_MILES
    if (miles > RADIUS_MILES) continue
    const wDist = 1 / Math.pow(1 + miles, DISTANCE_POWER)
    const wTime = Math.pow(0.5, ageYears / RECENCY_HALF_LIFE_YEARS)
    const wBed = l.unit!.bedrooms === bedrooms ? 1 : 0.6 // ±1 bed counts less
    weighted.push({ rent: grossed, weight: wDist * wTime * wBed })
  }

  if (!weighted.length && !subject) return null
  return {
    nEff: Math.round(effectiveN(weighted.map((w) => w.weight)) * 10) / 10,
    n: weighted.length,
    weightedMedianGrossed: weightedMedian(weighted),
    subject,
  }
}

/**
 * Self-healing coordinates: geocode a few not-yet-coded properties in this ZIP
 * (free Census geocoder) so radius weighting improves with every report run.
 * Fire-and-forget — never blocks or fails the report.
 */
export async function backfillCoords(admin: SupabaseClient, zip: string): Promise<void> {
  try {
    const { data } = await admin
      .from('properties')
      .select('id, address, city, state, zip')
      .eq('zip', zip)
      .is('latitude', null)
      .limit(5)
    for (const p of data ?? []) {
      const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
      url.searchParams.set('address', `${p.address}, ${p.city}, ${p.state} ${p.zip}`)
      url.searchParams.set('benchmark', 'Public_AR_Current')
      url.searchParams.set('format', 'json')
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const m = (await res.json())?.result?.addressMatches?.[0]
      if (m?.coordinates) {
        await admin.from('properties')
          .update({ latitude: Number(m.coordinates.y), longitude: Number(m.coordinates.x) })
          .eq('id', p.id)
      }
    }
  } catch { /* best-effort only */ }
}
