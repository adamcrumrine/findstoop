-- 20260524000007_lease_month_to_month.sql
-- Two related lease-lifecycle additions used by portfolio import (and the
-- normal lease creation flow):
--
-- 1. month_to_month boolean — TRUE when a tenancy has rolled past its
--    fixed-term end date and continues by statute. The lease row still
--    keeps the ORIGINAL end_date so we know when M2M began; the flag
--    tells the UI to render "Month-to-month since <date>" instead of
--    "Expired <date>". status is still 'active' for these tenancies.
--
-- 2. New 'upcoming' value on the lease_status enum — for leases whose
--    start_date is in the future. Distinct from 'pending' (which means
--    "needs a signed agreement") because an upcoming lease has been
--    signed; the tenant just hasn't moved in yet.
--
-- Used by:
--   • Portfolio import — see import-portfolio function for the state
--     classification rules.
--   • Manager dashboard / lease detail — pill copy, sorting, billing.

-- ── 1. month_to_month column ────────────────────────────────────────────
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS month_to_month BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leases.month_to_month IS
  'TRUE if this tenancy is continuing past its end_date on a month-to-month basis. status should still be ''active''.';

UPDATE leases
   SET month_to_month = true
 WHERE status = 'active'
   AND end_date IS NOT NULL
   AND end_date < CURRENT_DATE
   AND month_to_month = false;

-- ── 2. 'upcoming' status enum value ─────────────────────────────────────
-- Postgres rule: an enum value added via ALTER TYPE cannot be used in the
-- same transaction. Backfill of existing rows to 'upcoming' happens in the
-- companion migration 20260524000008_lease_status_upcoming_backfill.sql.
ALTER TYPE lease_status ADD VALUE IF NOT EXISTS 'upcoming';
