-- 012_cross_table_policies.sql
-- Policies that reference multiple tables, added after all tables exist.

-- Managers can read profiles of tenants linked to their properties
CREATE POLICY "profiles_manager_read_tenants" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.tenant_id = profiles.id
        AND p.manager_id = auth.uid()
    )
  );

-- Tenants can read the unit associated with their active lease
CREATE POLICY "units_tenant_select" ON units
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.unit_id = units.id
        AND l.tenant_id = auth.uid()
        AND l.status = 'active'
    )
  );

-- Tenants can read utilities associated with their unit
CREATE POLICY "utilities_tenant_select" ON utilities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.unit_id = utilities.unit_id
        AND l.tenant_id = auth.uid()
        AND l.status = 'active'
    )
  );
