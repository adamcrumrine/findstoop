-- 015_profiles_insert_policy.sql
-- Allow users to insert their own profile row (needed for fallback profile creation on sign-in).

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
