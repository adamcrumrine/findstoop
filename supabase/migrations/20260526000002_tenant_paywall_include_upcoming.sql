-- 20260526000002_tenant_paywall_include_upcoming.sql
--
-- Fix: tenant_landlord_subscription_active() was written when leases
-- only had 'active' and 'pending' statuses. We later introduced
-- 'upcoming' (signed lease, future start date), and that change wasn't
-- reflected here. Result: a tenant whose only signed lease is in the
-- upcoming state hits the paywall gate even though their landlord has a
-- valid (or complimentary) subscription.
--
-- Fix: include 'upcoming' in the lease status set. The status set now
-- covers every state where the tenant has a real, signed lease and
-- should see the portal.

CREATE OR REPLACE FUNCTION public.tenant_landlord_subscription_active()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.units u ON u.id = l.unit_id
    JOIN public.properties p ON p.id = u.property_id
    JOIN public.profiles pr ON pr.id = p.manager_id
    WHERE l.tenant_id = auth.uid()
      AND l.status IN ('active', 'pending', 'upcoming')
      AND (
        pr.subscription_complimentary = TRUE
        OR (pr.stripe_subscription_id IS NOT NULL
            AND pr.subscription_status IN ('active', 'trialing'))
      )
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
