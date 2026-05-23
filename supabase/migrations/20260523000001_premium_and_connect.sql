-- 027_premium_and_connect.sql
-- 1. Premium tier flag on profiles — drives renter-fee absorption logic.
-- 2. Stripe Connect account ref + onboarding status — moves landlords to
--    being the merchant of record for rent payments (fixes the ACH-fee leak).

-- ── Premium tier ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT
  NOT NULL DEFAULT 'standard'
  CHECK (subscription_tier IN ('standard', 'premium'));

-- ── Stripe Connect ───────────────────────────────────────────────────────
-- Each landlord onboards their own Stripe Express account. When a tenant
-- pays rent, money is destination-charged straight to the landlord's
-- account; we take only the subscription / platform fee.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect ON profiles(stripe_connect_account_id);

-- Helper: look up the landlord whose property a given lease belongs to,
-- plus their tier / Connect info. Used by the rent payment edge function
-- to decide surcharge behavior and which Connect account to charge to.

CREATE OR REPLACE FUNCTION public.lease_payout_context(lease_uuid UUID)
RETURNS TABLE(
  manager_id            UUID,
  subscription_tier     TEXT,
  connect_account_id    TEXT,
  charges_enabled       BOOLEAN
) AS $$
  SELECT
    prop.manager_id,
    mp.subscription_tier,
    mp.stripe_connect_account_id,
    mp.stripe_connect_charges_enabled
  FROM public.leases l
  JOIN public.units      u    ON u.id    = l.unit_id
  JOIN public.properties prop ON prop.id = u.property_id
  JOIN public.profiles   mp   ON mp.id   = prop.manager_id
  WHERE l.id = lease_uuid
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
