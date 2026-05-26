-- 20260525000002_unify_upcoming_into_active.sql
--
-- Two related changes:
--
-- 1. Collapse 'upcoming' status into 'active'.
--    An executed (signed) lease IS active — whether the term starts today or
--    next month. Earlier I split out 'upcoming' as a distinct status, but
--    the right model is: status='active' for any signed/in-effect lease.
--    "Upcoming" becomes a derived display label = active AND start_date > today.
--    Existing rows backfill to 'active'. The enum value 'upcoming' stays on
--    the type for backward compatibility but is no longer written by our code.
--
-- 2. New column tentative_move_out_date on leases.
--    For month-to-month tenancies, the manager can record a date the tenant
--    has indicated they plan to move out (verbal notice, soft notice, etc.).
--    The renewal / move-out reminder cron uses this date when it's set on
--    an M2M lease, instead of the original lease end_date (which is in the
--    past for any M2M tenancy and would never fire reminders).

-- ── 1. Backfill 'upcoming' → 'active' ─────────────────────────────────────
UPDATE leases
   SET status = 'active'
 WHERE status = 'upcoming';

-- ── 2. Tentative move-out date for M2M leases ─────────────────────────────
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS tentative_move_out_date DATE;

COMMENT ON COLUMN leases.tentative_move_out_date IS
  'For month-to-month leases: the date the tenant has indicated they plan to move out. The lifecycle cron uses this to fire move-out reminders for M2M tenancies (whose original end_date is in the past).';
