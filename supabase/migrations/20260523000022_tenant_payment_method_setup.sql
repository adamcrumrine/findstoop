-- Tracks when a tenant first successfully attached a payment method, so the
-- dashboard can show "Requires payment setup" for any payment that's still
-- pending when this is NULL. That label trumps "Upcoming" / "Past due" — we
-- can't expect a tenant to be on track if they've never set up Stripe.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_method_setup_at TIMESTAMPTZ;
