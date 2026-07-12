-- 20260711000001_maintenance_progress_timestamp.sql
-- Tenant-facing maintenance timeline ("package tracking" for requests).
--
-- The timeline needs to show WHEN the landlord started working, but the table
-- only records created_at and resolved_at. Add in_progress_at, stamped by a
-- trigger on the status transition so every write path (manager UI, admin,
-- future automations) gets it for free and none of them need code changes.
-- Legacy rows keep NULL — the UI shows the step as done without a date rather
-- than inventing one.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION maintenance_requests_stamp_progress() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- First transition into in_progress wins; later status bounces don't reset it.
  IF NEW.status = 'in_progress' AND COALESCE(OLD.status, '') <> 'in_progress'
     AND NEW.in_progress_at IS NULL THEN
    NEW.in_progress_at := NOW();
  END IF;
  -- Belt and braces: resolving without the app setting resolved_at still stamps it.
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed')
     AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_stamp_progress ON maintenance_requests;
CREATE TRIGGER trg_maintenance_stamp_progress
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION maintenance_requests_stamp_progress();
