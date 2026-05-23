-- 032_lease_sent_for_signature.sql
-- Tracks when the manager pushed a pending lease to the tenant for review +
-- e-sign. Used to show a "Sent X days ago" badge on lease cards and to
-- distinguish "drafted but not yet shared" from "in tenant's queue".

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS sent_for_signature_at TIMESTAMPTZ;
