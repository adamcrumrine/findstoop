-- 036_lease_tenants.sql
-- Adds multi-tenant support on leases via a join table. The existing
-- leases.tenant_id stays as a denormalized "primary tenant" pointer so
-- existing queries keep working; new code reads from lease_tenants for the
-- full lessee list.
--
-- Validation rule (enforced by trigger): a tenant cannot be added to a lease
-- at one property while they're already on an active or pending lease at a
-- different property. They CAN be on multiple leases at the same property
-- (renewals, overlapping co-tenant arrangements).

-- ── 1. Table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lease_tenants (
  lease_id    UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lease_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_lease_tenants_tenant ON lease_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lease_tenants_lease ON lease_tenants(lease_id);

-- ── 2. Backfill from leases.tenant_id ──────────────────────────────────────
INSERT INTO lease_tenants (lease_id, tenant_id, is_primary, sort_order)
SELECT id, tenant_id, TRUE, 0
FROM leases
WHERE tenant_id IS NOT NULL
ON CONFLICT (lease_id, tenant_id) DO NOTHING;

-- ── 3. Validation trigger: prevent cross-property conflicts ────────────────
-- When a tenant is added to lease_tenants, check that they're not already on
-- a different property's active/pending lease. Same property is allowed
-- (renewals, co-tenant additions).
CREATE OR REPLACE FUNCTION public.validate_lease_tenant_no_cross_property()
RETURNS TRIGGER AS $$
DECLARE
  this_property_id UUID;
  conflict_lease_id UUID;
  conflict_property_id UUID;
BEGIN
  -- Resolve the property for the lease being added to.
  SELECT p.id INTO this_property_id
  FROM public.leases l
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE l.id = NEW.lease_id;

  IF this_property_id IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve property for lease %', NEW.lease_id;
  END IF;

  -- Look for the tenant on any active/pending lease at a DIFFERENT property.
  SELECT l.id, p.id
  INTO conflict_lease_id, conflict_property_id
  FROM public.lease_tenants lt
  JOIN public.leases l ON l.id = lt.lease_id
  JOIN public.units u ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE lt.tenant_id = NEW.tenant_id
    AND lt.lease_id <> NEW.lease_id
    AND l.status IN ('active', 'pending')
    AND p.id <> this_property_id
  LIMIT 1;

  IF conflict_lease_id IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant % is already on an active or pending lease at a different property (lease %). They must be removed from that lease first, or the lease must be marked expired/terminated.',
      NEW.tenant_id, conflict_lease_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS lease_tenants_validate_cross_property ON lease_tenants;
CREATE TRIGGER lease_tenants_validate_cross_property
  BEFORE INSERT OR UPDATE ON lease_tenants
  FOR EACH ROW EXECUTE FUNCTION public.validate_lease_tenant_no_cross_property();

-- ── 4. Keep leases.tenant_id in sync as the "primary tenant" ───────────────
-- When the primary tenant row is inserted or flipped, update leases.tenant_id
-- so legacy queries (and the FK relationship used in select queries) keep
-- showing the right person.
CREATE OR REPLACE FUNCTION public.sync_primary_tenant_to_lease()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.leases SET tenant_id = NEW.tenant_id WHERE id = NEW.lease_id;
    -- Ensure only one primary per lease.
    UPDATE public.lease_tenants
      SET is_primary = FALSE
      WHERE lease_id = NEW.lease_id
        AND tenant_id <> NEW.tenant_id
        AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS lease_tenants_sync_primary ON lease_tenants;
CREATE TRIGGER lease_tenants_sync_primary
  AFTER INSERT OR UPDATE OF is_primary ON lease_tenants
  FOR EACH ROW EXECUTE FUNCTION public.sync_primary_tenant_to_lease();

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE lease_tenants ENABLE ROW LEVEL SECURITY;

-- Managers see lease_tenants rows for leases on their properties.
CREATE POLICY "lease_tenants_manager_all" ON lease_tenants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.leases l
      JOIN public.units u ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
      WHERE l.id = lease_tenants.lease_id AND p.manager_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leases l
      JOIN public.units u ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
      WHERE l.id = lease_tenants.lease_id AND p.manager_id = auth.uid()
    )
  );

-- Tenants see their own lease_tenants rows.
CREATE POLICY "lease_tenants_tenant_select_own" ON lease_tenants
  FOR SELECT USING (tenant_id = auth.uid());

-- Admin gets full access (matches existing pattern).
CREATE POLICY "lease_tenants_admin_all" ON lease_tenants
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── 6. Helper: get all tenant IDs for a lease ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_lease_tenant_ids(p_lease_id UUID)
RETURNS SETOF UUID AS $$
  SELECT tenant_id FROM public.lease_tenants
  WHERE lease_id = p_lease_id
  ORDER BY is_primary DESC, sort_order ASC, added_at ASC
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

GRANT EXECUTE ON FUNCTION public.get_lease_tenant_ids(uuid) TO authenticated;
