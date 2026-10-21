// Tenability™ pricing — what an applicant pays, and where they can be charged.
//
// MIRROR of packages/shared/src/lib/screeningPricing.ts — keep the two
// identical (apps/web/src/lib/screeningPricing.test.ts imports both and fails
// on drift). This copy is the one Stripe actually charges. See the shared
// file for the state-law notes behind each rule.

/** Tenability™ — verified income + ID + 0–100 score. Dollars. */
export const TENABILITY_PRICE = 15

/** Tenability™ Pro — adds selfie match + applicant-provided credit. Dollars. */
export const TENABILITY_PRO_PRICE = 35

export type ScreeningAvailability =
  | { available: true; standard: number; pro: number; capped: boolean }
  | { available: false; reason: string }

const UNAVAILABLE: Record<string, string> = {
  VT: 'Vermont doesn’t allow rental application fees.',
  RI: 'Rhode Island doesn’t allow rental application fees for this kind of screening.',
  CO: 'Colorado limits application fees to the landlord’s actual screening cost.',
  MN: 'Minnesota limits application fees to the landlord’s actual screening cost.',
  OR: 'Oregon limits application fees to the landlord’s actual screening cost.',
}

const CAP_DOLLARS: Record<string, number> = {
  WI: 25,
  MD: 25,
}

/** What an applicant for a property in `state` can be charged. */
export function screeningPricesFor(state: string | null | undefined): ScreeningAvailability {
  const code = (state ?? '').trim().toUpperCase()
  const reason = UNAVAILABLE[code]
  if (reason) return { available: false, reason }
  const cap = CAP_DOLLARS[code]
  if (cap == null) return { available: true, standard: TENABILITY_PRICE, pro: TENABILITY_PRO_PRICE, capped: false }
  return {
    available: true,
    standard: Math.min(TENABILITY_PRICE, cap),
    pro: Math.min(TENABILITY_PRO_PRICE, cap),
    capped: TENABILITY_PRO_PRICE > cap || TENABILITY_PRICE > cap,
  }
}
