-- Admin's own activity shouldn't pollute the analytics — admin browsing
-- around the admin dashboard would inflate DAU/WAU/MAU and clutter the
-- activity feed. We exclude at the source (client-side trackEvent skips
-- when user_role='admin'), but we also filter in the views as a backstop
-- in case any historical admin events landed.

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
  -- DAU/WAU/MAU — exclude admin role from the engagement counts
  (SELECT COUNT(DISTINCT user_id) FROM analytics_events
     WHERE ts >= NOW() - INTERVAL '24 hours' AND user_id IS NOT NULL
       AND (user_role IS NULL OR user_role != 'admin')) AS dau,
  (SELECT COUNT(DISTINCT user_id) FROM analytics_events
     WHERE ts >= NOW() - INTERVAL '7 days'   AND user_id IS NOT NULL
       AND (user_role IS NULL OR user_role != 'admin')) AS wau,
  (SELECT COUNT(DISTINCT user_id) FROM analytics_events
     WHERE ts >= NOW() - INTERVAL '30 days'  AND user_id IS NOT NULL
       AND (user_role IS NULL OR user_role != 'admin')) AS mau,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '24 hours' AND role != 'admin')  AS signups_24h,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days'   AND role != 'admin')  AS signups_7d,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '30 days'  AND role != 'admin')  AS signups_30d;


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
  AND (user_role IS NULL OR user_role != 'admin')
GROUP BY date_trunc('day', ts)
ORDER BY day DESC;
