-- Complimentary-subscription flag: lets specific accounts (e.g. the owner's
-- own dogfooding account) appear paid + active without ever charging Stripe.
-- The paywall RPCs treat a comp account exactly like a paid one.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_complimentary BOOLEAN NOT NULL DEFAULT FALSE;

-- Manager-side: TRUE if they have a paid sub OR are flagged complimentary.
CREATE OR REPLACE FUNCTION public.manager_subscription_active(manager_uuid uuid)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = manager_uuid
      AND (
        subscription_complimentary = TRUE
        OR (stripe_subscription_id IS NOT NULL
            AND subscription_status IN ('active', 'trialing'))
      )
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Tenant-side: same check applied to their landlord's profile.
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
      AND (
        pr.subscription_complimentary = TRUE
        OR (pr.stripe_subscription_id IS NOT NULL
            AND pr.subscription_status IN ('active', 'trialing'))
      )
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
