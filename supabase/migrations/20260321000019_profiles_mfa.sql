-- 019_profiles_mfa.sql
-- Add MFA fields to profiles table.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mfa_enabled      BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS mfa_method       TEXT    DEFAULT 'none' NOT NULL
                              CHECK (mfa_method IN ('sms', 'totp', 'none')),
  ADD COLUMN IF NOT EXISTS phone_last_four  TEXT;

-- phone column already exists (added in original schema), just ensure it's there
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
