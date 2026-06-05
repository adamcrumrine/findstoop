-- 20260603000003_admin_renter_check.sql
-- Admin leads + attribution views for Renter Check.
--
-- Same gating pattern as the other admin_* views (20260528000002): definer
-- views that bypass RLS but carry a `WHERE is_admin()` clause, so non-admins
-- get ZERO rows while admins read the full set. Read from the browser with the
-- admin's JWT via supabase.from('admin_renter_check_*').
--
-- PII posture: the LANDLORD is the conversion lead, so landlord name/email are
-- exposed. The RENTER's email is personal (captured only to email them their
-- own summary), so it is masked to a boolean — never surfaced in the admin UI.

-- Per-school rollup (attribution): how each ?ref= channel is performing.
CREATE OR REPLACE VIEW admin_renter_check_by_school AS
SELECT
  COALESCE(referral_source, '(direct)')                                          AS school,
  COUNT(*)                                                                        AS total,
  COUNT(*) FILTER (WHERE landlord_email IS NOT NULL)                              AS with_landlord,
  COUNT(*) FILTER (WHERE matched_manager_id IS NOT NULL)                          AS on_platform,
  COUNT(*) FILTER (WHERE matched_manager_id IS NULL AND landlord_email IS NOT NULL) AS convertible,
  COUNT(*) FILTER (WHERE landlord_invited_at IS NOT NULL)                         AS invited,
  COUNT(*) FILTER (WHERE emailed_summary_at IS NOT NULL)                          AS emailed,
  COUNT(*) FILTER (WHERE tenant_email IS NOT NULL)                                AS tenant_leads,
  ROUND(AVG(red_flag_count)::numeric, 1)                                          AS avg_red_flags,
  MAX(created_at)                                                                 AS last_at
FROM lease_analyses
WHERE is_admin()
GROUP BY COALESCE(referral_source, '(direct)')
ORDER BY total DESC;

-- Workable leads list. Renter email masked to a boolean; full analysis JSON
-- omitted (only the short summary is exposed).
CREATE OR REPLACE VIEW admin_renter_check_leads AS
SELECT
  id,
  created_at,
  COALESCE(referral_source, '(direct)')   AS school,
  state_detected,
  landlord_name,
  landlord_email,
  property_address,
  red_flag_count,
  high_flag_count,
  (matched_manager_id IS NOT NULL)        AS on_platform,
  (landlord_invited_at IS NOT NULL)       AS invited,
  (emailed_summary_at IS NOT NULL)        AS summary_emailed,
  (tenant_email IS NOT NULL)              AS tenant_lead_captured,
  summary
FROM lease_analyses
WHERE is_admin()
ORDER BY created_at DESC;
