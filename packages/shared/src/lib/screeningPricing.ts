// Tenability™ pricing — what an applicant pays, and where they can be charged.
//
// MIRRORED in supabase/functions/_shared/screeningPricing.ts (Deno can't
// import the workspace package). screeningPricing.test.ts imports both and
// fails if they drift — the edge copy is what Stripe actually charges.
//
// Applicant-paid screening is an application fee in the eyes of state law,
// and several states cap or ban those. Rules as researched 2026-10-20 — not
// legal advice; revisit when adding a state's first property:
//   • Banned:          VT (no application fees); RI (2024 ban, except the
//                      actual cost of a credit/criminal check — Tenability
//                      runs neither)
//   • Actual cost only: CO, MN, OR — a $15 fee over ~$1 of real cost fails
//   • Capped at $25:    WI; MD (landlords with 5+ units — applied to all)
// NY / CA / WA / MA / IL are already closed to new landlords (stateGate.ts).

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
