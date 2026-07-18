// Single source of truth for the card-surcharge policy.
//
// FindStoop never absorbs card-network fees: a 3.5% surcharge is added to
// every CARD charge — tenant rent, manager subscriptions, and any other
// card-rail payment. ACH (us_bank_account) carries no surcharge.
//
// The Supabase edge functions (Deno) can't import this workspace package, so
// they each declare `CARD_SURCHARGE_PCT = 3.5` locally — if the rate ever
// changes, update those too: create-payment-intent, cron-lifecycle-daily,
// stripe-subscribe, stripe-webhook.

export const CARD_SURCHARGE_PCT = 3.5

/** Surcharge in cents for a base amount in cents. Card only — pass ACH through untouched. */
export function cardSurchargeCents(baseCents: number): number {
  return Math.round(baseCents * (CARD_SURCHARGE_PCT / 100))
}

/** Surcharge in dollars for a base amount in dollars, rounded to the cent.
 *  Matches the server formula: Math.round(dollars * 3.5) cents. */
export function cardSurcharge(baseDollars: number): number {
  return Math.round(baseDollars * CARD_SURCHARGE_PCT) / 100
}

/** Total (base + surcharge) in cents for a card charge. */
export function totalWithCardSurchargeCents(baseCents: number): number {
  return baseCents + cardSurchargeCents(baseCents)
}
