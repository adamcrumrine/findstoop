-- 016_fix_rls_recursion.sql
-- Fix infinite recursion caused by circular RLS policy references:
--   leases policies → units → units_tenant_select → leases (loop)
--   profiles_manager_read_tenants → leases → units → (loop)
--
-- Solution: use SECURITY DEFINER helper functions that bypass RLS,
-- breaking the circular dependency.

-- ── Helper functions (bypass RLS via SECURITY DEFINER) ────────────────────────

-- Returns unit IDs the tenant has an active lease for
CREATE OR REPLACE FUNCTION get_tenant_unit_ids(tenant_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT unit_id FROM public.leases
  WHERE tenant_id = tenant_uuid AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Returns property manager IDs for a given unit
CREATE OR REPLACE FUNCTION get_unit_manager_id(unit_uuid UUID)
RETURNS UUID AS $$
  SELECT p.manager_id FROM public.units u
  JOIN public.properties p ON p.id = u.property_id
  WHERE u.id = unit_uuid
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Returns lease IDs for a manager's properties
CREATE OR REPLACE FUNCTION get_manager_lease_ids(manager_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT l.id FROM public.leases l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE p.manager_id = manager_uuid
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Returns tenant IDs for a manager's properties
CREATE OR REPLACE FUNCTION get_manager_tenant_ids(manager_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT DISTINCT l.tenant_id FROM public.leases l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE p.manager_id = manager_uuid
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- ── Drop recursive policies ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "units_tenant_select" ON units;
DROP POLICY IF EXISTS "profiles_manager_read_tenants" ON profiles;
DROP POLICY IF EXISTS "leases_manager_select" ON leases;
DROP POLICY IF EXISTS "leases_manager_insert" ON leases;
DROP POLICY IF EXISTS "leases_manager_update" ON leases;
DROP POLICY IF EXISTS "leases_manager_delete" ON leases;
DROP POLICY IF EXISTS "payments_manager_select" ON payments;
DROP POLICY IF EXISTS "payments_manager_update" ON payments;
DROP POLICY IF EXISTS "pets_manager_select" ON pets;
DROP POLICY IF EXISTS "utility_bills_manager_select" ON utility_bills;
DROP POLICY IF EXISTS "utility_bills_manager_insert" ON utility_bills;
DROP POLICY IF EXISTS "utility_bills_manager_update" ON utility_bills;
DROP POLICY IF EXISTS "utility_bills_manager_delete" ON utility_bills;
DROP POLICY IF EXISTS "maintenance_manager_select" ON maintenance_requests;
DROP POLICY IF EXISTS "maintenance_manager_update" ON maintenance_requests;
DROP POLICY IF EXISTS "documents_manager_select" ON documents;
DROP POLICY IF EXISTS "documents_manager_insert" ON documents;
DROP POLICY IF EXISTS "documents_manager_update" ON documents;
DROP POLICY IF EXISTS "documents_manager_delete" ON documents;

-- ── Recreate policies using helper functions ──────────────────────────────────

-- profiles: manager can read their tenants
CREATE POLICY "profiles_manager_read_tenants" ON profiles
  FOR SELECT USING (
    id IN (SELECT get_manager_tenant_ids(auth.uid()))
  );

-- units: tenant can read their unit
CREATE POLICY "units_tenant_select" ON units
  FOR SELECT USING (
    id IN (SELECT get_tenant_unit_ids(auth.uid()))
  );

-- leases: manager policies
CREATE POLICY "leases_manager_select" ON leases
  FOR SELECT USING (id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "leases_manager_insert" ON leases
  FOR INSERT WITH CHECK (get_unit_manager_id(unit_id) = auth.uid());

CREATE POLICY "leases_manager_update" ON leases
  FOR UPDATE USING (id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "leases_manager_delete" ON leases
  FOR DELETE USING (id IN (SELECT get_manager_lease_ids(auth.uid())));

-- payments: manager policies
CREATE POLICY "payments_manager_select" ON payments
  FOR SELECT USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "payments_manager_update" ON payments
  FOR UPDATE USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

-- pets: manager policy
CREATE POLICY "pets_manager_select" ON pets
  FOR SELECT USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

-- utility_bills: manager policies
CREATE POLICY "utility_bills_manager_select" ON utility_bills
  FOR SELECT USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "utility_bills_manager_insert" ON utility_bills
  FOR INSERT WITH CHECK (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "utility_bills_manager_update" ON utility_bills
  FOR UPDATE USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "utility_bills_manager_delete" ON utility_bills
  FOR DELETE USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

-- maintenance: manager policies
CREATE POLICY "maintenance_manager_select" ON maintenance_requests
  FOR SELECT USING (get_unit_manager_id(unit_id) = auth.uid());

CREATE POLICY "maintenance_manager_update" ON maintenance_requests
  FOR UPDATE USING (get_unit_manager_id(unit_id) = auth.uid());

-- documents: manager policies
CREATE POLICY "documents_manager_select" ON documents
  FOR SELECT USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "documents_manager_insert" ON documents
  FOR INSERT WITH CHECK (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "documents_manager_update" ON documents
  FOR UPDATE USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "documents_manager_delete" ON documents
  FOR DELETE USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));
