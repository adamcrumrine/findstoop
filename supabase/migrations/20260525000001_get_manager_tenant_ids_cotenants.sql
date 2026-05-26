-- 20260525000001_get_manager_tenant_ids_cotenants.sql
-- Bug: the get_manager_tenant_ids() helper (used by profiles RLS) only
-- returns leases.tenant_id — the legacy "primary" tenant on each lease.
-- Co-tenants / roommates stored in the lease_tenants junction table were
-- entirely invisible to the manager, so the Tenants screen and any other
-- profile fetch silently dropped them.
--
-- Fix: union both sources. SECURITY DEFINER preserved; STABLE preserved.

CREATE OR REPLACE FUNCTION public.get_manager_tenant_ids(manager_uuid uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT DISTINCT tid FROM (
    -- Primary tenants (legacy leases.tenant_id).
    SELECT l.tenant_id AS tid
      FROM public.leases l
      JOIN public.units u      ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
     WHERE p.manager_id = manager_uuid
    UNION ALL
    -- Co-tenants from the junction table (roommates, multi-tenant leases).
    SELECT lt.tenant_id AS tid
      FROM public.lease_tenants lt
      JOIN public.leases l      ON l.id = lt.lease_id
      JOIN public.units u       ON u.id = l.unit_id
      JOIN public.properties p  ON p.id = u.property_id
     WHERE p.manager_id = manager_uuid
  ) s
  WHERE tid IS NOT NULL
$$;
