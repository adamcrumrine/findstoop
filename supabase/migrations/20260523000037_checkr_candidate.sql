-- Checkr Direct integration — track candidate separately from report.
--
-- Checkr's model:
--   • Candidate = the person being screened, carries SSN + identity
--   • Report   = a specific screening run against a candidate
-- We create the candidate as soon as the applicant submits their SSN (so
-- the SSN flows applicant → our edge fn → Checkr without ever landing in
-- our DB). We create the report only after the applicant pays.

ALTER TABLE screening_orders
  ADD COLUMN IF NOT EXISTS checkr_candidate_id TEXT;

COMMENT ON COLUMN screening_orders.checkr_candidate_id IS
  'Checkr candidate id (created at SSN-submission time). The applicant SSN itself is NEVER stored in our database — it is forwarded directly to Checkr, which holds it under their FCRA + SOC-2 compliance posture.';

COMMENT ON COLUMN screening_orders.checkr_report_id IS
  'Checkr report id (created post-payment). Lifecycle: pending → consider/clear/suspended. Webhook-driven updates land in checkr_data.';
