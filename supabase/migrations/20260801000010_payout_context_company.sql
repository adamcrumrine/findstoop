-- 20260801000010_payout_context_company.sql
--
-- Tenants were seeing the PLATFORM's Stripe account name on their bank
-- statement for a rent payment — a company they have no relationship with.
-- An unrecognised descriptor is the most common trigger for ACH returns
-- ($4 each) and card disputes ($15 each), quite apart from the alarm of
-- seeing a stranger's name take rent out of your account.
--
-- The charge-creating functions need the landlord's display name to set a
-- descriptor the tenant will actually recognise, so return it here rather
-- than making every caller do a second lookup.

-- Adding OUT columns changes the row type, which CREATE OR REPLACE can't do.
DROP FUNCTION IF EXISTS public.lease_payout_context(UUID);

CREATE OR REPLACE FUNCTION public.lease_payout_context(lease_uuid UUID)
RETURNS TABLE(
  manager_id            UUID,
  subscription_tier     TEXT,
  connect_account_id    TEXT,
  charges_enabled       BOOLEAN,
  company_name          TEXT,
  manager_name          TEXT
) AS $$
  SELECT
    prop.manager_id,
    mp.subscription_tier,
    mp.stripe_connect_account_id,
    mp.stripe_connect_charges_enabled,
    mp.company_name,
    mp.full_name
  FROM public.leases l
  JOIN public.units      u    ON u.id    = l.unit_id
  JOIN public.properties prop ON prop.id = u.property_id
  JOIN public.profiles   mp   ON mp.id   = prop.manager_id
  WHERE l.id = lease_uuid
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
