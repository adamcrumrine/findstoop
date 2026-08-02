// Card-surcharge policy for MANAGER SUBSCRIPTION billing.
//
// For tenant rent, see lib/paymentFees.ts — that module prices every rail
// (bank transfer as well as card) because tenants choose between them and are
// shown both totals. This file stays card-only because the subscription
// surcharge is the only thing left that needs just the one number.
//
// FindStoop never absorbs card-network fees: a 3.5% surcharge is added to
// every CARD charge. Subscription payments by ACH currently carry no
// surcharge — the one remaining place the platform absorbs a Stripe fee.
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
