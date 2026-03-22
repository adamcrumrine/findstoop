-- 020_backup_codes.sql
-- Stores single-use MFA backup codes (SHA-256 hashed) per user.

CREATE TABLE IF NOT EXISTS backup_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   TEXT        NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_backup_codes" ON backup_codes
  FOR ALL USING (auth.uid() = user_id);
