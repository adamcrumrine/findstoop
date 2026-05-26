-- 20260524000008_lease_status_upcoming_backfill.sql
-- Companion to 20260524000007 (which added the 'upcoming' enum value).
-- Postgres won't allow a new enum value to be used in the same transaction
-- it was added in, so the backfill ships as its own migration that runs
-- AFTER 7 commits.
--
-- Rule: any 'pending' lease whose start_date is in the future AND already
-- has an executed-lease document on file is really 'upcoming'. (Pending
-- without a doc stays pending — it still needs an agreement.)

UPDATE leases l
   SET status = 'upcoming'
 WHERE l.status = 'pending'
   AND l.start_date > CURRENT_DATE
   AND EXISTS (SELECT 1 FROM documents d WHERE d.lease_id = l.id AND d.type = 'lease');
