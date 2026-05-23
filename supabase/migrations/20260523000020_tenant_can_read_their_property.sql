-- Tenants need to read the property record for the unit they lease in order
-- to resolve manager_id (and thus the chat thread + company branding).
-- Without this policy, PostgREST embeds for properties from a tenant's
-- context return NULL, so the tenant Messages page can't find its manager.

DROP POLICY IF EXISTS "properties_tenant_select" ON properties;
CREATE POLICY "properties_tenant_select" ON properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      WHERE l.tenant_id = auth.uid() AND u.property_id = properties.id
    )
  );
