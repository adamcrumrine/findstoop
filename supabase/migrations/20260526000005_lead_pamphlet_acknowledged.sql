-- 20260526000005_lead_pamphlet_acknowledged.sql
--
-- The EPA Lead-Based Paint Pamphlet is a view-only federal disclosure
-- (24 CFR 35.92). Until now we tracked no acknowledgment for it — the
-- tenant could open it but the UI had no way to flip the icon green and
-- show a checkmark. Mirror the fair_housing_acknowledged_at pattern.

ALTER TABLE public.leases
  ADD COLUMN IF NOT EXISTS lead_pamphlet_acknowledged_at TIMESTAMPTZ;

-- Extend the compliance view so the tenant widget can read it.
-- CREATE OR REPLACE can't reorder/insert columns — drop and recreate.
DROP VIEW IF EXISTS public.lease_compliance_status;
CREATE VIEW public.lease_compliance_status AS
SELECT id AS lease_id,
    tenant_id,
    property_built_before_1978,
    CASE
        WHEN property_built_before_1978 IS NULL THEN 'not_set'::text
        WHEN property_built_before_1978 = false THEN 'not_required'::text
        WHEN lead_disclosure_landlord_signed_at IS NULL THEN 'landlord_pending'::text
        WHEN lead_disclosure_tenant_signed_at IS NULL THEN 'tenant_pending'::text
        ELSE 'signed'::text
    END AS lead_disclosure_state,
    CASE
        WHEN fair_housing_acknowledged_at IS NOT NULL THEN 'acknowledged'::text
        ELSE 'pending'::text
    END AS fair_housing_state,
    CASE
        WHEN property_built_before_1978 IS NOT TRUE THEN 'not_required'::text
        WHEN lead_pamphlet_acknowledged_at IS NOT NULL THEN 'acknowledged'::text
        ELSE 'pending'::text
    END AS lead_pamphlet_state,
    insurance_required,
    insurance_proof_url,
    insurance_uploaded_at,
    insurance_expires_at,
    (start_date + '90 days'::interval)::date AS insurance_due_date,
    CASE
        WHEN insurance_required = false THEN 'not_required'::text
        WHEN insurance_proof_url IS NOT NULL AND (insurance_expires_at IS NULL OR insurance_expires_at > CURRENT_DATE) THEN 'uploaded'::text
        WHEN insurance_proof_url IS NOT NULL AND insurance_expires_at <= CURRENT_DATE THEN 'expired'::text
        WHEN CURRENT_DATE > (start_date + '90 days'::interval)::date THEN 'overdue'::text
        ELSE 'pending'::text
    END AS insurance_state,
    GREATEST(0, (start_date + '90 days'::interval)::date - CURRENT_DATE) AS insurance_days_remaining
  FROM leases;
