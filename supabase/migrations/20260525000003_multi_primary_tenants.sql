-- 20260525000003_multi_primary_tenants.sql
-- Allow multiple primary tenants per lease.
--
-- Old model: at most one lease_tenants row per lease had is_primary=true,
-- enforced by a trigger that demoted others. Reflects single-signer leases.
--
-- New model: any combination of is_primary flags is allowed — all roommates
-- can be primary, none can be primary, or a subset. The manager decides
-- based on who actually signed the lease. The legacy leases.tenant_id
-- column still holds ONE tenant id (for backward compat with RLS / older
-- queries); we keep it in sync with the first primary (or first tenant if
-- nobody is marked primary).
--
-- This trigger also runs on DELETE so removing a primary updates the
-- legacy tenant_id correctly.

CREATE OR REPLACE FUNCTION public.sync_primary_tenant_to_lease()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_id UUID;
  the_lease_id UUID;
BEGIN
  the_lease_id := COALESCE(NEW.lease_id, OLD.lease_id);

  -- First primary by sort_order, then by added_at. Fallback to first tenant
  -- if no primary is set.
  SELECT lt.tenant_id INTO next_id
    FROM public.lease_tenants lt
   WHERE lt.lease_id = the_lease_id
     AND lt.is_primary = TRUE
   ORDER BY lt.sort_order ASC NULLS LAST, lt.added_at ASC
   LIMIT 1;
  IF next_id IS NULL THEN
    SELECT lt.tenant_id INTO next_id
      FROM public.lease_tenants lt
     WHERE lt.lease_id = the_lease_id
     ORDER BY lt.sort_order ASC NULLS LAST, lt.added_at ASC
     LIMIT 1;
  END IF;

  IF next_id IS NOT NULL THEN
    UPDATE public.leases SET tenant_id = next_id
     WHERE id = the_lease_id
       AND tenant_id IS DISTINCT FROM next_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Re-attach to also fire on DELETE so removing a primary refreshes the
-- legacy tenant_id pointer.
DROP TRIGGER IF EXISTS lease_tenants_sync_primary ON lease_tenants;
CREATE TRIGGER lease_tenants_sync_primary
  AFTER INSERT OR UPDATE OR DELETE ON lease_tenants
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_tenant_to_lease();
