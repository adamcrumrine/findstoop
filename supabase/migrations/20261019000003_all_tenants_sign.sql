-- 20261019000003_all_tenants_sign.sql
--
-- A lease with several tenants was finalized by the FIRST tenant's signature.
-- finalize_lease_on_dual_signature only asked "has any tenant signed?", so on
-- a 4-roommate lease one roommate plus the landlord flipped it to active and
-- stamped signed_at while three roommates never signed. (The send step only
-- emailed one of them too — notify-tenant-lease-ready, fixed alongside.)
--
-- Who has to sign: the lease's primary tenants in lease_tenants — the
-- manager marks as primary whoever signs the lease (20260525000003). A lease
-- with no primary rows falls back to every lease_tenants row, and a legacy
-- lease with no rows at all to the leases.tenant_id pointer. That is the same
-- order sync_primary_tenant_to_lease uses to pick the pointer.

CREATE OR REPLACE FUNCTION public.lease_required_signer_ids(p_lease_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lt.tenant_id FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary
  UNION
  SELECT lt.tenant_id FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id
     AND NOT EXISTS (SELECT 1 FROM lease_tenants p WHERE p.lease_id = p_lease_id AND p.is_primary)
  UNION
  SELECT l.tenant_id FROM leases l
   WHERE l.id = p_lease_id AND l.tenant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM lease_tenants x WHERE x.lease_id = p_lease_id)
$$;

-- Internal: it answers for any lease id, so keep it away from API callers.
REVOKE EXECUTE ON FUNCTION public.lease_required_signer_ids(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION finalize_lease_on_dual_signature()
RETURNS TRIGGER AS $$
DECLARE
  has_manager_sig     BOOLEAN;
  tenants_outstanding BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM lease_signatures
    WHERE lease_id = NEW.lease_id AND signer_role::text = 'manager'
  ) INTO has_manager_sig;

  -- Every required tenant has a signature of their own on this lease.
  SELECT EXISTS (
    SELECT 1 FROM lease_required_signer_ids(NEW.lease_id) AS req(tenant_id)
     WHERE NOT EXISTS (
       SELECT 1 FROM lease_signatures s
        WHERE s.lease_id = NEW.lease_id
          AND s.signer_id = req.tenant_id
          AND s.signer_role::text = 'tenant'
     )
  ) INTO tenants_outstanding;

  IF has_manager_sig AND NOT tenants_outstanding
     AND EXISTS (SELECT 1 FROM lease_signatures WHERE lease_id = NEW.lease_id AND signer_role::text = 'tenant') THEN
    UPDATE leases
       SET signed_at = COALESCE(signed_at, NOW()),
           status    = CASE WHEN status = 'pending' THEN 'active'::lease_status ELSE status END
     WHERE id = NEW.lease_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Per-tenant signing status for the sign page and the lease cards. Tenants
-- can only read their own lease_tenants row, so a roommate couldn't otherwise
-- see who else still has to sign. Returns rows only for leases the caller is
-- a party to, manages (directly or through a team), or as admin.
CREATE OR REPLACE FUNCTION public.lease_signing_status(p_lease_ids UUID[])
RETURNS TABLE (lease_id UUID, tenant_id UUID, full_name TEXT, email TEXT, signed_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, req.tenant_id, pr.full_name, pr.email, s.signed_at
    FROM unnest(p_lease_ids) AS l(id)
   CROSS JOIN LATERAL lease_required_signer_ids(l.id) AS req(tenant_id)
    LEFT JOIN profiles pr ON pr.id = req.tenant_id
    LEFT JOIN lease_signatures s
      ON s.lease_id = l.id AND s.signer_id = req.tenant_id AND s.signer_role::text = 'tenant'
   WHERE caller_can_access_lease(l.id)
      OR l.id IN (SELECT get_team_lease_ids(auth.uid()))
$$;

GRANT EXECUTE ON FUNCTION public.lease_signing_status(UUID[]) TO authenticated;
