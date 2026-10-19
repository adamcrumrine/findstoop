// Lease renewal — the pure half of the Renew flow (RenewLeaseModal).
//
// A renewal is a new lease row on the same unit for (some of) the same
// tenants, starting the day after the current term. It carries the current
// lease's terms forward — split, shares, pet fee, flags, deposit — so the
// manager only decides what actually changes: dates, rent, who's staying.

import type { LeaseWithTenant } from '@findstoop/shared/hooks/useLeases'

export const RENEWAL_TERM_OPTIONS = [6, 12, 18, 24] as const

/** Every tenant id on a lease — the legacy primary pointer plus the junction rows. */
export const leaseTenantIds = (l: LeaseWithTenant): string[] =>
  [l.tenant_id, ...(l.all_tenants ?? []).map((t) => t.id)]

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export function addDaysIso(iso: string, days: number): string {
  const dt = parseIso(iso)
  dt.setDate(dt.getDate() + days)
  return toIso(dt)
}

/** First day a lease can be renewed: day 2 of its term. */
export const renewableOn = (startIso: string): string => addDaysIso(startIso, 1)

/** start + N months − 1 day: 2027-07-24 + 12 → 2028-07-23. */
export function termEnd(startIso: string, months: number): string {
  const dt = parseIso(startIso)
  dt.setMonth(dt.getMonth() + months)
  dt.setDate(dt.getDate() - 1)
  return toIso(dt)
}

/**
 * Default renewal term: picks up the day after the current term ends, 12
 * months long. A lease already past its end (month-to-month) can't renew
 * into the past, so it starts on the 1st of next month instead.
 */
export function renewalDates(currentEnd: string, todayIso: string): { start: string; end: string } {
  let start = addDaysIso(currentEnd, 1)
  if (start <= todayIso) {
    const t = parseIso(todayIso)
    start = toIso(new Date(t.getFullYear(), t.getMonth() + 1, 1))
  }
  return { start, end: termEnd(start, 12) }
}

const cents = (n: number) => Math.round(n * 100)

/**
 * Rent shares mirror lease_tenant_charges(): a tenant with a fixed share pays
 * it; everyone without one splits whatever is left evenly. Returns the
 * leftover and whether the fixed shares overshoot the rent.
 */
export function shareSummary(shares: Array<number | null>, rent: number) {
  const fixed = shares.filter((s): s is number => s != null)
  const assigned = fixed.reduce((sum, s) => sum + cents(s), 0) / 100
  const remainder = Math.round((rent - assigned) * 100) / 100
  const openCount = shares.length - fixed.length
  return {
    assigned,
    remainder,
    openCount,
    over: remainder < 0,
    // Every share fixed and they don't add up — the gap would go unbilled.
    gap: openCount === 0 && Math.abs(remainder) >= 0.01,
  }
}

/**
 * Rent changed: scale the fixed shares by the same ratio so the increase is
 * spread rather than landing entirely on whoever covers the remainder. When
 * every share is fixed, rounding drift goes to the last one so the total
 * lands exactly on the new rent.
 */
export function scaleShares(shares: Array<number | null>, oldRent: number, newRent: number): Array<number | null> {
  if (oldRent <= 0) return shares
  const ratio = newRent / oldRent
  const scaled = shares.map((s) => (s == null ? null : Math.round(s * ratio * 100) / 100))
  if (scaled.every((s) => s != null)) {
    const total = scaled.reduce<number>((sum, s) => sum + cents(s as number), 0)
    const drift = cents(newRent) - total
    const last = scaled.length - 1
    if (last >= 0 && drift !== 0) scaled[last] = (cents(scaled[last] as number) + drift) / 100
  }
  return scaled
}

export interface RenewalTenantRow {
  tenant_id: string
  is_primary: boolean
  sort_order: number | null
  rent_share: number | null
  landlord_absorbs_fees: boolean
}

export interface RenewalInput {
  start: string
  end: string
  rent: number
  petFee: number | null
  /** Staying tenants, in signing order, with their (possibly edited) shares. */
  tenants: RenewalTenantRow[]
}

/**
 * The new lease row. Terms carry forward from the current lease; signing
 * state, schedules, insurance proof and one-time setup (last month's rent,
 * proration) do not — each lease earns those itself.
 */
export function buildRenewalLease(current: Record<string, unknown>, input: RenewalInput): Record<string, unknown> {
  const stayingIds = new Set(input.tenants.map((t) => t.tenant_id))
  const petPayer = current.pet_fee_payer_id as string | null | undefined
  return {
    unit_id: current.unit_id,
    tenant_id: input.tenants[0].tenant_id,
    start_date: input.start,
    end_date: input.end,
    rent_amount: input.rent,
    security_deposit: current.security_deposit ?? null,
    pet_deposit: current.pet_deposit ?? null,
    utility_notes: current.utility_notes ?? null,
    payment_due_day: current.payment_due_day ?? 1,
    status: 'pending',
    signed_at: null,
    document_url: null,
    insurance_required: current.insurance_required ?? true,
    auto_renew_month_to_month: current.auto_renew_month_to_month ?? false,
    property_built_before_1978: current.property_built_before_1978 ?? null,
    lead_known: current.lead_known ?? null,
    lead_disclosure_details: current.lead_disclosure_details ?? null,
    is_student: current.is_student ?? false,
    rent_split_mode: current.rent_split_mode ?? 'even',
    monthly_pet_fee: input.petFee,
    pet_fee_payer_id: petPayer && stayingIds.has(petPayer) ? petPayer : null,
  }
}
