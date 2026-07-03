# Payday-aligned rent — design (not yet built)

Companion to [rent-splitting-design.md](rent-splitting-design.md); same rule
applies: this changes how money records are *created*, so it ships as a
design and gets a focused build session with staging Stripe keys and webhook
replay — not a parallel-agent pass. The two features share the per-tenant
payment-row foundation and should be built together.

## The idea

Late rent is usually a cash-flow-timing problem, not a willingness problem.
Most hourly and many salaried tenants are paid bi-weekly; one $1,400 pull on
the 1st collides with whichever paycheck cycle the tenant is on. Let the
tenant opt into two half-payments aligned with their paychecks. The landlord
still sees one monthly ledger line and — in v1 — still gets all the money by
the contractual due date.

## What already exists (verified in the codebase)

- `generate_payment_schedule_for_lease()` (20260525000006) already fans one
  month's rent into multiple `payments` rows (per primary tenant), penny-exact
  with the rounding remainder on the first row. Fanning by date instead of
  (or in addition to) tenant is the same shape.
- The rent uniqueness index is `(lease_id, tenant_id, due_date) WHERE
  type='rent'` — two half-rows in one month have distinct due dates, so no
  schema fight.
- Autopay is per-tenant and keys off individual payment rows
  (`tenant_scheduling_autopay`); `create-payment-intent` / `stripe-webhook`
  operate per row. Two rows = two pulls, zero new Stripe logic.
- The card surcharge is a percentage (3.5%), so splitting a charge never
  changes the total surcharge; ACH halves stay free.
- The manager payments UI already groups rows by application month — the
  "one monthly line" requirement is a grouping tweak, not a data change.
- Payment-failure alerts are per payment row and inherit splitting for free.

## Design

### 1. Opt-in configuration
New table `tenant_payment_plans`:
```
lease_id uuid FK, tenant_id uuid FK, plan text CHECK (plan = 'biweekly_split'),
anchor_payday date,           -- any recent payday; cadence derives from it
PRIMARY KEY (lease_id, tenant_id)
```
- Tenant opts in from the payment-methods/autopay settings surface; the
  landlord is notified but v1 needs no approval because the due date never
  moves (see §2). **No row = current single-pull behavior, unchanged** —
  the same opt-in safety property as rent splitting.

### 2. v1 timing rule: both halves land ON OR BEFORE the due date
The two pulls are scheduled on the tenant's last two paydays *at or before*
the contractual due date (fallback: due date −14 and due date). Rent is
never legally re-dated; the landlord's cash arrives no later than today.
This is what makes v1 landlord-consent-free and lease-amendment-free — it's
a smoothing plan, not a new due date.
- v2 (explicitly separate): "second half mid-month" with landlord opt-in +
  generated lease addendum via the existing addenda machinery, since that
  DOES change when rent is contractually late.

### 3. Payment generation
In the schedule trigger (and `regenerate_rent_schedule`), after the
per-tenant share fan-out: if the tenant has a `biweekly_split` plan, emit
two rows (`share/2` penny-exact, remainder on the first) with the two
computed due dates and a shared `period_month` (new date column on
`payments`, backfilled from due_date for existing rows) so ledger grouping
and late-fee logic have an explicit month key. Splitting composes with
roommate shares: shares first, then each tenant's share optionally halves.

### 4. Late fees
Assessed per `period_month` per tenant: if the tenant's period total is
unpaid after the existing grace rules (`complianceRules.ts`), the fee
attaches once — a paid first half never shields (or double-exposes) the
second. No per-row fees.

### 5. Visibility
- Tenant: the two halves shown as one rent obligation with a progress state
  ("$700 paid · $700 on Jun 28"); each half gets its own receipt.
- Manager: month row shows the period total with a quiet "2 scheduled
  pulls" annotation — the ledger line count does not change.

### 6. Edge cases to test before shipping
- Opt-in/out mid-period → takes effect NEXT period; never mutate open rows
  (same rule as splitting).
- First half succeeds, second fails → existing payment-failure alert fires
  on the second row only; dunning references the half amount.
- Proration months and the collect-last-month's-rent flow stay single-pull
  in v1 (odd amounts, one-off timing — not worth the complexity).
- Autopay pause/resume between the two pulls.
- Renewal rent change → regenerate future halves, keep the anchor payday.

## Why it waited

Same reason as rent splitting: every other feature in this batch reads
money records; these two write them. Build both in one focused session —
shared trigger surgery, shared webhook replay testing, one migration train.
