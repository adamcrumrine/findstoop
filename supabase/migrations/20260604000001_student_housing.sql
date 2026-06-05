-- 20260604000001_student_housing.sql
-- "Student Housing mode" — a per-property flag a landlord can self-enable on a
-- student / off-campus rental. When on, that property's tenants get the
-- renter-help tools (lease explainer, know-your-rights, move-in documentation,
-- deposit protection) in their portal — no university partnership required.
--
-- Tenants can already read their own property (properties_tenant_select via
-- get_tenant_property_ids), so this flag is visible to them with no RLS change.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS student_housing BOOLEAN NOT NULL DEFAULT false;
