// Helpers shared by the tenant hero cards for displaying when the bank pull
// (withdrawal) actually has to fire to land funds at the manager by the
// chosen pay-on date.
//
// ACH settles in 3 business days at Stripe's standard rails. Cards are
// instant. We back-date `withdrawalFor(payOn, 'us_bank_account')` by 3 US
// business days (skipping weekends) so the autopay cron pulls early enough
// for the funds to arrive on the chosen day.
//
// Caveat: federal holidays still slip through (we'd need a real calendar
// to dodge those). Three business days has enough cushion that a single
// holiday typically still lands by the next business day.

export type PaymentRailType = 'card' | 'us_bank_account' | null | undefined

function addBusinessDays(date: Date, days: number): Date {
  const out = new Date(date.getTime())
  let added = 0
  const step = days >= 0 ? 1 : -1
  const remaining = Math.abs(days)
  while (added < remaining) {
    out.setDate(out.getDate() + step)
    const day = out.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return out
}

// Returns the date we need to *initiate* the pull. For card, that's the
// same day. For ACH, it's three business days earlier.
export function withdrawalDate(payOnIso: string, rail: PaymentRailType): Date {
  const base = new Date(payOnIso + (payOnIso.length === 10 ? 'T00:00:00' : ''))
  if (rail === 'us_bank_account') return addBusinessDays(base, -3)
  return base
}

// True when the saved method is ACH (where pay-on and withdrawal-on differ).
export function isAch(rail: PaymentRailType): boolean {
  return rail === 'us_bank_account'
}
