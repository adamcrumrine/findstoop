-- 035_billing_active_rpcs.sql
-- Helpers to check whether a manager's FindStoop subscription is active.
-- Used to gate features behind the paywall (formatted PDF, tenant portal
-- features against an executed lease, etc).
--
-- Both functions return TRUE only when the manager has a valid Stripe
-- subscription with status 'active' or 'trialing'. SECURITY DEFINER lets
-- callers see just this boolean without exposing the full profile row.

CREATE OR REPLACE FUNCTION public.manager_subscription_active(manager_uuid uuid)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = manager_uuid
      AND stripe_subscription_id IS NOT NULL
      AND subscription_status IN ('active', 'trialing')
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- For tenants: resolve their property's manager and report whether that
-- manager's subscription is active. Returns false if the tenant has no
-- active lease, or the landlord hasn't subscribed.
CREATE OR REPLACE FUNCTION public.tenant_landlord_subscription_active()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.properties p ON p.id = u.property_id
    JOIN public.profiles pr ON pr.id = p.manager_id
    WHERE l.tenant_id = auth.uid()
      AND l.status IN ('active', 'pending')
      AND pr.stripe_subscription_id IS NOT NULL
      AND pr.subscription_status IN ('active', 'trialing')
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

GRANT EXECUTE ON FUNCTION public.manager_subscription_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_landlord_subscription_active() TO authenticated;
