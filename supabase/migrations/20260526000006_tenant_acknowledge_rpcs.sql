-- 20260526000006_tenant_acknowledge_rpcs.sql
--
-- Tenants can SELECT their own leases but have no UPDATE policy, so
-- direct writes to fair_housing_acknowledged_at / lead_pamphlet_
-- acknowledged_at were being silently rejected by RLS. Two narrow
-- SECURITY DEFINER RPCs let tenants stamp those columns (and only those)
-- without granting broad lease UPDATE rights.
--
-- Each RPC:
--   1. Confirms the caller is the tenant on the lease (l.tenant_id = auth.uid()).
--   2. Writes the timestamp if not already set (idempotent — first stamp wins).

CREATE OR REPLACE FUNCTION public.tenant_acknowledge_fair_housing(p_lease_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_existing TIMESTAMPTZ;
  v_now      TIMESTAMPTZ;
BEGIN
  SELECT fair_housing_acknowledged_at INTO v_existing
    FROM public.leases
   WHERE id = p_lease_id AND tenant_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lease not found for caller';
  END IF;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  v_now := NOW();
  UPDATE public.leases
     SET fair_housing_acknowledged_at = v_now
   WHERE id = p_lease_id AND tenant_id = auth.uid();
  RETURN v_now;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.tenant_acknowledge_lead_pamphlet(p_lease_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_existing TIMESTAMPTZ;
  v_now      TIMESTAMPTZ;
BEGIN
  SELECT lead_pamphlet_acknowledged_at INTO v_existing
    FROM public.leases
   WHERE id = p_lease_id AND tenant_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lease not found for caller';
  END IF;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;
  v_now := NOW();
  UPDATE public.leases
     SET lead_pamphlet_acknowledged_at = v_now
   WHERE id = p_lease_id AND tenant_id = auth.uid();
  RETURN v_now;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.tenant_acknowledge_fair_housing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_acknowledge_lead_pamphlet(UUID) TO authenticated;
