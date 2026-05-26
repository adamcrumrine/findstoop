-- 20260524000009_lease_auto_renew_m2m.sql
-- Lets a manager opt a lease into "automatically continue month-to-month
-- at the end of the term." When true, the daily lifecycle cron will:
--   1. On the day after end_date, set month_to_month=true (no status change
--      — the lease stays 'active' until the manager explicitly terminates).
--   2. Keep generating one rent payment per month going forward so the
--      tenant's payment portal always has the next due payment ready.
-- When false (default), the existing behavior applies — payments stop at
-- end_date and the lease sits at status='active' with end_date in the
-- past until the manager either renews, terminates, or marks expired.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS auto_renew_month_to_month BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leases.auto_renew_month_to_month IS
  'When TRUE the daily cron extends this lease to month-to-month at term end and continues generating rent payments. Manager-controlled toggle.';

-- Belt-and-suspenders backfill for the existing month_to_month flag.
-- The earlier migration already ran this, but new leases added in the
-- interim (or seeded outside the wizard) may have been missed. Idempotent.
UPDATE leases
   SET month_to_month = true
 WHERE status = 'active'
   AND end_date IS NOT NULL
   AND end_date < CURRENT_DATE
   AND month_to_month = false;
