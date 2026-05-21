-- 021_admin_role.sql
-- Add 'admin' to user_role enum and grant admin full read/write access
-- across every table and storage bucket via separate RLS policies.
--
-- Existing manager/tenant policies remain unchanged; admin gets its own
-- policy on each table evaluated as `USING (is_admin())`.

-- ── 1. Extend the enum ───────────────────────────────────────────────────────

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- ── 2. Helper: is the current user an admin? ─────────────────────────────────
-- SECURITY DEFINER avoids recursing through profiles RLS when called from
-- a policy on the profiles table itself.
-- `role::text = 'admin'` rather than `role = 'admin'` is intentional:
-- Postgres rejects binding a freshly-added enum value within the same
-- transaction as ALTER TYPE ADD VALUE. Casting to text sidesteps that.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role::text = 'admin'
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- ── 3. profiles ──────────────────────────────────────────────────────────────

CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 4. properties ────────────────────────────────────────────────────────────

CREATE POLICY "properties_admin_all" ON properties
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 5. units ─────────────────────────────────────────────────────────────────

CREATE POLICY "units_admin_all" ON units
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 6. leases ────────────────────────────────────────────────────────────────

CREATE POLICY "leases_admin_all" ON leases
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 7. payments ──────────────────────────────────────────────────────────────

CREATE POLICY "payments_admin_all" ON payments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 8. pets ──────────────────────────────────────────────────────────────────

CREATE POLICY "pets_admin_all" ON pets
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 9. utilities ─────────────────────────────────────────────────────────────

CREATE POLICY "utilities_admin_all" ON utilities
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 10. utility_bills ────────────────────────────────────────────────────────

CREATE POLICY "utility_bills_admin_all" ON utility_bills
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 11. maintenance_requests ─────────────────────────────────────────────────

CREATE POLICY "maintenance_admin_all" ON maintenance_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 12. messages ─────────────────────────────────────────────────────────────

CREATE POLICY "messages_admin_all" ON messages
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 13. documents ────────────────────────────────────────────────────────────

CREATE POLICY "documents_admin_all" ON documents
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 14. backup_codes ─────────────────────────────────────────────────────────

CREATE POLICY "backup_codes_admin_all" ON backup_codes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 15. storage buckets (maintenance-photos, lease-documents) ───────────────

CREATE POLICY "maintenance_photos_admin_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'maintenance-photos' AND public.is_admin())
  WITH CHECK (bucket_id = 'maintenance-photos' AND public.is_admin());

CREATE POLICY "lease_documents_admin_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'lease-documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'lease-documents' AND public.is_admin());
