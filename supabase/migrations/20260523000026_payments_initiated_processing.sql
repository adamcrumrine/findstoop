-- ACH timing — Stripe ACH (us_bank_account) takes 3-5 business days to settle.
-- We need:
--   * payments.initiated_at — when the off-session charge fires (cron) or
--     the tenant clicks Pay (instant for cards). paid_at stays as the final
--     settlement timestamp.
--   * payment_status 'processing' — the intermediate state between
--     initiated_at and paid_at for ACH.
--
-- Card payments skip 'processing' and go straight from 'pending' to
-- 'completed'; ACH goes pending → processing → completed (or failed).

ALTER TABLE payments ADD COLUMN IF NOT EXISTS initiated_at TIMESTAMPTZ;
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'processing';
