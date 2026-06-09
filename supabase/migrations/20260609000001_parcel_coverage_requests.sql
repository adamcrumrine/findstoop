-- Parcel-coverage requests: when a Rental Analysis Report runs in a county we
-- haven't connected to its auditor/ArcGIS source, the manager can ask us to add
-- it. Demand here ranks which county adapters to build next (see
-- supabase/functions/rent-estimate/parcel.ts PROVIDERS registry).

CREATE TABLE IF NOT EXISTS parcel_coverage_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state_fips   TEXT        NOT NULL,
  county_fips  TEXT        NOT NULL,
  state_name   TEXT,
  county_name  TEXT,
  zip          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One request per user per county; repeat clicks are no-ops.
  UNIQUE (user_id, state_fips, county_fips)
);

-- Demand ranking: count requests per county.
CREATE INDEX idx_parcel_cov_req_county ON parcel_coverage_requests(state_fips, county_fips);

ALTER TABLE parcel_coverage_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parcel_cov_req_owner_insert" ON parcel_coverage_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "parcel_cov_req_owner_select" ON parcel_coverage_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "parcel_cov_req_admin_all" ON parcel_coverage_requests
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
