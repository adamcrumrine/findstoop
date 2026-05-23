-- The straight-EXISTS form of properties_tenant_select + the matching
-- profiles_tenant_select_their_manager triggered RLS on units, which in turn
-- triggered RLS on properties (units_manager_select EXISTS-checks properties),
-- which triggered RLS on units again. Infinite recursion.
--
-- Switch to SECURITY DEFINER helpers (matches the pattern get_tenant_unit_ids
-- / get_manager_lease_ids already use).

CREATE OR REPLACE FUNCTION public.get_tenant_property_ids(tenant_uuid uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.property_id
  FROM public.leases l
  JOIN public.units u ON u.id = l.unit_id
  WHERE l.tenant_id = tenant_uuid
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_property_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "properties_tenant_select" ON properties;
CREATE POLICY "properties_tenant_select" ON properties
  FOR SELECT USING (id IN (SELECT public.get_tenant_property_ids(auth.uid())));

CREATE OR REPLACE FUNCTION public.get_tenant_manager_ids(tenant_uuid uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.manager_id
  FROM public.leases l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE l.tenant_id = tenant_uuid
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_manager_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_tenant_select_their_manager" ON profiles;
CREATE POLICY "profiles_tenant_select_their_manager" ON profiles
  FOR SELECT USING (
    role IN ('manager', 'admin')
    AND id IN (SELECT public.get_tenant_manager_ids(auth.uid()))
  );
