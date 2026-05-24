-- Admin operations + growth-metrics views.
--
-- These views are reads-only for the admin role; they piggyback on existing
-- tables (no schema additions) and stay PII-safe by surfacing only counts,
-- amounts, and 6-character user refs.

-- ── 1. Stuck screening orders ──────────────────────────────────────────
-- Orders that paid but haven't reached a terminal state in a reasonable
-- amount of time. Useful for surfacing "the pipeline is jammed" or
-- "this applicant abandoned mid-upload."
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
  -- Bucket: collecting > 24h means applicant abandoned the doc upload;
  -- scoring > 10min means our pipeline is jammed
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
ORDER BY so.paid_at DESC;


-- ── 2. Subscription health ────────────────────────────────────────────
-- Single-row snapshot of the manager-subscription business.
-- Active MRR normalizes annual subs to monthly ($9/unit/mo monthly,
-- $90/unit/yr ÷ 12 = $7.50/unit/mo for annual).
CREATE OR REPLACE VIEW admin_subscription_health AS
SELECT
  -- Total active subs (excludes comp accounts from MRR but counts them separately)
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
  -- MRR — sum of monthly equivalents
  (SELECT COALESCE(SUM(
     CASE
       WHEN subscription_interval = 'year' THEN (subscription_quantity * 750)         -- $7.50/unit/mo in cents
       ELSE                                       (subscription_quantity * 900)        -- $9/unit/mo in cents
     END
   ), 0)
   FROM profiles
   WHERE role = 'manager'
     AND subscription_status IN ('active', 'trialing')
     AND COALESCE(subscription_complimentary, FALSE) = FALSE
  )                                                                                  AS mrr_cents,
  -- Units under management on paying subs
  (SELECT COALESCE(SUM(subscription_quantity), 0)
     FROM profiles
     WHERE role = 'manager'
       AND subscription_status IN ('active', 'trialing')
       AND COALESCE(subscription_complimentary, FALSE) = FALSE
  )                                                                                  AS paid_units,
  -- New + canceled this week
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager'
       AND subscription_status IN ('active', 'trialing')
       AND created_at >= NOW() - INTERVAL '7 days'
  )                                                                                  AS new_subs_7d,
  (SELECT COUNT(*) FROM profiles
     WHERE role = 'manager'
       AND subscription_status = 'canceled'
       AND subscription_current_period_end >= NOW() - INTERVAL '30 days'
  )                                                                                  AS canceled_30d;


-- ── 3. Plan distribution (for the pie chart) ──────────────────────────
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
WHERE role = 'manager'
GROUP BY 1
ORDER BY manager_count DESC;


-- ── 4. Cost per user ──────────────────────────────────────────────────
-- Aggregates api_call_log.cost_cents per user (NULL user_id ⇒ excluded —
-- platform-level calls have no per-user attribution).
CREATE OR REPLACE VIEW admin_user_costs AS
SELECT
  user_id,
  substring(user_id::text, 1, 6)        AS user_ref,
  COUNT(*)                              AS call_count,
  COALESCE(SUM(cost_cents), 0)::numeric AS total_cost_cents,
  COUNT(*) FILTER (WHERE status_code >= 400) AS error_count,
  MAX(ts)                               AS last_api_call_at
FROM api_call_log
WHERE user_id IS NOT NULL
GROUP BY user_id;


-- ── 5. Stripe Connect onboarding status ───────────────────────────────
-- Buckets every manager by where they are in the Connect funnel. A manager
-- can't collect rent through us until charges_enabled = true.
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
  -- How many properties / active leases this manager has — gives priority
  -- (a manager with 5 leases stuck without Connect is high-pri)
  (SELECT COUNT(*) FROM properties p WHERE p.manager_id = profiles.id)               AS property_count,
  (SELECT COUNT(*) FROM leases l
     JOIN units u    ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE p.manager_id = profiles.id AND l.status = 'active')                       AS active_lease_count
FROM profiles
WHERE role = 'manager';


-- ── 6. Activation funnel (manager journey) ────────────────────────────
-- Stages: signed_up → first_property → first_lease → first_rent_paid.
-- Each stage's count + conversion-rate-from-previous-stage are computed
-- in the view; the page renders them as a horizontal funnel bar chart.
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
  WHERE p.role = 'manager'
)
SELECT
  COUNT(*)                                                          AS signed_up,
  COUNT(*) FILTER (WHERE first_property_at  IS NOT NULL)            AS added_property,
  COUNT(*) FILTER (WHERE first_lease_at     IS NOT NULL)            AS created_lease,
  COUNT(*) FILTER (WHERE first_rent_paid_at IS NOT NULL)            AS collected_rent
FROM stages;


-- ── 7. Cohort retention (weekly) ──────────────────────────────────────
-- For each ISO-week signup cohort, what % had any analytics_events activity
-- in each subsequent week (0..7). Limited to the last 8 cohorts so the
-- result stays small and the UI renders fast.
CREATE OR REPLACE VIEW admin_cohort_retention AS
WITH cohorts AS (
  SELECT
    DATE_TRUNC('week', created_at)::date  AS cohort_week,
    id                                    AS user_id
  FROM profiles
  WHERE created_at >= NOW() - INTERVAL '12 weeks'
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


-- ── 8. Extend admin_users_anon with cost data ─────────────────────────
-- Re-create the existing view to include per-user lifetime cost.
DROP VIEW IF EXISTS admin_users_anon;
CREATE VIEW admin_users_anon AS
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
FROM profiles p;
