-- 023_stripe_billing.sql
-- Subscription billing for landlords: $3/unit/mo for units 3-50.
-- First 2 active units are free. Billing is quantity-based (not metered) —
-- we update Stripe SubscriptionItem.quantity whenever paid_units changes.

-- ── Stripe linkage columns on profiles ─────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id         TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id     TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_item_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_quantity      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON profiles(stripe_subscription_id);

-- ── Audit log for webhook events ──────────────────────────────────────────
-- Useful for debugging billing flow, idempotency, and customer support.

CREATE TABLE IF NOT EXISTS billing_events (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id      TEXT         NOT NULL UNIQUE,
  event_type           TEXT         NOT NULL,
  stripe_customer_id   TEXT,
  manager_id           UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  payload              JSONB        NOT NULL,
  processed_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_events_customer ON billing_events(stripe_customer_id);
CREATE INDEX idx_billing_events_manager  ON billing_events(manager_id);
CREATE INDEX idx_billing_events_type     ON billing_events(event_type);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Managers see their own events; admin sees all; nothing else.
CREATE POLICY "billing_events_manager_select" ON billing_events
  FOR SELECT USING (manager_id = auth.uid());

CREATE POLICY "billing_events_admin_all" ON billing_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Helper: count active paid units for a manager ────────────────────────
-- "Active paid units" = active leases on units the manager owns, minus the
-- free quota. Used by edge functions to sync Stripe quantity.

CREATE OR REPLACE FUNCTION public.count_manager_active_units(manager_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.leases l
  JOIN public.units u      ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE p.manager_id = manager_uuid
    AND l.status = 'active'
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION public.count_manager_paid_units(manager_uuid UUID, free_units INTEGER DEFAULT 2)
RETURNS INTEGER AS $$
  SELECT GREATEST(0, count_manager_active_units(manager_uuid) - free_units)
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
