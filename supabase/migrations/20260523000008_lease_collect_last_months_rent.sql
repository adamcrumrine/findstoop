-- 034_lease_collect_last_months_rent.sql
-- When checked, the lease document and totals reflect a last-month-rent
-- prepayment due at move-in (in addition to the first month's rent).
-- Default false — security deposit alone is due at signing in the standard
-- case.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS collect_last_months_rent BOOLEAN NOT NULL DEFAULT false;
