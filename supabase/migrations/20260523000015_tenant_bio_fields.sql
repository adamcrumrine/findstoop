-- Tenant-bio fields on profiles. Optional self-disclosure fields the tenant
-- fills in from their Settings page; the manager sees them read-only on the
-- new /manager/tenants/:id page (and during application screening).
--
-- RLS: profiles already lets a tenant SELECT/UPDATE their own row. Managers
-- can SELECT any profile that's the tenant on one of their leases (existing
-- policy chain via leases→units→properties). No new policies needed; the
-- bio columns piggyback on the same profile row.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth                  DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employer                       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employer_phone                 TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_income                 NUMERIC(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_name         TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS previous_address               TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS about_me                       TEXT;

-- Managers (and admins) need to SELECT tenant bios for any tenant on a lease
-- they own. Add a policy that grants exactly that, scoped to tenants only.
DROP POLICY IF EXISTS "profiles_manager_select_their_tenants" ON profiles;
CREATE POLICY "profiles_manager_select_their_tenants" ON profiles
  FOR SELECT USING (
    role = 'tenant' AND EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.tenant_id = profiles.id AND p.manager_id = auth.uid()
    )
  );
