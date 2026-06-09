// Parcel-attribute provider with a graceful fallback chain.
//
// The point of this module is RESILIENCE: county auditor sites vary in schema,
// uptime, and coverage. So lookup() walks a chain and degrades instead of
// failing — for any address it returns the BEST available source, and the
// caller falls back to the user's self-reported form values when we get null.
//
//   1. County-specific provider (authoritative; e.g. Franklin County, OH)
//   2. State-wide provider     (OGRIP "Ohio Parcels" for any OH county)
//   3. null                    → caller uses the form-entered attributes
//
// Adding a new county or state = add one entry to PROVIDERS. Nothing else
// changes. Each provider is wrapped so a down/renamed/slow endpoint can never
// break the estimate — it just drops to the next link in the chain.
//
// NOTE: the ArcGIS endpoint URLs and layer indices below should be verified
// against each service's live REST directory before production — they move
// occasionally. Field NAMES are handled defensively (see pickField), so schema
// drift within a layer is already tolerated.

import type { Geography } from './census.ts'

export interface ParcelAttributes {
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  yearBuilt: number | null
  propertyType: string | null
  assessedValue: number | null
  lastSalePrice: number | null
  lastSaleDate: string | null
  /** Provenance string for the report's data-sources list. */
  source: string
}

type Provider = (geo: Geography, zip: string) => Promise<ParcelAttributes | null>

// ── Helpers ───────────────────────────────────────────────────────────────

/** Case-insensitive field pick across candidate names (schemas vary by county). */
// deno-lint-ignore no-explicit-any
function pickField(attrs: Record<string, any>, candidates: RegExp[]): any {
  const keys = Object.keys(attrs)
  for (const rx of candidates) {
    const hit = keys.find((k) => rx.test(k))
    if (hit && attrs[hit] != null && attrs[hit] !== '') return attrs[hit]
  }
  return null
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Query an ArcGIS Feature/Map layer for the parcel containing a point. */
// deno-lint-ignore no-explicit-any
async function arcgisPointQuery(layerUrl: string, lat: number, lng: number): Promise<Record<string, any> | null> {
  const url = new URL(`${layerUrl}/query`)
  url.searchParams.set('geometry', `${lng},${lat}`)
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('outFields', '*')
  url.searchParams.set('returnGeometry', 'false')
  url.searchParams.set('f', 'json')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const json = await res.json()
  return json?.features?.[0]?.attributes ?? null
}

// deno-lint-ignore no-explicit-any
function mapArcgisAttrs(a: Record<string, any>, source: string): ParcelAttributes {
  // Field-name candidates verified against Franklin County's live schema
  // (BEDRMS, BATHS, RESFLRAREA, RESYRBLT, TOTVALUEBASE, SALEPRICE, SALEDATE) and
  // kept broad enough to tolerate other counties' naming.
  return {
    bedrooms: toNum(pickField(a, [/bedrm|\bbeds?\b|bed.?rooms?|no.?bed/i])),
    bathrooms: toNum(pickField(a, [/full.?bath|bath.?full/i, /\bbaths?\b|bathrm/i, /fixtures/i])),
    sqft: toNum(pickField(a, [
      /fin.*sq.*ft|finished/i, /livingarea|liv_?area|sqft_liv/i,
      /res.?flr.?area|flr.?area|floor.?area/i, /bldg.?area|gross.?area|tot.*sq.*ft/i,
      /\bsqft\b|sq_?ft|area_?sqft|square.?foot/i,
    ])),
    yearBuilt: toNum(pickField(a, [/year.?built|yr.?blt|res.?yr.?blt|yearbuilt|actyrblt/i])),
    propertyType: (pickField(a, [/landuse|land_?use|prop.?class|classdesc|usedesc|propertyuse|luc\b/i]) ?? null) as string | null,
    assessedValue: toNum(pickField(a, [
      /tot.?value.?base|totvalue|tot_?val|cnttxblval/i,
      /mkt.*tot|total.*mkt|market.?value|appr.?tot|totalvalue|mktval/i,
    ])),
    lastSalePrice: toNum(pickField(a, [/sale.?price|saleamt|lastsale|amount.?sale/i])),
    lastSaleDate: (pickField(a, [/sale.?date|saledate|transfer.?date|deed.?date/i]) ?? null) as string | null,
    source,
  }
}

// ── Ohio providers ──────────────────────────────────────────────────────────
// Verify these layer URLs against each service's REST directory before prod.

// Franklin County (FIPS 049) Auditor — appraisal/parcel features.
// VERIFIED 2026-06-08: live, returns BEDRMS/BATHS/RESFLRAREA/RESYRBLT/
// TOTVALUEBASE/SALEPRICE/SALEDATE. Covers Columbus (the launch market).
const FRANKLIN_PARCEL_LAYER =
  'https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/0'

// OGRIP statewide "Ohio Parcels" hosted feature layer (any OH county fallback).
// ⚠️ UNVERIFIED placeholder — this URL returned HTTP 400 on 2026-06-08. Find the
// real layer URL from the OGRIP hub (ohioparcels-geohio.hub.arcgis.com → the
// dataset's "I want to use this" → GeoService URL) and replace below. Until then
// the chain degrades safely: non-Franklin OH addresses fall back to form values.
const OGRIP_OHIO_PARCELS_LAYER =
  'https://services.arcgis.com/Eln4nigPjVDtBQjr/arcgis/rest/services/Ohio_Parcels/FeatureServer/0'

const franklinCounty: Provider = async (geo) => {
  const a = await arcgisPointQuery(FRANKLIN_PARCEL_LAYER, geo.lat, geo.lng)
  return a ? mapArcgisAttrs(a, 'Franklin County Auditor') : null
}

const ogripOhio: Provider = async (geo) => {
  const a = await arcgisPointQuery(OGRIP_OHIO_PARCELS_LAYER, geo.lat, geo.lng)
  return a ? mapArcgisAttrs(a, 'Ohio OGRIP statewide parcels') : null
}

// Registry: state FIPS → ordered chain of providers (most authoritative first).
// '39' is Ohio. County-specific entries are keyed by county FIPS within a state.
const PROVIDERS: Record<string, { byCounty?: Record<string, Provider[]>; statewide?: Provider[] }> = {
  '39': {
    byCounty: { '049': [franklinCounty] }, // Franklin County (Columbus)
    statewide: [ogripOhio],
  },
}

/**
 * Walk the fallback chain for this geography. Returns the first non-null result,
 * or null if no provider covers this state/county (caller uses form values).
 * Every provider call is isolated — a thrown error or timeout drops to the next.
 */
export async function lookupParcel(geo: Geography, zip: string): Promise<ParcelAttributes | null> {
  const state = PROVIDERS[geo.stateFips]
  if (!state) return null

  const chain: Provider[] = [
    ...(state.byCounty?.[geo.countyFips] ?? []),
    ...(state.statewide ?? []),
  ]
  for (const provider of chain) {
    try {
      const result = await provider(geo, zip)
      // Require at least one usable hedonic field to count it as a hit.
      if (result && (result.sqft || result.bedrooms || result.yearBuilt)) return result
    } catch {
      // Down/renamed/slow endpoint — fall through to the next provider.
    }
  }
  return null
}
