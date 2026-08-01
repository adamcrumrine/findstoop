// Stoop is paused for landlord signup + property creation in these
// states until we complete the state-specific compliance work each one
// requires. Marketing pages stay public; only account/property creation
// is blocked.
//
//   • NY — landlord registration, broker laws, tenant-screening criteria
//          restrictions, and the SHIELD Act on data security
//   • CA — CCPA/CPRA, complex tenant-screening + just-cause eviction laws
//   • WA — strict tenant screening (RCW 59.18.257), debt-collection rules
//   • MA — CORI restrictions, security-deposit handling, anti-discrimination
//   • IL — Biometric Information Privacy Act (BIPA) — class-action exposure
//          on selfie ID matching specifically

export const BLOCKED_STATES = ['NY', 'CA', 'WA', 'MA', 'IL'] as const
export type BlockedState = typeof BLOCKED_STATES[number]

const BLOCKED_NAMES: Record<BlockedState, string> = {
  NY: 'New York',
  CA: 'California',
  WA: 'Washington',
  MA: 'Massachusetts',
  IL: 'Illinois',
}

/** Returns true if the (normalized 2-letter) state code is currently blocked. */
export function isBlockedState(stateCode: string | null | undefined): boolean {
  if (!stateCode) return false
  const normalized = stateCode.trim().toUpperCase()
  return (BLOCKED_STATES as readonly string[]).includes(normalized)
}

/** Human-readable name for a state code, or the code itself if not blocked. */
export function blockedStateName(stateCode: string): string {
  const normalized = stateCode.trim().toUpperCase() as BlockedState
  return BLOCKED_NAMES[normalized] ?? stateCode
}

/** Comma-joined list of blocked-state names, for display copy. */
export const BLOCKED_STATES_DISPLAY = BLOCKED_STATES.map((s) => BLOCKED_NAMES[s]).join(', ')

/**
 * Should the signup geo gate fire?
 *
 * ONLY for landlords. The pause exists because operating as a rental platform
 * in these states carries compliance work we haven't finished — screening
 * criteria, broker rules, biometric law. All of that attaches to the LANDLORD
 * and to where the PROPERTY sits, never to where a renter happens to be.
 *
 * A renter joining an Ohio lease creates no exposure in California, so
 * blocking them is both wrong and hostile: they can't pay their rent, and
 * they get told a state they may not even live in. IP geolocation is
 * approximate — carrier and VPN routing regularly place people hundreds of
 * miles away — so this must never gate anyone who isn't creating a landlord
 * account. Property creation is separately validated against the property's
 * real address, which is the check that actually matters.
 */
export function shouldGeoBlockSignup(
  role: 'manager' | 'tenant',
  geo: { detected: boolean; country: string | null; state: string | null },
): boolean {
  if (role !== 'manager') return false
  return geo.detected && geo.country === 'US' && isBlockedState(geo.state)
}
