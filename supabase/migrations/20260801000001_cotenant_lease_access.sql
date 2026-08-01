-- 20260801000001_cotenant_lease_access.sql
--
-- Co-tenants could not see their own lease.
--
-- Since 20260525000003_multi_primary_tenants, lease membership lives in
-- `lease_tenants` (any/all roommates can be primary) and `leases.tenant_id`
-- is explicitly a LEGACY pointer kept only "for backward compat with RLS /
-- older queries" — it holds exactly ONE tenant id per lease.
--
-- Every tenant-facing RLS policy and helper was still matching on that legacy
-- pointer, so on a 4-roommate lease only the single pointed-at tenant could
-- read the lease row. The other three got zero rows from `leases`, which in
-- the app surfaced as "No active lease yet" and a dead Pay Rent button
-- (PayRent bails on `!lease`), and would also have failed the subscription
-- paywall once the lease was signed.
--
-- Fix: one SECURITY DEFINER predicate, `is_lease_party()`, that accepts EITHER
-- the legacy pointer or any lease_tenants membership row. SECURITY DEFINER is
-- required so the lease_tenants lookup isn't itself filtered by that table's
-- own RLS. Then repoint every tenant-side policy/helper at it.
--
-- Payments RLS is deliberately NOT changed: each roommate has their own
-- payments rows (rent is split per tenant), so `tenant_id = auth.uid()` is
-- already correct there and must stay narrow.

-- ── Shared predicate ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_lease_party(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leases l
     WHERE l.id = p_lease_id AND l.tenant_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.tenant_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_lease_party(UUID) IS
  'True when the current user is a party to the lease — either the legacy leases.tenant_id pointer or any lease_tenants membership row. Use this instead of comparing leases.tenant_id directly, which only ever matches one roommate.';

GRANT EXECUTE ON FUNCTION public.is_lease_party(UUID) TO authenticated;

-- ── leases: the row that was actually blocking the portal ───────────────────
DROP POLICY IF EXISTS "leases_tenant_select" ON leases;
CREATE POLICY "leases_tenant_select" ON leases
  FOR SELECT USING (public.is_lease_party(id));

-- ── Manager/tenant lease access helper (inspections, addenda, photo hashes) ──
CREATE OR REPLACE FUNCTION public.caller_can_access_lease(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM leases l
    LEFT JOIN units u      ON u.id = l.unit_id
    LEFT JOIN properties p ON p.id = u.property_id
    WHERE l.id = p_lease_id
      AND (p.manager_id = auth.uid() OR l.tenant_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.tenant_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── Subscription paywall gate ───────────────────────────────────────────────
-- Same bug: a co-tenant on a signed lease would be told their landlord hadn't
-- finished setup. Keeps the 'upcoming' status from 20260526000002.
CREATE OR REPLACE FUNCTION public.tenant_landlord_subscription_active()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.properties p ON p.id = u.property_id
    JOIN public.profiles pr ON pr.id = p.manager_id
    WHERE public.is_lease_party(l.id)
      AND l.status IN ('active', 'pending', 'upcoming')
      AND (
        pr.subscription_complimentary = TRUE
        OR (pr.stripe_subscription_id IS NOT NULL
            AND pr.subscription_status IN ('active', 'trialing'))
      )
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- ── Lease-scoped documents the tenant is entitled to ────────────────────────
DROP POLICY IF EXISTS "documents_tenant_select" ON documents;
CREATE POLICY "documents_tenant_select" ON documents
  FOR SELECT USING (lease_id IS NOT NULL AND public.is_lease_party(lease_id));

DROP POLICY IF EXISTS "lease_signatures_tenant_select" ON lease_signatures;
CREATE POLICY "lease_signatures_tenant_select" ON lease_signatures
  FOR SELECT USING (public.is_lease_party(lease_id));

DROP POLICY IF EXISTS "utility_bills_tenant_select" ON utility_bills;
CREATE POLICY "utility_bills_tenant_select" ON utility_bills
  FOR SELECT USING (public.is_lease_party(lease_id));

-- utilities is keyed by unit, not lease — resolve through the active lease.
DROP POLICY IF EXISTS "utilities_tenant_select" ON utilities;
CREATE POLICY "utilities_tenant_select" ON utilities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
       WHERE l.unit_id = utilities.unit_id
         AND l.status = 'active'::lease_status
         AND public.is_lease_party(l.id)
    )
  );
