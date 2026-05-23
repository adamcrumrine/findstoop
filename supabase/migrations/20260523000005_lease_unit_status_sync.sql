-- 031_lease_unit_status_sync.sql
--
-- Adds a 'pending' unit_status (used while an approved application is
-- waiting on a signed lease), plus a trigger that keeps units.status in
-- sync with the leases on that unit:
--
--   • lease becomes 'active'                       → unit → 'occupied'
--   • last active lease ends (expired/terminated)  → unit → 'vacant'
--
-- Manual overrides on units.status still work — the trigger only fires
-- when a lease's status transitions in or out of 'active'.

-- ── 1. Extend the enum ───────────────────────────────────────────────────────
ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'pending';

-- ── 2. Trigger: keep unit.status in sync with active leases ──────────────────
CREATE OR REPLACE FUNCTION public.sync_unit_status_from_lease()
RETURNS TRIGGER AS $$
DECLARE
  other_active_count INTEGER;
BEGIN
  -- Activated: lease moved into 'active' (insert-as-active or update-to-active)
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE public.units SET status = 'occupied' WHERE id = NEW.unit_id;
  END IF;

  -- Deactivated: lease moved out of 'active'. If no other active lease
  -- on this unit remains, vacate it.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'active'
     AND NEW.status IS DISTINCT FROM 'active' THEN
    SELECT COUNT(*) INTO other_active_count
    FROM public.leases
    WHERE unit_id = NEW.unit_id
      AND status = 'active'
      AND id <> NEW.id;
    IF other_active_count = 0 THEN
      UPDATE public.units SET status = 'vacant' WHERE id = NEW.unit_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS lease_unit_status_sync_trigger ON leases;
CREATE TRIGGER lease_unit_status_sync_trigger
  AFTER INSERT OR UPDATE OF status ON leases
  FOR EACH ROW EXECUTE FUNCTION public.sync_unit_status_from_lease();
