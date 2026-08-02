// Subscription pricing. One place, because it was two.
//
// PER_UNIT_MONTHLY and PER_UNIT_ANNUAL were declared separately in
// SubscribeModal and the Pricing page, so a rate change had to be made twice
// and any miss would show a landlord one price on the marketing page and
// charge them another at checkout.
//
// These are display figures. The amount actually charged comes from the Stripe
// Price objects referenced by STRIPE_PRICE_PREMIUM_MONTHLY / _YEARLY — Stripe
// Prices are immutable, so changing a rate means creating new Price objects
// and repointing those env vars. If these constants and those Prices disagree,
// Stripe wins and the landlord sees a total that doesn't match the page.

/** Dollars per active unit per month. */
export const PER_UNIT_MONTHLY = 5

/**
 * Dollars per active unit per year, prepaid and non-refundable.
 * Held at a ~16.7% discount to twelve monthly payments — two months free.
 */
export const PER_UNIT_ANNUAL = 50

/** Effective monthly cost of the annual plan, for "that's $x.xx/mo" copy. */
export const ANNUAL_EFFECTIVE_MONTHLY = PER_UNIT_ANNUAL / 12

/** Discount the annual plan represents, as a percentage, rounded to 0.1. */
export const ANNUAL_DISCOUNT_PCT =
  Math.round((1 - PER_UNIT_ANNUAL / (PER_UNIT_MONTHLY * 12)) * 1000) / 10
