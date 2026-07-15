-- 20260714000002_lease_is_student.sql
-- Per-lease "student lease" marking. A manager can flip a single tenant's lease
-- to a student lease WITHOUT turning the whole property into Student Housing
-- mode (properties.student_housing) and without a university subdomain. When
-- on, that tenant gets the renter-help tools (lease explainer, know-your-rights,
-- move-in documentation, deposit protection) in their portal.
--
-- Additive + non-breaking: the web client reads this column tolerantly (it
-- selects `*` and treats a missing/undefined value as false), so the app runs
-- fine before AND after this migration is applied.
--
-- RLS: no change needed. The manager UPDATE policy on leases
-- (leases_manager_update, see 20260321000016_fix_rls_recursion.sql) is
--   USING (id IN (SELECT get_manager_lease_ids(auth.uid())))
-- with no column restriction, so a manager who owns the lease can already set
-- this column. Tenants have SELECT only (leases_tenant_select) — they read it,
-- they can't write it. The document_url-protection trigger fires only on
-- UPDATE OF document_url, so toggling is_student never trips it.

ALTER TABLE leases ADD COLUMN IF NOT EXISTS is_student BOOLEAN NOT NULL DEFAULT false;
