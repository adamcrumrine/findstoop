-- 037_lease_prorate_rent.sql
-- Captures the manager's intent when a lease term differs from the standard
-- 12-month default. The Payments screen (and eventually the schedule
-- trigger) can use this to prorate the first/last rent. NULL = not asked yet
-- / not applicable.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS prorate_rent BOOLEAN;
