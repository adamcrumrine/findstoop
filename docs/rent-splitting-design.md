# Roommate rent splitting — design (not yet built)

Deliberately shipped as a design rather than code: splitting touches every
money path (payment generation, autopay, Stripe webhook, late fees, receipts,
manager ledger), and a bug here is real money. The foundations below make it
a contained project when scheduled — most of the hard part already exists.

## What already exists (verified in the codebase)

- `payments` rows are **per-tenant** (`tenant_id` FK, amount, status, RLS
  scoping tenants to their own rows) — the ledger does NOT assume one payer
  per lease. This is the single biggest enabler.
- `lease_tenants` models co-tenants on a lease (used by invites, ask-lease
  access checks, LeasePdf).
- Autopay is per-tenant (`tenant_scheduling_autopay` migration), and
  `create-payment-intent` / `stripe-webhook` already key off individual
  payment rows.
- Student-housing support means multi-tenant leases are a first-class case.

## Design

### 1. Share configuration
New table `lease_rent_shares`:
```
lease_id uuid FK, tenant_id uuid FK, share_amount numeric(10,2),
PRIMARY KEY (lease_id, tenant_id)
CHECK share_amount > 0
```
- Managed by the landlord on the lease detail page ("Split rent"): default
  equal split with rounding remainder on the first tenant; editable amounts;
  a DB trigger (or app-level check + a nightly integrity check) asserts
  `SUM(share_amount) = leases.rent_amount` whenever shares exist.
- **No rows in this table = current single-payer behavior, unchanged.** Every
  code path treats splitting as opt-in; this is the safety property that
  makes the rollout low-risk.

### 2. Payment generation
Wherever monthly payment rows are created (cron / lease activation), branch:
shares exist → one `payments` row per share (tenant_id, share_amount);
otherwise → today's single row. Each roommate then pays/autopays their own
row through the existing, untouched intent + webhook flow.

### 3. Late fees
Apply per unpaid share row (a roommate who paid is never charged for another's
lateness), but respect the state grace rules already modeled in
`complianceRules.ts`. Landlord setting: "late fee applies per household or
per share" (default per share; some leases hold tenants jointly liable —
surface the lease's joint-and-several language in the UI copy, don't decide
it for them).

### 4. Visibility rules
- Tenant: sees their own share (existing RLS already does this), plus an
  aggregate "household status: 2 of 3 shares paid" via a SECURITY DEFINER
  view exposing only counts/paid-or-not — never other roommates' amounts or
  payment methods.
- Manager: rent-roll and payments pages group share rows by lease with a
  household subtotal (UI change only; the data is already per-tenant).
- Reminder emails (cron): already per-tenant — they inherit splitting for
  free once rows are per-share.

### 5. Edge cases to test before shipping
- Roommate added/removed mid-lease → re-split takes effect NEXT period;
  never mutate an open period's rows.
- Rent amount changed (renewal) → regenerate future shares, require the
  landlord to reconfirm the split.
- Overpayment/partial Stripe events on a share row.
- Deposit is NOT split in v1 (single deposit ledger; splitting it multiplies
  the deposit-return wizard's complexity for little demand).

## Phasing

1. **v1 (1–2 days):** table + lease-detail split UI + per-share payment
   generation + tenant "household status" — autopay and late fees already
   work per-row and need only testing, not code.
2. **v2:** household-status nudges ("your roommate hasn't paid"), per-share
   receipts polish, rent-roll grouping.
3. **Explicitly out:** tenants re-splitting among themselves, Venmo-style
   P2P between roommates, split deposits.

## Why it waited

Every other feature in this batch was additive UI/AI on top of stable
tables. This one modifies how money records are *created*. It deserves a
focused session with staging Stripe keys and webhook replay testing, not a
parallel-agent pass.
