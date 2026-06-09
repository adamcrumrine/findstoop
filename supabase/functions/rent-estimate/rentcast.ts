// RentCast comparable rentals — the ONLY non-zero-cost data source in the
// report (~$0.10–$0.40/call), so the orchestrator calls it ONLY for the Pro
// tier. Fail-soft: returns null on any error so a Pro report still renders the
// public-data estimate if RentCast is unavailable.
//
// ⚠️ Reselling RentCast data inside a paid report requires confirming their API
// Terms of Use permit redistribution to end users (+ any attribution). Settle
// that before turning this on in production.

const KEY = Deno.env.get('RENTCAST_API_KEY') ?? ''

export interface Comp {
  address: string | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  rent: number | null
  distanceMi: number | null
  daysOnMarket: number | null
}

export interface RentCastResult {
  /** RentCast's own rent estimate — kept for cross-checking our engine. */
  vendorRent: number | null
  vendorLow: number | null
  vendorHigh: number | null
  comps: Comp[]
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function fetchComps(
  address: string,
  zip: string,
  bedrooms?: number,
  bathrooms?: number | null,
): Promise<RentCastResult | null> {
  if (!KEY) return null
  try {
    const url = new URL('https://api.rentcast.io/v1/avm/rent/long-term')
    url.searchParams.set('address', zip ? `${address}, ${zip}` : address)
    if (bedrooms) url.searchParams.set('bedrooms', String(bedrooms))
    if (bathrooms) url.searchParams.set('bathrooms', String(bathrooms))
    url.searchParams.set('compCount', '10')

    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const j = await res.json()

    // deno-lint-ignore no-explicit-any
    const comps: Comp[] = Array.isArray(j?.comparables)
      ? j.comparables.slice(0, 10).map((c: any) => ({
          address: c.formattedAddress ?? null,
          bedrooms: num(c.bedrooms),
          bathrooms: num(c.bathrooms),
          sqft: num(c.squareFootage),
          rent: num(c.price),
          distanceMi: num(c.distance),
          daysOnMarket: num(c.daysOnMarket),
        }))
      : []

    return {
      vendorRent: num(j?.rent),
      vendorLow: num(j?.rentRangeLow),
      vendorHigh: num(j?.rentRangeHigh),
      comps,
    }
  } catch {
    return null
  }
}
