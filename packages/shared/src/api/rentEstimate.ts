// Frontend client for the rent-estimate edge function + saved-report reads.
// The estimate is computed entirely from public data (Census/HUD/BLS + county
// auditor); see supabase/functions/rent-estimate. No vendor per-call cost.

import { supabase } from '../lib/supabase'

export type ReportTier = 'basic' | 'pro'

export interface RentEstimateInput {
  address: string
  zip?: string
  unitNumber?: string
  bedrooms: number
  bathrooms?: number
  sqft?: number
  yearBuilt?: number
  propertyType?: string
  /** 'basic' = $4.99 public-data estimate; 'pro' = RentCast tier (coming soon). */
  tier?: ReportTier
  /** From a confirmed Stripe PaymentIntent (Basic). Not needed for comp accounts. */
  paymentIntentId?: string
  /** Persist to the user's "Your Reports" list (set true on purchase). */
  persist?: boolean
}

export interface RentComp {
  address: string | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  rent: number | null
  distanceMi: number | null
  daysOnMarket: number | null
}

export interface RentEstimateReport {
  tier: ReportTier
  comped: boolean
  estimate: number
  low: number
  high: number
  confidence: 'low' | 'medium' | 'high'
  factors: { base: number; utilities: number; size: number; bath: number; age: number; type: number; recency: number }
  baseline: { value: number; source: 'acs_tract' | 'acs_zip' | 'safmr' | 'fmr'; bedroom: number; vintageYear: number }
  caveats: string[]
  context: {
    medianGrossRent: number | null
    medianHouseholdIncome: number | null
    rentalVacancyRate: number | null
    renterSharePct: number | null
    rentTrendFactor: number
    rentTrendAsOf: string
    rentToIncomePct: number | null
  }
  property: {
    source: string
    bedrooms: number | null
    bathrooms: number | null
    sqft: number | null
    yearBuilt: number | null
    propertyType: string | null
    assessedValue: number | null
    lastSalePrice: number | null
    lastSaleDate: string | null
    grossYieldPct: number | null
  } | null
  /** Pro tier only — comparable rentals from RentCast (null on basic). */
  comps: RentComp[] | null
  vendorEstimate: { rent: number | null; low: number | null; high: number | null } | null
  /** 'parcel' = pulled from county auditor; 'user' = self-reported form values. */
  attributesSource: 'parcel' | 'user'
  dataSources: string[]
  geography: {
    state: string; county: string; tract: string; zip: string
    countyName?: string | null; stateName?: string | null
  }
}

export interface SavedRentReport {
  id: string
  address: string
  unit_number: string | null
  zip: string | null
  bedrooms: number
  estimate: number
  low: number
  high: number
  confidence: 'low' | 'medium' | 'high'
  attributes_source: 'parcel' | 'user'
  tier: ReportTier
  comped: boolean
  report: RentEstimateReport
  created_at: string
}

/** Run a rent estimate. Pass persist:true to save it to the user's reports. */
export async function getRentEstimate(input: RentEstimateInput): Promise<{ reportId: string | null; report: RentEstimateReport }> {
  const { data, error } = await supabase.functions.invoke('rent-estimate', { body: input })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.message ?? 'Could not generate a rent estimate')
  const { ok: _ok, reportId, ...report } = data
  return { reportId: reportId ?? null, report: report as RentEstimateReport }
}

export interface ParcelPrefill {
  found: boolean
  parcel: {
    bedrooms: number | null; bathrooms: number | null; sqft: number | null
    yearBuilt: number | null; propertyType: string | null
    assessedValue: number | null; source: string
  } | null
  geography: { countyName: string | null; stateName: string | null; matchedAddress: string | null }
}

/** Look up county auditor records for an address to pre-fill the report form.
 *  Free; works in covered counties (see the rent-estimate parcel providers). */
export async function prefillProperty(address: string, zip?: string): Promise<ParcelPrefill> {
  const { data, error } = await supabase.functions.invoke('parcel-prefill', { body: { address, zip } })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.message ?? 'Lookup failed')
  return data as ParcelPrefill
}

/** Start a one-time $4.99 charge for a Basic report. Returns { free: true } for
 *  comp accounts (skip payment) or a Stripe client secret to confirm. */
export async function createReportPayment(): Promise<{ free: boolean; clientSecret?: string; paymentIntentId?: string }> {
  const { data, error } = await supabase.functions.invoke('create-report-payment', { body: {} })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.message ?? 'Could not start payment')
  return { free: !!data.free, clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId }
}

/** A user's saved Rental Analysis Reports, newest first ("Your Reports"). */
export async function listRentReports(): Promise<SavedRentReport[]> {
  const { data, error } = await supabase
    .from('rent_reports')
    .select('id, address, unit_number, zip, bedrooms, estimate, low, high, confidence, attributes_source, tier, comped, report, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as SavedRentReport[]
}

/** Whether the current user gets complimentary (free) Pro reports — bypasses
 *  the payment portal. True for comp accounts (e.g. hawk.pig.llc) and admins. */
export async function getReportEntitlement(): Promise<{ comped: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { comped: false }
  const domain = (user.email ?? '').split('@')[1]?.toLowerCase() ?? ''
  if (domain === 'hawk.pig.llc') return { comped: true }
  const { data } = await supabase.from('profiles').select('reports_complimentary, role').eq('id', user.id).single()
  return { comped: data?.reports_complimentary === true || data?.role === 'admin' }
}

/** Fetch a single saved report by id (RLS scopes to the owner). For the PDF page. */
export async function getRentReport(id: string): Promise<SavedRentReport | null> {
  const { data, error } = await supabase
    .from('rent_reports')
    .select('id, address, unit_number, zip, bedrooms, estimate, low, high, confidence, attributes_source, tier, comped, report, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as SavedRentReport) ?? null
}

/** Ask FindStoop to connect a county's auditor/parcel records. One request per
 *  user per county (repeats are no-ops). Demand ranks which adapters we build. */
export async function requestParcelCoverage(args: {
  stateFips: string; countyFips: string
  stateName?: string | null; countyName?: string | null; zip?: string | null
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { error } = await supabase.from('parcel_coverage_requests').upsert({
    user_id: user.id,
    state_fips: args.stateFips,
    county_fips: args.countyFips,
    state_name: args.stateName ?? null,
    county_name: args.countyName ?? null,
    zip: args.zip ?? null,
  }, { onConflict: 'user_id,state_fips,county_fips', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/** Has the current user already requested coverage for this county? */
export async function hasRequestedParcelCoverage(stateFips: string, countyFips: string): Promise<boolean> {
  const { data } = await supabase.from('parcel_coverage_requests')
    .select('id').eq('state_fips', stateFips).eq('county_fips', countyFips).maybeSingle()
  return !!data
}

export async function deleteRentReport(id: string): Promise<void> {
  const { error } = await supabase.from('rent_reports').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
