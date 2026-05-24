-- Lease-level compliance: Fair Housing notice acknowledgment, EPA lead-paint
-- disclosure for pre-1978 properties, and renter's insurance tracking.
--
-- Federal compliance basics:
--   • Fair Housing Act notice — informational, given to every tenant.
--     Acknowledgment timestamp is a paper trail, not legally required.
--   • Lead-Based Paint disclosure — REQUIRED by federal law (24 CFR 35.92)
--     for any residential property built before 1978. Landlord declares
--     known LBP status, tenant acknowledges receipt, both sign.
--   • Renter's insurance — common lease term; we standardize to 90 days
--     from lease start. Tracked here so manager + tenant both see status.

ALTER TABLE leases
  -- Lead disclosure (federal requirement for pre-1978 housing)
  ADD COLUMN IF NOT EXISTS property_built_before_1978       BOOLEAN,        -- NULL = manager hasn't set yet; FALSE = no LBP required; TRUE = LBP required
  ADD COLUMN IF NOT EXISTS lead_known                        BOOLEAN,        -- landlord's declaration: TRUE = known LBP present; FALSE/NULL = no known LBP ("negative" disclosure)
  ADD COLUMN IF NOT EXISTS lead_disclosure_details           TEXT,           -- landlord notes — e.g. "previous inspection 2018 found no LBP"
  ADD COLUMN IF NOT EXISTS lead_disclosure_landlord_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_disclosure_landlord_signature TEXT,
  ADD COLUMN IF NOT EXISTS lead_disclosure_tenant_signed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_disclosure_tenant_signature   TEXT,

  -- Fair Housing notice (informational; we record viewed/printed timestamp)
  ADD COLUMN IF NOT EXISTS fair_housing_acknowledged_at      TIMESTAMPTZ,

  -- Renter's insurance — tenant uploads certificate within 90d of lease start
  ADD COLUMN IF NOT EXISTS insurance_required                BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS insurance_proof_url               TEXT,        -- storage path
  ADD COLUMN IF NOT EXISTS insurance_uploaded_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insurance_carrier                 TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy_number           TEXT,
  ADD COLUMN IF NOT EXISTS insurance_coverage_amount         NUMERIC,     -- USD
  ADD COLUMN IF NOT EXISTS insurance_expires_at              DATE;

COMMENT ON COLUMN leases.property_built_before_1978 IS
  'When TRUE, federal LBP disclosure is required (24 CFR 35.92). Manager sets this when reviewing the lease.';
COMMENT ON COLUMN leases.lead_known IS
  'Landlord''s declaration. FALSE/NULL produces the "no known lead-based paint" (negative) disclosure. TRUE requires additional disclosure of locations and remediation history.';

-- Helper view: rolls up compliance status per lease so the UI can ask one
-- question and get a clear answer without recomputing logic in JS.
CREATE OR REPLACE VIEW lease_compliance_status AS
SELECT
  l.id AS lease_id,
  l.tenant_id,

  -- Lead disclosure
  l.property_built_before_1978,
  CASE
    WHEN l.property_built_before_1978 IS NULL                      THEN 'not_set'         -- manager hasn't decided
    WHEN l.property_built_before_1978 = FALSE                      THEN 'not_required'    -- post-1978, no LBP form needed
    WHEN l.lead_disclosure_landlord_signed_at IS NULL              THEN 'landlord_pending'
    WHEN l.lead_disclosure_tenant_signed_at   IS NULL              THEN 'tenant_pending'
    ELSE                                                                'signed'
  END AS lead_disclosure_state,

  -- Fair Housing
  CASE
    WHEN l.fair_housing_acknowledged_at IS NOT NULL                THEN 'acknowledged'
    ELSE                                                                'pending'
  END AS fair_housing_state,

  -- Renter's insurance — 90-day clock from lease start
  l.insurance_required,
  l.insurance_proof_url,
  l.insurance_uploaded_at,
  l.insurance_expires_at,
  (l.start_date + INTERVAL '90 days')::date AS insurance_due_date,
  CASE
    WHEN l.insurance_required = FALSE                              THEN 'not_required'
    WHEN l.insurance_proof_url IS NOT NULL
      AND (l.insurance_expires_at IS NULL OR l.insurance_expires_at > CURRENT_DATE)
                                                                   THEN 'uploaded'
    WHEN l.insurance_proof_url IS NOT NULL
      AND l.insurance_expires_at <= CURRENT_DATE                   THEN 'expired'
    WHEN CURRENT_DATE > (l.start_date + INTERVAL '90 days')::date  THEN 'overdue'
    ELSE                                                                'pending'
  END AS insurance_state,
  GREATEST(0, ((l.start_date + INTERVAL '90 days')::date - CURRENT_DATE)) AS insurance_days_remaining
FROM leases l;

-- ── Storage bucket for insurance certificates ─────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('insurance-documents', 'insurance-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read + write within this bucket. The path pattern
-- is `{lease_id}/insurance-{ts}.{ext}` and access is gated by the lease RLS
-- separately (only manager + tenant on the lease can see the path via the
-- lease row in the first place).
DROP POLICY IF EXISTS insurance_docs_read ON storage.objects;
CREATE POLICY insurance_docs_read ON storage.objects
  FOR SELECT USING (bucket_id = 'insurance-documents' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS insurance_docs_write ON storage.objects;
CREATE POLICY insurance_docs_write ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'insurance-documents' AND auth.uid() IS NOT NULL);
