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

/** Query an ArcGIS Feature/Map layer for the parcel containing a point.
 *  Pass distanceMeters for POINT layers (e.g. Cuyahoga's CAMA points), where an
 *  exact intersect would never hit — we search a small radius instead. */
// deno-lint-ignore no-explicit-any
async function arcgisPointQuery(layerUrl: string, lat: number, lng: number, distanceMeters?: number): Promise<Record<string, any> | null> {
  const url = new URL(`${layerUrl}/query`)
  url.searchParams.set('geometry', `${lng},${lat}`)
  url.searchParams.set('geometryType', 'esriGeometryPoint')
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  if (distanceMeters) {
    url.searchParams.set('distance', String(distanceMeters))
    url.searchParams.set('units', 'esriSRUnit_Meter')
  }
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
    propertyType: (pickField(a, [/luc_?desc|land_?use_?desc/i, /landuse|land_?use|prop.?class|classdesc|usedesc|propertyuse|luc\b/i, /\bclass\b/i]) ?? null) as string | null,
    assessedValue: toNum(pickField(a, [
      /tot.?value.?base|totvalue|tot_?val|cnttxblval/i,
      /gross_?certified_?total|certified_?tax_?total/i, // Cuyahoga CAMA
      /mkt.*tot|total.*mkt|market.?value|appr.?tot|totalvalue|mktval/i, // Hamilton MKT_TOTAL_VAL
    ])),
    lastSalePrice: toNum(pickField(a, [/sale.?price|saleamt|lastsale|amount.?sale|sales?_?amount/i])),
    lastSaleDate: (pickField(a, [/sale.?date|saledate|saldat|transfer.?date|deed.?date/i]) ?? null) as string | null,
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

// NOTE — no statewide Ohio fallback, by design. The official OGRIP "Ohio
// Statewide Parcels Public View" layer was verified live on 2026-06-09
// (https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/
//  OhioStatewidePacels_full_view/FeatureServer/0) but its public view exposes
// only boundaries/addresses/StateLUC — NO beds, baths, sqft, year built, value,
// or sale fields — so it can never satisfy the hit condition in lookupParcel()
// and would just burn a network call per non-covered address. Expansion path:
// add a per-county auditor adapter per market (like the three below) — next up:
// Montgomery '113' (Dayton), Summit '153' (Akron), Lucas '095' (Toledo). Use
// parcel_coverage_requests demand counts to prioritize beyond Ohio. Until a
// county is added, its addresses fall back to the form's values.

const franklinCounty: Provider = async (geo) => {
  const a = await arcgisPointQuery(FRANKLIN_PARCEL_LAYER, geo.lat, geo.lng)
  return a ? mapArcgisAttrs(a, 'Franklin County Auditor') : null
}

// Cuyahoga County (Cleveland) — CAMA point layer, VERIFIED 2026-06-09.
// POINT geometry (one point per parcel), so we search a 40m radius. Supplies
// total_res_liv_area (sqft), sales_amount/transfer_date, gross_certified_total,
// tax_luc_description. No beds/baths/year-built in the public layer.
const CUYAHOGA_CAMA_LAYER =
  'https://gis.cuyahogacounty.us/server/rest/services/CUYAHOGA_BASE/TaxMap_Parcels_CAMA_RP_WGS84/FeatureServer/0'

const cuyahogaCounty: Provider = async (geo) => {
  const a = await arcgisPointQuery(CUYAHOGA_CAMA_LAYER, geo.lat, geo.lng, 40)
  return a ? mapArcgisAttrs(a, 'Cuyahoga County Fiscal Office') : null
}

// Hamilton County (Cincinnati) — CAGIS Open Data parcel polygons, VERIFIED
// 2026-06-09. Supplies MKT_TOTAL_VAL, SALAMT/SALDAT, CLASS/EXLUCODE. The public
// layer has NO sqft/beds/year-built, so this enriches the property-record block
// (value, sale, yield) while hedonic attributes still come from the form.
const HAMILTON_PARCEL_LAYER =
  'https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/Open_Data/FeatureServer/51'

const hamiltonCounty: Provider = async (geo) => {
  const a = await arcgisPointQuery(HAMILTON_PARCEL_LAYER, geo.lat, geo.lng)
  return a ? mapArcgisAttrs(a, 'Hamilton County Auditor (CAGIS)') : null
}

// Registry: state FIPS → ordered chain of providers (most authoritative first).
// '39' is Ohio. County-specific entries are keyed by county FIPS within a state.
const PROVIDERS: Record<string, { byCounty?: Record<string, Provider[]>; statewide?: Provider[] }> = {
  '39': {
    byCounty: {
      '049': [franklinCounty], // Franklin (Columbus) — full attributes
      '035': [cuyahogaCounty], // Cuyahoga (Cleveland) — sqft + value + sale
      '061': [hamiltonCounty], // Hamilton (Cincinnati) — value + sale only
    },
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
      // Count it as a hit if it has hedonic fields (sqft/beds/year — used to
      // auto-fill the estimate inputs) OR valuation/sale data (used to enrich
      // the property-record block + gross yield, e.g. Hamilton). The caller
      // decides attributesSource based on hedonics specifically.
      if (result && (result.sqft || result.bedrooms || result.yearBuilt || result.assessedValue || result.lastSalePrice)) {
        return result
      }
    } catch {
      // Down/renamed/slow endpoint — fall through to the next provider.
    }
  }
  return null
}
