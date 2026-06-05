-- 20260603000004_manager_email_for_lease.sql
-- Helper used by the lifecycle cron to BCC the owning landlord on tenant
-- notifications. Resolves the manager's email for a lease via
-- lease → unit → property → manager profile. SECURITY DEFINER so the cron
-- (service role) can resolve it regardless of RLS.

CREATE OR REPLACE FUNCTION public.manager_email_for_lease(p_lease_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT pr.email
  FROM public.leases l
  JOIN public.units u       ON u.id  = l.unit_id
  JOIN public.properties p  ON p.id  = u.property_id
  JOIN public.profiles pr   ON pr.id = p.manager_id
  WHERE l.id = p_lease_id;
$$;

GRANT EXECUTE ON FUNCTION public.manager_email_for_lease(uuid) TO service_role;
