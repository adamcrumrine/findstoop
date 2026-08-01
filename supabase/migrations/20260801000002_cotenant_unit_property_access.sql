-- 20260801000002_cotenant_unit_property_access.sql
--
-- Follow-up to 20260801000001. The units/properties tenant policies resolve
-- through two helper functions that had the same legacy-pointer bug, plus a
-- second defect:
--
--   get_tenant_unit_ids     — matched leases.tenant_id AND required
--                             status = 'active'
--   get_tenant_property_ids — matched leases.tenant_id
--
-- Two consequences:
--   1. Co-tenants (everyone but the one legacy pointer per lease) resolved no
--      units/properties, so the portal rendered a lease with no property name
--      or unit number.
--   2. The status='active' filter meant even the pointed-at tenant lost their
--      unit while the lease sat in 'upcoming' (signed, start date not yet
--      reached) — exactly the pre-move-in window when they most need the
--      portal. 'pending' (sent for signature) has the same problem.
--
-- Fix both: resolve membership through lease_tenants OR the legacy pointer,
-- and accept the same status set the rest of the tenant surface uses
-- ('active', 'upcoming', 'pending') per 20260526000002.

CREATE OR REPLACE FUNCTION public.get_tenant_unit_ids(tenant_uuid UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT l.unit_id
    FROM public.leases l
   WHERE l.status IN ('active', 'upcoming', 'pending')
     AND (
       l.tenant_id = tenant_uuid
       OR EXISTS (
         SELECT 1 FROM public.lease_tenants lt
          WHERE lt.lease_id = l.id AND lt.tenant_id = tenant_uuid
       )
     )
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_property_ids(tenant_uuid UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.property_id
    FROM public.leases l
    JOIN public.units u ON u.id = l.unit_id
   WHERE l.status IN ('active', 'upcoming', 'pending')
     AND (
       l.tenant_id = tenant_uuid
       OR EXISTS (
         SELECT 1 FROM public.lease_tenants lt
          WHERE lt.lease_id = l.id AND lt.tenant_id = tenant_uuid
       )
     )
$$;
