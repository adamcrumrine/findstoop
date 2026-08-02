// What each payment rail costs, and who pays it.
//
// Policy: Stoop never absorbs a processing fee, and neither does the landlord.
// Every Stripe cost is passed to the payer — tenants on rent, landlords on
// their subscription. The subscription is Stoop's margin; processing is a
// pass-through.
//
// That policy only works if the payer can SEE what each option costs before
// they choose, so this module is built to answer the tenant's question ("what
// will this actually cost me?") rather than the accountant's. `railOptions`
// returns every option priced out, cheapest first.
//
// The edge functions (Deno) can't import this workspace package, so
// create-payment-intent and cron-lifecycle-daily re-declare the rates locally.
// Change one, change all three — the tests in paymentFees.test.ts pin the
// numbers so a drift shows up as a failure rather than a mispriced charge.

/** Payment rails a tenant can use. Matches Stripe's payment_method_types. */
export type Rail = 'us_bank_account' | 'card'

// ---------------------------------------------------------------------------
// What Stripe charges us (US, standard pricing)
// ---------------------------------------------------------------------------

/** ACH debit: 0.8%, capped. The cap is per TRANSACTION, which is why
 *  combining charges matters so much on this rail. */
export const ACH_PCT = 0.8
export const ACH_CAP_CENTS = 500

/** Card: 2.9% + 30¢. No cap — the percentage runs all the way up. */
export const CARD_PCT = 2.9
export const CARD_FIXED_CENTS = 30

// ---------------------------------------------------------------------------
// What we charge the payer
// ---------------------------------------------------------------------------

/**
 * Card surcharge, held at Visa's 3% ceiling — the lowest cap any network sets,
 * so one rate stays compliant everywhere rather than varying by card brand.
 *
 * KNOWN SHORTFALL: 3% clears Stripe's 2.9% but not the fixed 30¢, so charges
 * under $300 collect less than they cost. Break-even is exactly $300
 * (0.001x = 30¢). A $20 pet fee costs 88¢ to process and collects 60¢ — the
 * platform absorbs 28¢. This is deliberate: raising the rate breaks the
 * network cap, and adding a fixed component to a surcharge is the kind of
 * thing that draws scrutiny for very little money. Rent is far above the line;
 * only incidental charges sit below it.
 *
 * STILL UNSOLVED: card networks prohibit surcharging DEBIT cards anywhere, and
 * Stripe doesn't reveal the funding type until the charge is under way. Any
 * debit payment here is surcharged in breach of that rule. Fixing it properly
 * means confirming the PaymentIntent, reading `card.funding`, and refunding the
 * surcharge when it comes back 'debit'.
 */
export const CARD_SURCHARGE_PCT = 3.0

/** Below this, a 3% surcharge collects less than Stripe's 2.9% + 30¢ costs. */
export const CARD_SURCHARGE_BREAKEVEN_CENTS = 30000

/**
 * ACH surcharge — a straight pass-through of Stripe's rate and cap, no spread.
 * ACH is the rail we want tenants on: it's an order of magnitude cheaper for
 * them, so it stays priced at cost.
 */
export const ACH_SURCHARGE_PCT = 0.8
export const ACH_SURCHARGE_CAP_CENTS = 500

/** What Stripe deducts for a charge of `amountCents` on `rail`. */
export function stripeCostCents(rail: Rail, amountCents: number): number {
  if (amountCents <= 0) return 0
  return rail === 'us_bank_account'
    ? Math.min(Math.round(amountCents * (ACH_PCT / 100)), ACH_CAP_CENTS)
    : Math.round(amountCents * (CARD_PCT / 100)) + CARD_FIXED_CENTS
}

/** What the payer is charged on top of the amount owed. */
export function payerFeeCents(rail: Rail, amountCents: number): number {
  if (amountCents <= 0) return 0
  return rail === 'us_bank_account'
    ? Math.min(Math.round(amountCents * (ACH_SURCHARGE_PCT / 100)), ACH_SURCHARGE_CAP_CENTS)
    : Math.round(amountCents * (CARD_SURCHARGE_PCT / 100))
}

export interface RailOption {
  rail: Rail
  /** Tenant-facing name. Never "ACH" — that means nothing to most people. */
  label: string
  /** Processing fee added to what they owe. */
  feeCents: number
  /** Amount owed + fee. What actually leaves their account. */
  totalCents: number
  /** How long until the landlord sees it — tenants ask. */
  settlement: string
  /** True on the cheapest option. Exactly one is set. */
  recommended: boolean
  /** Why it costs what it costs, in one line. */
  note: string
}

/**
 * Every way to pay `amountCents`, priced out, cheapest first.
 *
 * Both rails are always returned even when one is dramatically worse — a
 * tenant with no bank account still needs to see the card option, and hiding
 * the expensive choice is how you get a surprise on a statement.
 */
export function railOptions(amountCents: number): RailOption[] {
  const build = (rail: Rail, label: string, settlement: string, note: string): RailOption => {
    const feeCents = payerFeeCents(rail, amountCents)
    return { rail, label, feeCents, totalCents: amountCents + feeCents, settlement, recommended: false, note }
  }
  const options = [
    build(
      'us_bank_account',
      'Bank transfer',
      'Clears in 3–5 business days',
      `${ACH_SURCHARGE_PCT}% of the amount, never more than $${(ACH_SURCHARGE_CAP_CENTS / 100).toFixed(2)}`,
    ),
    build('card', 'Debit or credit card', 'Posts immediately', `${CARD_SURCHARGE_PCT}% of the amount, no cap`),
  ]
  options.sort((a, b) => a.feeCents - b.feeCents || a.totalCents - b.totalCents)
  options[0].recommended = true
  return options
}

/** The cheapest rail for this amount. */
export function cheapestRail(amountCents: number): RailOption {
  return railOptions(amountCents)[0]
}

export interface CombineSavings {
  rail: Rail
  /** Total fees if each charge is paid on its own. */
  separateCents: number
  /** Fee if they're paid as a single transaction. */
  combinedCents: number
  /** separate − combined. Zero or more, never negative. */
  savingsCents: number
}

/**
 * What paying several charges together saves versus paying them one at a time.
 *
 * This is worth surfacing because the two rails behave completely differently.
 * ACH's cap is per transaction, so four $525 payments cost 4 × $4.20 = $16.80
 * while one $2,100 payment costs $5.00 — the cap does the work. Cards only
 * save the repeated 30¢, so combining four charges saves 90¢ and it would be
 * dishonest to present that as the same kind of win.
 */
export function combineSavings(rail: Rail, amountsCents: number[]): CombineSavings {
  const amounts = amountsCents.filter((a) => a > 0)
  const separateCents = amounts.reduce((sum, a) => sum + payerFeeCents(rail, a), 0)
  const combinedCents = payerFeeCents(rail, amounts.reduce((s, a) => s + a, 0))
  return {
    rail,
    separateCents,
    combinedCents,
    // Clamp: rounding on tiny amounts could in principle make combining cost a
    // cent more, and we should never advertise a negative saving.
    savingsCents: Math.max(0, separateCents - combinedCents),
  }
}

/** Best case across rails — used for the "pay everything at once" nudge. */
export function bestCombineSavings(amountsCents: number[]): CombineSavings {
  const all: Rail[] = ['us_bank_account', 'card']
  return all
    .map((r) => combineSavings(r, amountsCents))
    .sort((a, b) => b.savingsCents - a.savingsCents)[0]
}
