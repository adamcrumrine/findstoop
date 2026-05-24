-- Capture coarse visitor geolocation on every analytics event so the admin
-- dashboard can plot a "where's traffic coming from" map and surface the
-- city/state alongside each event in the activity table.
--
-- City-level resolution from a free IP-geo service (ipapi.co). Not PII —
-- "Columbus, OH" describes thousands of people. Stored against the event,
-- never linked back to a specific household.

ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS region    TEXT,    -- 2-letter ISO subdivision (e.g. 'OH')
  ADD COLUMN IF NOT EXISTS city      TEXT,
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC, -- approximate, IP-derived
  ADD COLUMN IF NOT EXISTS longitude NUMERIC;

CREATE INDEX IF NOT EXISTS idx_ae_geo ON analytics_events (country_code, region, city);
CREATE INDEX IF NOT EXISTS idx_ae_latlng ON analytics_events (latitude, longitude) WHERE latitude IS NOT NULL;


-- Aggregated locations view — one row per unique location with the count
-- of visits and the last time someone hit the platform from there. Used
-- to drive the map markers + the right-side detail list.
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
  -- Top 5 page paths from this location — gives admin a sense of what
  -- the visitor was looking at without exposing individuals
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
GROUP BY country_code, region, city, latitude, longitude
ORDER BY MAX(ts) DESC;
