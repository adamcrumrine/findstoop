-- One-time payment for the Basic ($4.99) Rental Analysis Report.
-- Each successful PaymentIntent mints exactly one report — the UNIQUE constraint
-- enforces single-redemption at the DB layer (the edge function also checks).

ALTER TABLE rent_reports
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT UNIQUE;
