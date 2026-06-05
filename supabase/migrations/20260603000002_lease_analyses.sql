-- 20260603000002_lease_analyses.sql
-- Renter Check funnel (L2).
--
-- Persists the result of an anonymous lease analysis so we can (a) email the
-- renter their summary, (b) tell them whether their landlord is already on
-- FindStoop, and (c) let the renter invite their landlord. This is lead data,
-- so it is locked down: no anon/authenticated access via the API at all —
-- every read/write goes through an edge function using the service role plus a
-- per-row capability token (same model as the screening flow). The uploaded
-- PDF is never stored; only the extracted analysis is, and it's purged after
-- 90 days.

CREATE TABLE IF NOT EXISTS lease_analyses (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token         TEXT         NOT NULL,  -- capability token for anonymous follow-ups
  state_detected       TEXT,
  referral_source      TEXT,                   -- ?ref= channel attribution (e.g. 'osu')
  landlord_name        TEXT,
  landlord_email       TEXT,
  property_address     TEXT,
  summary              TEXT,
  red_flag_count       INTEGER      NOT NULL DEFAULT 0,
  high_flag_count      INTEGER      NOT NULL DEFAULT 0,
  analysis             JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- full result, for the summary email
  tenant_email         TEXT,                   -- opt-in lead capture
  matched_manager_id   UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  emailed_summary_at   TIMESTAMPTZ,
  landlord_invited_at  TIMESTAMPTZ,            -- tenant-initiated invite sent
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lease_analyses_landlord_email ON lease_analyses(lower(landlord_email));
CREATE INDEX idx_lease_analyses_matched_manager ON lease_analyses(matched_manager_id);
CREATE INDEX idx_lease_analyses_created ON lease_analyses(created_at);
CREATE INDEX idx_lease_analyses_referral ON lease_analyses(referral_source);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Deny-all for anon + authenticated (no policies for them). The service role
-- used by edge functions bypasses RLS; admins may read for the leads pipeline.

ALTER TABLE lease_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lease_analyses_admin_select" ON lease_analyses
  FOR SELECT USING (is_admin());

-- ── Retention ───────────────────────────────────────────────────────────────
-- Purge analyses older than 90 days. Wire into the daily lifecycle cron
-- (cron-lifecycle-daily) or pg_cron. Service-role / definer so it can run
-- regardless of RLS.

CREATE OR REPLACE FUNCTION delete_stale_lease_analyses()
RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM lease_analyses WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
