-- Admin analytics infrastructure.
--
-- Two raw tables + a set of views that the admin dashboard reads from.
-- The raw tables hold per-event detail (PII-light by design — only user_id
-- references, never emails or names). The views aggregate for dashboard
-- consumption and strip even more identifiers.
--
-- RLS posture:
--   • analytics_events / api_call_log: NO direct SELECT for non-service-role
--     users. Edge functions (service role) write, admin views read.
--   • Admins SELECT through the dedicated views (admin_*).
--   • Authenticated users can INSERT their own analytics_events rows for
--     client-side page-view tracking (user_id must match auth.uid()).

-- ── analytics_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id   TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role    TEXT,                       -- 'manager' | 'tenant' | 'admin' | NULL for anon
  event_type   TEXT NOT NULL,              -- 'page_view' | 'sign_in' | 'sign_up' | 'sign_out' | 'action' | 'error'
  page_path    TEXT,                       -- normalized path (no query string, no PII fragments)
  metadata     JSONB,                      -- caller-defined extras — caller must NOT include PII
  country_code TEXT                        -- best-effort, 2-letter ISO
);

CREATE INDEX IF NOT EXISTS idx_ae_ts          ON analytics_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ae_user        ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_ae_session     ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_ae_type_ts     ON analytics_events (event_type, ts DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can write their own events for client-side tracking.
DROP POLICY IF EXISTS ae_insert_own ON analytics_events;
CREATE POLICY ae_insert_own ON analytics_events
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Anon users (visitors not signed in) can insert page-view events with NULL user_id.
DROP POLICY IF EXISTS ae_insert_anon ON analytics_events;
CREATE POLICY ae_insert_anon ON analytics_events
  FOR INSERT TO anon WITH CHECK (user_id IS NULL);

-- Admins can read raw events (everyone else cannot).
DROP POLICY IF EXISTS ae_select_admin ON analytics_events;
CREATE POLICY ae_select_admin ON analytics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ── api_call_log ───────────────────────────────────────────────────────
-- Edge function invocations + their cost. Lets us answer "how much does
-- the average screening cost us?", "which functions error most?", etc.
CREATE TABLE IF NOT EXISTS api_call_log (
  id            BIGSERIAL PRIMARY KEY,
  ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  function_name TEXT NOT NULL,             -- 'dl-ocr' | 'income-ocr' | 'run-criminal-check' | etc.
  vendor        TEXT,                       -- 'anthropic' | 'stripe' | 'checkr' | 'twilio' | 'resend' | NULL
  status_code   INT,                        -- HTTP-equivalent: 200, 400, 500, etc.
  latency_ms    INT,                        -- end-to-end edge fn time
  cost_cents    NUMERIC(10,4),              -- our cost for this call (fractional cents allowed for Claude)
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_id  TEXT,                       -- e.g. screening_order_id, payment_intent_id (NOT a person identifier)
  error_message TEXT,                       -- truncated, no stack traces with PII
  metadata      JSONB
);

CREATE INDEX IF NOT EXISTS idx_acl_ts        ON api_call_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_acl_fn_ts     ON api_call_log (function_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_acl_vendor_ts ON api_call_log (vendor, ts DESC);
CREATE INDEX IF NOT EXISTS idx_acl_status    ON api_call_log (status_code) WHERE status_code >= 400;

ALTER TABLE api_call_log ENABLE ROW LEVEL SECURITY;

-- Only admins read; only service role writes.
DROP POLICY IF EXISTS acl_select_admin ON api_call_log;
CREATE POLICY acl_select_admin ON api_call_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- ── Admin views ────────────────────────────────────────────────────────
-- These views strip identifiers and pre-aggregate for the dashboard.

-- 1. KPI snapshot — single row, current totals
CREATE OR REPLACE VIEW admin_kpis AS
SELECT
  (SELECT COUNT(*) FROM profiles WHERE role = 'manager')                                  AS total_managers,
  (SELECT COUNT(*) FROM profiles WHERE role = 'tenant')                                   AS total_tenants,
  (SELECT COUNT(*) FROM properties)                                                       AS total_properties,
  (SELECT COUNT(*) FROM units)                                                            AS total_units,
  (SELECT COUNT(*) FROM units WHERE status = 'occupied')                                  AS occupied_units,
  (SELECT COUNT(*) FROM leases WHERE status = 'active')                                   AS active_leases,
  (SELECT COUNT(*) FROM applications)                                                     AS total_applications,
  (SELECT COUNT(*) FROM screening_orders WHERE state = 'complete')                        AS completed_screenings,
  (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed')              AS total_rent_collected_dollars,
  (SELECT COALESCE(SUM(amount_cents), 0) FROM screening_orders WHERE payment_status='paid') AS total_screening_revenue_cents,
  (SELECT COALESCE(SUM(margin_cents),  0) FROM screening_orders WHERE payment_status='paid') AS total_screening_margin_cents,
  (SELECT COALESCE(SUM(cost_cents), 0) FROM api_call_log)                                 AS total_api_cost_cents,
  (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE ts >= NOW() - INTERVAL '24 hours' AND user_id IS NOT NULL) AS dau,
  (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE ts >= NOW() - INTERVAL '7 days'   AND user_id IS NOT NULL) AS wau,
  (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE ts >= NOW() - INTERVAL '30 days'  AND user_id IS NOT NULL) AS mau,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '24 hours')         AS signups_24h,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days')           AS signups_7d,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '30 days')          AS signups_30d;

-- 2. Daily activity rollup (last 90 days) — for trend charts
CREATE OR REPLACE VIEW admin_daily_activity AS
SELECT
  date_trunc('day', ts) AS day,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS unique_users,
  COUNT(*) FILTER (WHERE event_type = 'page_view') AS page_views,
  COUNT(*) FILTER (WHERE event_type = 'sign_in')   AS sign_ins,
  COUNT(*) FILTER (WHERE event_type = 'sign_up')   AS sign_ups,
  COUNT(*) FILTER (WHERE event_type = 'error')     AS errors
FROM analytics_events
WHERE ts >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('day', ts)
ORDER BY day DESC;

-- 3. Daily revenue rollup (last 90 days)
CREATE OR REPLACE VIEW admin_daily_revenue AS
SELECT
  date_trunc('day', paid_at)::date AS day,
  COUNT(*) AS screening_orders_paid,
  COALESCE(SUM(amount_cents),0) AS screening_revenue_cents,
  COALESCE(SUM(margin_cents),0) AS screening_margin_cents
FROM screening_orders
WHERE paid_at IS NOT NULL AND paid_at >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('day', paid_at)::date
ORDER BY day DESC;

-- 4. Edge function health (last 24h)
CREATE OR REPLACE VIEW admin_api_health AS
SELECT
  function_name,
  COUNT(*) AS calls_24h,
  COUNT(*) FILTER (WHERE status_code >= 400) AS errors_24h,
  ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0) AS p95_latency_ms,
  COALESCE(SUM(cost_cents), 0) AS total_cost_cents_24h
FROM api_call_log
WHERE ts >= NOW() - INTERVAL '24 hours'
GROUP BY function_name
ORDER BY calls_24h DESC;

-- 5. Anonymized user roster
-- Returns a synthetic identifier (first 6 chars of UUID) + role + signup +
-- last-seen + activity counts. NO email / name / phone exposed.
CREATE OR REPLACE VIEW admin_users_anon AS
SELECT
  substring(p.id::text, 1, 6) AS user_ref,
  p.id AS raw_id,
  p.role,
  p.created_at AS signed_up_at,
  (SELECT MAX(ts) FROM analytics_events ae WHERE ae.user_id = p.id) AS last_seen_at,
  (SELECT COUNT(*) FROM analytics_events ae WHERE ae.user_id = p.id) AS event_count,
  (SELECT COUNT(*) FROM properties pr WHERE pr.manager_id = p.id) AS property_count,
  (SELECT COUNT(*) FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     WHERE pr.manager_id = p.id) AS lease_count
FROM profiles p;

-- Property geographic spread — city/state only, no street addresses
CREATE OR REPLACE VIEW admin_property_geo AS
SELECT
  state,
  city,
  COUNT(*) AS property_count,
  SUM((SELECT COUNT(*) FROM units u WHERE u.property_id = p.id)) AS unit_count
FROM properties p
GROUP BY state, city
ORDER BY property_count DESC, state, city;


-- ── Service-role helper: log_api_call ─────────────────────────────────
-- Edge functions call this RPC to log their own invocations without
-- needing direct INSERT privileges (cleaner than embedding the SQL).
CREATE OR REPLACE FUNCTION log_api_call(
  p_function_name TEXT,
  p_vendor        TEXT DEFAULT NULL,
  p_status_code   INT  DEFAULT 200,
  p_latency_ms    INT  DEFAULT NULL,
  p_cost_cents    NUMERIC DEFAULT NULL,
  p_user_id       UUID DEFAULT NULL,
  p_reference_id  TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_metadata      JSONB DEFAULT NULL
) RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO api_call_log (
    function_name, vendor, status_code, latency_ms, cost_cents,
    user_id, reference_id, error_message, metadata
  )
  VALUES (
    p_function_name, p_vendor, p_status_code, p_latency_ms, p_cost_cents,
    p_user_id, p_reference_id,
    -- Truncate error text to keep PII risk low + storage bounded
    LEFT(COALESCE(p_error_message, ''), 500),
    p_metadata
  )
  RETURNING id;
$$;
