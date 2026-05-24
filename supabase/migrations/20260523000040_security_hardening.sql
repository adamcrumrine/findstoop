-- Security hardening tables + helpers.
--
-- Three concerns:
--   1. Rate limiting for edge functions (sliding window counter per key)
--   2. Login lockout (failed-attempt tracking per email + IP)
--   3. Device fingerprint tracking (alert on sign-in from a new device)
--
-- All three are write-once-by-service-role, read-by-admin. No PII surfaced
-- beyond what's already in the analytics tables.

-- ── 1. rate_limits ─────────────────────────────────────────────────────
-- Generic sliding-window counter. The key encodes whatever the caller wants
-- to throttle on — e.g. 'start-screening:127.0.0.1', 'hibp:user@x.com'.
CREATE TABLE IF NOT EXISTS rate_limits (
  key            TEXT        NOT NULL,
  window_start   TIMESTAMPTZ NOT NULL,
  count          INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rl_window ON rate_limits (window_start);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS; admins may read for diagnostics
DROP POLICY IF EXISTS rl_select_admin ON rate_limits;
CREATE POLICY rl_select_admin ON rate_limits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── 2. login_attempts ──────────────────────────────────────────────────
-- One row per attempt (success or fail). Used to lock an account after
-- N failures in M minutes, and to inform "new device" emails.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_hash   TEXT,                          -- SHA-256(lowercased email) — never raw email
  ip_address   TEXT,                          -- IPv4/v6 string
  user_agent   TEXT,                          -- truncated to 500 chars
  success      BOOLEAN NOT NULL DEFAULT FALSE,
  reason       TEXT,                          -- e.g. 'invalid_credentials' | 'locked'
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_la_email_ts ON login_attempts (email_hash, ts DESC);
CREATE INDEX IF NOT EXISTS idx_la_ip_ts    ON login_attempts (ip_address, ts DESC);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS la_select_admin ON login_attempts;
CREATE POLICY la_select_admin ON login_attempts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── 3. user_devices ────────────────────────────────────────────────────
-- One row per (user, device fingerprint). New device on sign-in triggers
-- an email alert via Resend.
CREATE TABLE IF NOT EXISTS user_devices (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint     TEXT NOT NULL,             -- SHA-256(user_agent + ip_geolocation_region)
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent      TEXT,                       -- truncated
  ip_country      TEXT,                       -- e.g. 'US'
  ip_region       TEXT,                       -- e.g. 'OH'
  ip_city         TEXT,                       -- e.g. 'Columbus'
  alert_sent_at   TIMESTAMPTZ,
  UNIQUE (user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_ud_user ON user_devices (user_id, last_seen_at DESC);
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ud_select_own ON user_devices;
CREATE POLICY ud_select_own ON user_devices
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS ud_select_admin ON user_devices;
CREATE POLICY ud_select_admin ON user_devices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ── RPCs ──────────────────────────────────────────────────────────────

-- Rate-limit check: returns TRUE if the caller is *under* the limit (and
-- increments the counter), FALSE if they're throttled. SECURITY DEFINER so
-- edge functions can call without table-level INSERT grants.
CREATE OR REPLACE FUNCTION rate_limit_check(
  p_key            TEXT,
  p_window_seconds INTEGER,
  p_max_count      INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current      INTEGER;
BEGIN
  v_window_start := date_trunc('second', NOW()) - ((EXTRACT(EPOCH FROM NOW())::int % p_window_seconds) * INTERVAL '1 second');

  -- Increment or insert
  INSERT INTO rate_limits (key, window_start, count)
    VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_current;

  RETURN v_current <= p_max_count;
END;
$$;

-- Login lockout check. Returns TRUE if the email is currently locked out.
-- Definition: ≥ 5 failed attempts (success=false) in the last 15 minutes.
CREATE OR REPLACE FUNCTION login_is_locked(p_email_hash TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*) >= 5
  FROM login_attempts
  WHERE email_hash = p_email_hash
    AND success = FALSE
    AND ts > NOW() - INTERVAL '15 minutes';
$$;

-- Record a login attempt (success or fail). Used by an edge function called
-- from the client at each sign-in attempt.
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email_hash TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_success    BOOLEAN,
  p_reason     TEXT DEFAULT NULL,
  p_user_id    UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO login_attempts (email_hash, ip_address, user_agent, success, reason, user_id)
  VALUES (p_email_hash, p_ip_address, LEFT(COALESCE(p_user_agent, ''), 500), p_success, p_reason, p_user_id);
$$;

-- Cleanup: keep rate_limit and login_attempt rows for max 7 days. Runs
-- when the table grows; nothing schedules it, but the index keeps the hot
-- query fast and a daily cron can call this if storage matters later.
CREATE OR REPLACE FUNCTION cleanup_security_tables() RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM rate_limits     WHERE window_start < NOW() - INTERVAL '1 day';
  DELETE FROM login_attempts  WHERE ts           < NOW() - INTERVAL '7 days';
$$;
