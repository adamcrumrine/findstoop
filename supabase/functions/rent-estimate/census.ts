// U.S. Census providers: address → FIPS geography (free geocoder, no key) and
// ACS 5-year rent/context tables (free API key). Public-domain data.
//
// ACS gross-rent-by-bedroom table B25031 is the rent baseline; B25064/B19013/
// B25004/B25003 supply the market-context block on the report.

import type { BaselineRent } from '../_shared/rentEstimate.ts'

const CENSUS_KEY = Deno.env.get('CENSUS_API_KEY') ?? ''
// Latest released ACS 5-year. Bump when a newer vintage ships (each December).
export const ACS_YEAR = 2023

export interface Geography {
  lat: number
  lng: number
  stateFips: string
  countyFips: string // 3-digit
  tract: string // 6-digit
  countyName: string | null // e.g. "Franklin County"
  stateName: string | null // e.g. "Ohio"
  matchedAddress: string | null
}

export interface MarketContext {
  medianGrossRent: number | null
  medianHouseholdIncome: number | null
  rentalVacancyRate: number | null // percent
  renterSharePct: number | null
}

// ACS B25031 (median gross rent by bedrooms): _002E studio … _006E 4BR.
function bedroomVar(bedrooms: number): string {
  const b = Math.min(4, Math.max(0, Math.round(bedrooms)))
  return `B25031_00${b + 2}` // 0→002, 1→003, … 4→006
}

/** Geocode a one-line address to lat/lng + state/county/tract FIPS. No key. */
export async function geocode(address: string): Promise<Geography | null> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress')
  url.searchParams.set('address', address)
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('vintage', 'Census2020_Current')
  url.searchParams.set('format', 'json')

  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = await res.json()
  const match = data?.result?.addressMatches?.[0]
  if (!match) return null

  const tracts = match.geographies?.['Census Tracts']?.[0]
  if (!tracts) return null
  return {
    lat: Number(match.coordinates?.y),
    lng: Number(match.coordinates?.x),
    stateFips: tracts.STATE,
    countyFips: tracts.COUNTY,
    tract: tracts.TRACT,
    countyName: match.geographies?.['Counties']?.[0]?.NAME ?? null,
    stateName: match.geographies?.['States']?.[0]?.NAME ?? null,
    matchedAddress: match.matchedAddress ?? null,
  }
}

async function acsGet(year: number, vars: string[], forClause: string, inClause?: string): Promise<Record<string, string> | null> {
  if (!CENSUS_KEY) return null
  const url = new URL(`https://api.census.gov/data/${year}/acs/acs5`)
  url.searchParams.set('get', ['NAME', ...vars].join(','))
  url.searchParams.set('for', forClause)
  if (inClause) url.searchParams.set('in', inClause)
  url.searchParams.set('key', CENSUS_KEY)

  const res = await fetch(url.toString())
  if (!res.ok) return null
  const rows = await res.json() as string[][]
  if (!Array.isArray(rows) || rows.length < 2) return null
  const [header, values] = rows
  const out: Record<string, string> = {}
  header.forEach((h, i) => { out[h] = values[i] })
  return out
}

function num(v: string | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  // ACS uses large negative sentinels (e.g. -666666666) for suppressed cells.
  return Number.isFinite(n) && n > -100000 ? n : null
}

/**
 * Baseline rent for the subject's bedroom count. Tries tract first (sharpest),
 * falls back to the ZCTA (~ZIP) if the tract cell is suppressed or its margin
 * of error is too wide to trust.
 */
export async function fetchBaseline(geo: Geography, zip: string, bedrooms: number): Promise<BaselineRent | null> {
  const v = bedroomVar(bedrooms)
  const tract = await acsGet(ACS_YEAR, [`${v}E`, `${v}M`],
    `tract:${geo.tract}`, `state:${geo.stateFips} county:${geo.countyFips}`)
  const tVal = num(tract?.[`${v}E`])
  const tMoe = num(tract?.[`${v}M`])
  if (tVal && (!tMoe || tMoe / tVal <= 0.4)) {
    return { value: tVal, moe: tMoe, source: 'acs_tract', vintageYear: ACS_YEAR }
  }

  // ZCTA fallback (queried nationally — no state nesting in ACS detailed tables).
  if (zip) {
    const z = await acsGet(ACS_YEAR, [`${v}E`, `${v}M`], `zip code tabulation area:${zip}`)
    const zVal = num(z?.[`${v}E`])
    if (zVal) return { value: zVal, moe: num(z?.[`${v}M`]), source: 'acs_zip', vintageYear: ACS_YEAR }
  }

  // Tract value existed but with a wide MOE — still better than nothing.
  if (tVal) return { value: tVal, moe: tMoe, source: 'acs_tract', vintageYear: ACS_YEAR }
  return null
}

/** Market-context block for the report (area medians, vacancy, renter share). */
export async function fetchContext(geo: Geography): Promise<MarketContext> {
  const r = await acsGet(ACS_YEAR,
    ['B25064_001E', 'B19013_001E', 'B25002_001E', 'B25004_001E', 'B25003_002E', 'B25003_003E'],
    `tract:${geo.tract}`, `state:${geo.stateFips} county:${geo.countyFips}`)
  const totalUnits = num(r?.['B25002_001E'])
  const vacant = num(r?.['B25004_001E'])
  const owner = num(r?.['B25003_002E'])
  const renter = num(r?.['B25003_003E'])
  const occupied = (owner ?? 0) + (renter ?? 0)
  return {
    medianGrossRent: num(r?.['B25064_001E']),
    medianHouseholdIncome: num(r?.['B19013_001E']),
    rentalVacancyRate: totalUnits && vacant != null ? Math.round((vacant / totalUnits) * 1000) / 10 : null,
    renterSharePct: occupied && renter != null ? Math.round((renter / occupied) * 1000) / 10 : null,
  }
}
