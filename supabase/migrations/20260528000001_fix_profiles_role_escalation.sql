-- SECURITY FIX (S1): privilege escalation via self-update of profiles.role.
--
-- The original profiles_update_own policy (20260321000001) was:
--   FOR UPDATE USING (auth.uid() = id)
-- with NO WITH CHECK. An UPDATE policy that omits WITH CHECK validates only
-- the *existing* row, never the post-update row — so a user could set any
-- column on their own row to any value, including:
--   UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
-- That flips is_admin() to true and unlocks every *_admin_all policy
-- (profiles, payments, leases, documents, backup_codes, ...) = full read/write
-- access to every other user's PII and money. Total compromise, one statement.
--
-- Fix: recreate the policy WITH CHECK that re-validates the post-update row and
-- forbids self-assigning the 'admin' role. Admins are provisioned out-of-band
-- (service role / SQL), which bypasses RLS, so this does not block legitimate
-- admin creation. Real admins editing their own profile still pass via the
-- profiles_admin_all policy (RLS policies are OR-ed). The 'manager'/'tenant'
-- onboarding reconciliation in AuthProvider keeps working (neither is 'admin').
--
-- role::text avoids any enum-binding quirks and matches is_admin()'s style.

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role::text <> 'admin');
