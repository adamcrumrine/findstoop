-- Rent Analysis Reports built from public data (Census/HUD/BLS + county auditor).
--
-- Two tables:
--   • rent_reports   — a user's purchased/saved reports (backs "Your Reports")
--   • rent_geo_cache — server-side cache of public-data API responses, keyed by
--                      geography so we don't re-hit Census/HUD/BLS on every run
--                      (their data only changes annually/monthly). Service-role
--                      only — no client access.

-- ── Saved reports ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rent_reports (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  address           TEXT         NOT NULL,
  unit_number       TEXT,
  zip               TEXT,
  bedrooms          INTEGER      NOT NULL,
  estimate          NUMERIC(10,2) NOT NULL,
  low               NUMERIC(10,2) NOT NULL,
  high              NUMERIC(10,2) NOT NULL,
  confidence        TEXT         NOT NULL,          -- low | medium | high
  attributes_source TEXT         NOT NULL,          -- parcel | user
  report            JSONB        NOT NULL,          -- full payload for re-render/PDF
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rent_reports_user_id    ON rent_reports(user_id);
CREATE INDEX idx_rent_reports_created_at ON rent_reports(created_at DESC);

ALTER TABLE rent_reports ENABLE ROW LEVEL SECURITY;

-- Owners read and create their own reports.
CREATE POLICY "rent_reports_owner_select" ON rent_reports
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "rent_reports_owner_insert" ON rent_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "rent_reports_owner_delete" ON rent_reports
  FOR DELETE USING (user_id = auth.uid());

-- Admin sees everything (anonymized usage analytics live elsewhere).
CREATE POLICY "rent_reports_admin_all" ON rent_reports
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Public-data cache ───────────────────────────────────────────────────────
-- geo_key examples: 'acs:39:049:001100:2br', 'hud:43212:2br', 'bls:recency:2023'.
-- RLS enabled with NO policies → only the service-role edge function can touch
-- it (service role bypasses RLS). No user ever reads or writes this directly.

CREATE TABLE IF NOT EXISTS rent_geo_cache (
  geo_key     TEXT         PRIMARY KEY,
  payload     JSONB        NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE rent_geo_cache ENABLE ROW LEVEL SECURITY;
-- (intentionally no policies)

COMMENT ON TABLE rent_geo_cache IS
  'Server-side cache of Census/HUD/BLS responses keyed by geography. Service-role only.';
