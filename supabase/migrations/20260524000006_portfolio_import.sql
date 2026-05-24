-- Portfolio-import telemetry + feedback.
--
-- One row per import attempt (whether it succeeds, fails, or the manager
-- bails out). We capture:
--   • Source platform — to track which competitor we're capturing the
--     most churn from (and which parsers need the most love)
--   • Counts — properties / units / tenants / leases created
--   • Errors — full per-row error array, for support investigations
--   • Feedback — optional star rating + free-text from the manager AFTER
--     the import completes
--
-- The feedback gate is critical for vendors we haven't been able to test
-- ourselves (Buildium, DoorLoop, TenantCloud, AppFolio). Without it we'd
-- ship blind and not know which parsers are broken until a manager opens
-- a support ticket.

CREATE TABLE IF NOT EXISTS portfolio_imports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source                TEXT NOT NULL,         -- 'avail'|'buildium'|'doorloop'|'tenantcloud'|'appfolio'|'turbotenant'|'csv'
  -- Volume counts
  properties_in         INTEGER NOT NULL DEFAULT 0,
  units_in              INTEGER NOT NULL DEFAULT 0,
  tenants_in            INTEGER NOT NULL DEFAULT 0,
  properties_created    INTEGER NOT NULL DEFAULT 0,
  units_created         INTEGER NOT NULL DEFAULT 0,
  tenants_invited       INTEGER NOT NULL DEFAULT 0,
  tenants_linked        INTEGER NOT NULL DEFAULT 0,
  leases_created        INTEGER NOT NULL DEFAULT 0,
  errors                JSONB,                 -- array of { scope, index, message }
  -- Feedback (populated after the manager rates the experience)
  rating                INTEGER,               -- 1-5; NULL = not yet rated
  feedback_text         TEXT,
  rated_at              TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_imports_manager ON portfolio_imports(manager_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_imports_source  ON portfolio_imports(source);
CREATE INDEX IF NOT EXISTS idx_portfolio_imports_rating  ON portfolio_imports(rating) WHERE rating IS NOT NULL;

ALTER TABLE portfolio_imports ENABLE ROW LEVEL SECURITY;

-- Managers can SELECT + UPDATE (for rating) their own imports.
DROP POLICY IF EXISTS portfolio_imports_select_own ON portfolio_imports;
CREATE POLICY portfolio_imports_select_own ON portfolio_imports
  FOR SELECT USING (manager_id = auth.uid()
                    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS portfolio_imports_update_own ON portfolio_imports;
CREATE POLICY portfolio_imports_update_own ON portfolio_imports
  FOR UPDATE USING (manager_id = auth.uid())
  WITH CHECK (manager_id = auth.uid());

-- Service-role (the edge function) inserts.
DROP POLICY IF EXISTS portfolio_imports_insert_service ON portfolio_imports;
CREATE POLICY portfolio_imports_insert_service ON portfolio_imports
  FOR INSERT WITH CHECK (true);  -- gated by service role grant below

REVOKE INSERT ON portfolio_imports FROM PUBLIC, anon, authenticated;
GRANT INSERT ON portfolio_imports TO service_role;

-- Admin view for the dashboard — anonymized roll-up by source.
CREATE OR REPLACE VIEW admin_portfolio_imports_summary AS
SELECT
  source,
  COUNT(*) AS imports_total,
  COUNT(*) FILTER (WHERE rating IS NOT NULL) AS imports_rated,
  ROUND(AVG(rating) FILTER (WHERE rating IS NOT NULL)::numeric, 2) AS avg_rating,
  SUM(properties_created) AS properties_total,
  SUM(leases_created)     AS leases_total,
  AVG(properties_created)::int AS avg_properties_per_import,
  AVG(leases_created)::int     AS avg_leases_per_import,
  MAX(created_at) AS last_import_at
FROM portfolio_imports
GROUP BY source
ORDER BY imports_total DESC;

REVOKE ALL ON admin_portfolio_imports_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON admin_portfolio_imports_summary TO service_role;
