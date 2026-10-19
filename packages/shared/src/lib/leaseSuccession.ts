// Lease succession — how a lease relates to the leases that follow it on the
// same unit.
//
// A signed lease is status 'active' whether its term has started or not (see
// migration 20260525000002), so a renewal signed in October sits beside the
// lease it replaces for months. Two consequences live here:
//   • "Current lease" must mean the one in effect today, not the newest row —
//     otherwise a tenant's portal jumps to next year's lease the day they sign.
//   • A lease with a signed successor has nothing left to renew, and when the
//     successor keeps any of the same tenants the deposit rolls over rather
//     than coming due — renewal nudges and deposit-return prompts skip it.

interface SuccessionLease {
  id: string
  unit_id: string
  status: string
  start_date: string
}

/** The earliest signed lease on the same unit that starts after this one. */
export function signedSuccessor<T extends SuccessionLease>(lease: SuccessionLease, leases: T[]): T | null {
  return leases
    .filter((l) => l.id !== lease.id && l.unit_id === lease.unit_id
      && l.status === 'active' && l.start_date > lease.start_date)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0] ?? null
}

/**
 * Renewed = a signed successor shares at least one tenant. A successor with
 * an entirely new household is a re-lease: the outgoing deposit is still due.
 */
export function isRenewed<T extends SuccessionLease>(
  lease: T,
  leases: T[],
  tenantIdsOf: (l: T) => string[],
): boolean {
  return leases.some((l) => l.id !== lease.id && l.unit_id === lease.unit_id
    && l.status === 'active' && l.start_date > lease.start_date
    && sharesTenant(lease, l, tenantIdsOf))
}

const sharesTenant = <T>(a: T, b: T, tenantIdsOf: (l: T) => string[]): boolean => {
  const mine = new Set(tenantIdsOf(a))
  return tenantIdsOf(b).some((id) => mine.has(id))
}

/** An unsigned (pending) renewal drafted for this lease, if any. */
export function draftRenewal<T extends SuccessionLease>(
  lease: T,
  leases: T[],
  tenantIdsOf: (l: T) => string[],
): T | null {
  return leases.find((l) => l.id !== lease.id && l.unit_id === lease.unit_id
    && l.status === 'pending' && l.start_date > lease.start_date
    && sharesTenant(lease, l, tenantIdsOf)) ?? null
}

/** For a renewal (pending or signed): the earlier lease it renews, if any. */
export function renewedLease<T extends SuccessionLease>(
  lease: T,
  leases: T[],
  tenantIdsOf: (l: T) => string[],
): T | null {
  return leases
    .filter((l) => l.id !== lease.id && l.unit_id === lease.unit_id
      && l.start_date < lease.start_date && l.status !== 'pending'
      && sharesTenant(lease, l, tenantIdsOf))
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] ?? null
}

/**
 * Of a tenant's active leases, the one in effect today (latest start on or
 * before today); failing that, the soonest-starting signed lease.
 */
export function pickCurrentLease<T extends { start_date: string }>(active: T[], todayIso: string): T | null {
  const started = active.filter((l) => l.start_date <= todayIso)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  if (started.length > 0) return started[0]
  return active.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0] ?? null
}
