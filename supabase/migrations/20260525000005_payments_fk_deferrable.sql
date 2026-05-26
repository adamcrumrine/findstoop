-- 20260525000005_payments_fk_deferrable.sql
--
-- Fix: insert of a new lease with status='active' fails because the
-- `lease_payment_schedule_trigger` is BEFORE INSERT and writes rows into
-- `payments` referencing NEW.id — but the lease itself isn't committed
-- to the table yet, so the FK `payments_lease_id_fkey` rejects the
-- payment INSERTs.
--
-- Affects: every flow that creates a lease with status='active' from the
-- start — create-lease-from-pdf, replace-lease-pdf, and any future-import
-- of an executed lease that lands as active immediately. Single-step
-- workflows that went through 'pending' first didn't hit it because by
-- the time status flipped to 'active' on UPDATE, the lease row existed.
--
-- Fix: make the FK DEFERRABLE INITIALLY DEFERRED. The constraint check
-- moves from "immediately on INSERT" to "at transaction COMMIT." Since
-- both the lease INSERT and the payment INSERT are in the same
-- transaction, both rows exist by COMMIT and the FK passes.
--
-- Trade-off: a stray payments row inserted with a bad lease_id will only
-- fail at commit instead of at insert. Acceptable — we never write
-- payments outside the trigger context.

ALTER TABLE payments
  DROP CONSTRAINT payments_lease_id_fkey;

ALTER TABLE payments
  ADD CONSTRAINT payments_lease_id_fkey
    FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;
