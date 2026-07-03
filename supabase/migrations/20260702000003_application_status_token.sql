-- 20260702000003_application_status_token.sql
-- Public applicant status tracker (/application-status/:token).
--
-- The apply flow goes dark after submit, so applicants email the landlord
-- "did you get it?". Each application now carries an unguessable status
-- token; the landlord copies the link from the Applications page and the
-- applicant watches a coarse received → review → screening → decision
-- stepper instead of emailing.
--
-- Token follows the screening_orders.access_token pattern (20260528000004):
-- two gen_random_uuid()s with dashes stripped (~244 bits of entropy). Lookup
-- is token-only — no id/email enumeration path exists.
--
-- STRICT data minimization: the RPC below is the ONLY public read keyed by
-- this token, and it returns ONLY the applicant's first name, the
-- property/unit display label, the submitted date, a coarse derived status,
-- and the landlord's three public branding columns (the exact set
-- get_unit_public_brand, 20260702000001, already exposes to anonymous
-- applicants). Never SSN/DOB/income/screening results/notes/other applicants.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS status_token TEXT
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Backfill rows that predate the default.
UPDATE applications
  SET status_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  WHERE status_token IS NULL;

ALTER TABLE applications ALTER COLUMN status_token SET NOT NULL;

-- The token is the public lookup key — unique index makes the RPC an index
-- hit and guarantees one row per link.
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_status_token
  ON applications(status_token);

-- ── Public status RPC ───────────────────────────────────────────────────────
-- Coarse status derivation (honest mapping from real columns):
--   applications.status withdrawn/approved/declined      → that decision
--   screening_status requested|in_progress, OR any
--     screening_orders row collecting|scoring             → screening_in_progress
--   status under_review, OR reviewed_at set, OR screening
--     finished (complete|failed on either column/table)   → under_review
--   otherwise (fresh submission)                          → received
-- 'awaiting_payment' screening orders do NOT count as in-progress — the
-- applicant never started, so the landlord is simply still reviewing.
--
-- Revocation: an archived-but-undecided application is a dead link — it
-- returns the same empty result as an unknown token, so callers cannot tell
-- missing from revoked. Decided applications stay visible after archiving
-- (housekeeping must not yank the applicant's answer).

CREATE OR REPLACE FUNCTION get_application_public_status(p_token text)
RETURNS TABLE (
  first_name       text,
  property_name    text,
  unit_number      text,
  submitted_at     timestamptz,
  status           text,
  company_name     text,
  company_logo_url text,
  brand_color      text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.first_name,
    p.name,
    u.unit_number,
    a.submitted_at,
    CASE
      WHEN a.status = 'withdrawn' THEN 'withdrawn'
      WHEN a.status = 'approved'  THEN 'approved'
      WHEN a.status = 'declined'  THEN 'declined'
      WHEN a.screening_status IN ('requested', 'in_progress')
        OR EXISTS (
          SELECT 1 FROM screening_orders so
          WHERE so.application_id = a.id AND so.state IN ('collecting', 'scoring')
        )
        THEN 'screening_in_progress'
      WHEN a.status = 'under_review'
        OR a.reviewed_at IS NOT NULL
        OR a.screening_status IN ('complete', 'failed')
        OR EXISTS (
          SELECT 1 FROM screening_orders so
          WHERE so.application_id = a.id AND so.state IN ('complete', 'failed')
        )
        THEN 'under_review'
      ELSE 'received'
    END,
    pr.company_name,
    pr.company_logo_url,
    pr.brand_color
  FROM applications a
  JOIN units u      ON u.id = a.unit_id
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN profiles pr ON pr.id = p.manager_id
  WHERE a.status_token = p_token
    AND NOT (a.archived_at IS NOT NULL AND a.status IN ('submitted', 'under_review'))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_application_public_status(text) TO anon, authenticated;
