-- Tenants need to read their manager's profile to:
--   * resolve who to start the 1:1 conversation with
--   * render the manager's company name + company_logo_url as the chat avatar
-- Without this policy, the inner profile lookup on
--   units.properties.manager_id → profiles
-- returns NULL under RLS, breaking the tenant Messages flow.

DROP POLICY IF EXISTS "profiles_tenant_select_their_manager" ON profiles;
CREATE POLICY "profiles_tenant_select_their_manager" ON profiles
  FOR SELECT USING (
    role IN ('manager', 'admin') AND EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.tenant_id = auth.uid() AND p.manager_id = profiles.id
    )
  );
