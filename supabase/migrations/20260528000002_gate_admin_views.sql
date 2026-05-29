-- SECURITY FIX (S4): admin_* analytics views leaked to every authenticated user.
--
-- These views were created with plain CREATE VIEW — no security_invoker and no
-- REVOKE. A Postgres view runs with its OWNER's rights and BYPASSES RLS on the
-- underlying tables; Supabase's default grants give the `anon`/`authenticated`
-- roles SELECT on new public objects. Net effect: any logged-in tenant could
--   SELECT * FROM admin_users_anon;      -- raw_id + role + activity, every user
--   SELECT * FROM admin_connect_status;  -- every manager's Stripe Connect state
--   SELECT * FROM admin_subscription_health / admin_kpis;  -- whole-business MRR
-- i.e. cross-tenant PII + confidential business metrics, one query away.
--
-- Why not REVOKE / security_invoker:
--   • The admin dashboard reads these views directly from the browser with the
--     admin's JWT (the `authenticated` role), so REVOKE-from-authenticated would
--     lock admins out too.
--   • security_invoker would respect the caller's RLS, but admins have no RLS
--     SELECT policy on `applications`/`screening_orders`, so KPI counts would
--     silently read 0. It would change data, not just access.
--
-- Fix: keep definer semantics (full data) but gate every view on is_admin().
-- Non-admins now get ZERO rows; admins are unaffected. Bodies are reproduced
-- verbatim from 20260523000038 / 20260523000039, with only the gate added.
-- is_admin() is SECURITY DEFINER and reads auth.uid(), so it works inside a
-- definer view.

-- ── from 20260523000038_admin_analytics.sql ────────────────────────────

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
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '30 days')          AS signups_30d
WHERE is_admin();

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
WHERE ts >= NOW() - INTERVAL '90 days' AND is_admin()
GROUP BY date_trunc('day', ts)
ORDER BY day DESC;

CREATE OR REPLACE VIEW admin_daily_revenue AS
SELECT
  date_trunc('day', paid_at)::date AS day,
  COUNT(*) AS screening_orders_paid,
  COALESCE(SUM(amount_cents),0) AS screening_revenue_cents,
  COALESCE(SUM(margin_cents),0) AS screening_margin_cents
FROM screening_orders
WHERE paid_at IS NOT NULL AND paid_at >= NOW() - INTERVAL '90 days' AND is_admin()
GROUP BY date_trunc('day', paid_at)::date
ORDER BY day DESC;

CREATE OR REPLACE VIEW admin_api_health AS
SELECT
  function_name,
  COUNT(*) AS calls_24h,
  COUNT(*) FILTER (WHERE status_code >= 400) AS errors_24h,
  ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0) AS p95_latency_ms,
  COALESCE(SUM(cost_cents), 0) AS total_cost_cents_24h
FROM api_call_log
WHERE ts >= NOW() - INTERVAL '24 hours' AND is_admin()
GROUP BY function_name
ORDER BY calls_24h DESC;

CREATE OR REPLACE VIEW admin_property_geo AS
SELECT
  state,
  city,
  COUNT(*) AS property_count,
  SUM((SELECT COUNT(*) FROM units u WHERE u.property_id = p.id)) AS unit_count
FROM properties p
WHERE is_admin()
GROUP BY state, city
ORDER BY property_count DESC, state, city;

-- ── from 20260523000039_admin_ops_views.sql ───────────────────────────

CREATE OR REPLACE VIEW admin_stuck_screenings AS
SELECT
  so.id,
  substring(so.id::text, 1, 8)    AS order_ref,
  so.tier,
  so.state,
  so.payment_status,
  so.amount_cents,
  so.paid_at,
  so.created_at,
  EXTRACT(EPOCH FROM (NOW() - so.paid_at))::int / 60 AS minutes_since_paid,
  CASE
    WHEN so.state = 'scoring'    AND so.paid_at < NOW() - INTERVAL '10 minutes' THEN 'pipeline_jam'
    WHEN so.state = 'collecting' AND so.paid_at < NOW() - INTERVAL '24 hours'   THEN 'applicant_abandoned'
    WHEN so.state = 'failed'                                                    THEN 'failed'
    ELSE 'other'
  END AS stuck_reason
FROM screening_orders so
WHERE so.payment_status = 'paid'
  AND so.state IN ('collecting', 'scoring', 'failed')
  AND (
    (so.state = 'scoring'    AND so.paid_at < NOW() - INTERVAL '10 minutes') OR
    (so.state = 'collecting' AND so.paid_at < NOW() - INTERVAL '24 hours')   OR
    (so.state = 'failed')
  )
  AND is_admin()
ORDER BY so.paid_at DESC;

CREATE OR REPLACE VIEW admin_subscription_health AS
SELECT
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager'
       AND subscription_status IN ('active', 'trialing')
       AND COALESCE(subscription_complimentary, FALSE) = FALSE
  )                                                                                  AS paying_managers,
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager' AND subscription_complimentary = TRUE
  )                                                                                  AS comp_managers,
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager' AND subscription_status = 'past_due'
  )                                                                                  AS past_due_managers,
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager' AND subscription_status = 'canceled'
  )                                                                                  AS canceled_managers,
  (SELECT COALESCE(SUM(
     CASE
       WHEN subscription_interval = 'year' THEN (subscription_quantity * 750)
       ELSE                                       (subscription_quantity * 900)
     END
   ), 0)
   FROM profiles
   WHERE role = 'manager'
     AND subscription_status IN ('active', 'trialing')
     AND COALESCE(subscription_complimentary, FALSE) = FALSE
  )                                                                                  AS mrr_cents,
  (SELECT COALESCE(SUM(subscription_quantity), 0)
     FROM profiles
     WHERE role = 'manager'
       AND subscription_status IN ('active', 'trialing')
       AND COALESCE(subscription_complimentary, FALSE) = FALSE
  )                                                                                  AS paid_units,
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager'
       AND subscription_status IN ('active', 'trialing')
       AND created_at >= NOW() - INTERVAL '7 days'
  )                                                                                  AS new_subs_7d,
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager'
       AND subscription_status = 'canceled'
       AND subscription_current_period_end >= NOW() - INTERVAL '30 days'
  )                                                                                  AS canceled_30d
WHERE is_admin();

CREATE OR REPLACE VIEW admin_subscription_plans AS
SELECT
  CASE
    WHEN subscription_complimentary = TRUE       THEN 'comp'
    WHEN subscription_status = 'past_due'        THEN 'past_due'
    WHEN subscription_status = 'canceled'        THEN 'canceled'
    WHEN subscription_interval = 'year'          THEN 'annual'
    WHEN subscription_interval = 'month'         THEN 'monthly'
    WHEN subscription_status IS NULL             THEN 'no_subscription'
    ELSE COALESCE(subscription_status, 'unknown')
  END                                                                                AS plan,
  COUNT(*)                                                                           AS manager_count,
  COALESCE(SUM(subscription_quantity), 0)                                            AS unit_count
FROM profiles
WHERE role = 'manager' AND is_admin()
GROUP BY 1
ORDER BY manager_count DESC;

CREATE OR REPLACE VIEW admin_user_costs AS
SELECT
  user_id,
  substring(user_id::text, 1, 6)        AS user_ref,
  COUNT(*)                              AS call_count,
  COALESCE(SUM(cost_cents), 0)::numeric AS total_cost_cents,
  COUNT(*) FILTER (WHERE status_code >= 400) AS error_count,
  MAX(ts)                               AS last_api_call_at
FROM api_call_log
WHERE user_id IS NOT NULL AND is_admin()
GROUP BY user_id;

CREATE OR REPLACE VIEW admin_connect_status AS
SELECT
  substring(id::text, 1, 6)             AS user_ref,
  id                                    AS raw_id,
  CASE
    WHEN stripe_connect_account_id IS NULL                            THEN 'not_started'
    WHEN stripe_connect_charges_enabled = TRUE
     AND stripe_connect_payouts_enabled = TRUE                        THEN 'completed'
    WHEN stripe_connect_charges_enabled = TRUE
     AND stripe_connect_payouts_enabled = FALSE                       THEN 'charges_only'
    ELSE                                                                   'in_progress'
  END                                   AS connect_state,
  stripe_connect_onboarded_at,
  stripe_connect_charges_enabled,
  stripe_connect_payouts_enabled,
  created_at                            AS signed_up_at,
  (SELECT COUNT(*) FROM properties p WHERE p.manager_id = profiles.id)               AS property_count,
  (SELECT COUNT(*) FROM leases l
     JOIN units u    ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE p.manager_id = profiles.id AND l.status = 'active')                       AS active_lease_count
FROM profiles
WHERE role = 'manager' AND is_admin();

CREATE OR REPLACE VIEW admin_activation_funnel AS
WITH stages AS (
  SELECT
    p.id,
    p.created_at                                AS signed_up_at,
    (SELECT MIN(pr.created_at) FROM properties pr WHERE pr.manager_id = p.id)         AS first_property_at,
    (SELECT MIN(l.created_at)
       FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties pr ON pr.id = u.property_id
       WHERE pr.manager_id = p.id)                                                    AS first_lease_at,
    (SELECT MIN(pay.paid_at)
       FROM payments pay
       JOIN leases l ON l.id = pay.lease_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties pr ON pr.id = u.property_id
       WHERE pr.manager_id = p.id AND pay.status = 'completed')                       AS first_rent_paid_at
  FROM profiles p
  WHERE p.role = 'manager' AND is_admin()
)
SELECT
  COUNT(*)                                                          AS signed_up,
  COUNT(*) FILTER (WHERE first_property_at  IS NOT NULL)            AS added_property,
  COUNT(*) FILTER (WHERE first_lease_at     IS NOT NULL)            AS created_lease,
  COUNT(*) FILTER (WHERE first_rent_paid_at IS NOT NULL)            AS collected_rent
FROM stages;

CREATE OR REPLACE VIEW admin_cohort_retention AS
WITH cohorts AS (
  SELECT
    DATE_TRUNC('week', created_at)::date  AS cohort_week,
    id                                    AS user_id
  FROM profiles
  WHERE created_at >= NOW() - INTERVAL '12 weeks' AND is_admin()
), activity AS (
  SELECT
    user_id,
    DATE_TRUNC('week', ts)::date          AS active_week
  FROM analytics_events
  WHERE user_id IS NOT NULL
    AND ts >= NOW() - INTERVAL '12 weeks'
  GROUP BY user_id, DATE_TRUNC('week', ts)
)
SELECT
  c.cohort_week,
  COUNT(DISTINCT c.user_id)                                                                          AS cohort_size,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week)                             AS week_0,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '1 week')         AS week_1,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '2 weeks')        AS week_2,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '3 weeks')        AS week_3,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '4 weeks')        AS week_4,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '5 weeks')        AS week_5,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '6 weeks')        AS week_6,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_week = c.cohort_week + INTERVAL '7 weeks')        AS week_7
FROM cohorts c
LEFT JOIN activity a ON a.user_id = c.user_id
GROUP BY c.cohort_week
ORDER BY c.cohort_week DESC;

-- admin_users_anon — final form is the one in 20260523000039 (adds lifetime_cost_cents).
CREATE OR REPLACE VIEW admin_users_anon AS
SELECT
  substring(p.id::text, 1, 6) AS user_ref,
  p.id AS raw_id,
  p.role,
  p.created_at AS signed_up_at,
  (SELECT MAX(ts) FROM analytics_events ae WHERE ae.user_id = p.id)                  AS last_seen_at,
  (SELECT COUNT(*) FROM analytics_events ae WHERE ae.user_id = p.id)                 AS event_count,
  (SELECT COUNT(*) FROM properties pr WHERE pr.manager_id = p.id)                    AS property_count,
  (SELECT COUNT(*) FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties pr ON pr.id = u.property_id
     WHERE pr.manager_id = p.id)                                                     AS lease_count,
  COALESCE((SELECT SUM(cost_cents) FROM api_call_log a WHERE a.user_id = p.id), 0)::numeric AS lifetime_cost_cents
FROM profiles p
WHERE is_admin();

-- ── from 20260524000001_visitor_geo.sql (admin-only) ───────────────────

CREATE OR REPLACE VIEW admin_visitor_locations AS
SELECT
  country_code,
  region,
  city,
  latitude,
  longitude,
  COUNT(*)                                       AS event_count,
  COUNT(DISTINCT session_id)                     AS session_count,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS unique_users,
  COUNT(*) FILTER (WHERE event_type = 'page_view') AS page_views,
  COUNT(*) FILTER (WHERE event_type = 'sign_up')   AS sign_ups,
  MAX(ts)                                        AS last_visit_at,
  MIN(ts)                                        AS first_visit_at,
  (
    SELECT ARRAY_AGG(p ORDER BY c DESC)
    FROM (
      SELECT page_path AS p, COUNT(*) AS c
      FROM analytics_events ae2
      WHERE ae2.country_code = ae.country_code
        AND COALESCE(ae2.region, '') = COALESCE(ae.region, '')
        AND COALESCE(ae2.city,   '') = COALESCE(ae.city, '')
        AND ae2.page_path IS NOT NULL
        AND (ae2.user_role IS NULL OR ae2.user_role != 'admin')
      GROUP BY page_path
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) t
  ) AS top_pages
FROM analytics_events ae
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
  AND (user_role IS NULL OR user_role != 'admin')
  AND is_admin()
GROUP BY country_code, region, city, latitude, longitude
ORDER BY MAX(ts) DESC;

-- ── lease_compliance_status (NOT admin-only) ───────────────────────────
-- This view is read by managers AND tenants (compliance widget), so it must
-- NOT be gated on is_admin(). As a plain definer view it bypassed RLS and
-- exposed every lease's compliance/insurance state by lease_id. Switching it
-- to security_invoker makes it respect the leases table's RLS, so a tenant
-- sees only their lease and a manager only theirs — closing the leak without
-- changing the legitimate UI behavior. (Postgres 15+; this DB is major 17.)
ALTER VIEW lease_compliance_status SET (security_invoker = on);
