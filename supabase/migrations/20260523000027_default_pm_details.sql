-- Cache the saved payment method's identifying details on the tenant's
-- profile so the UI can show "Bank account · …4321" or "Visa · …4242"
-- without re-querying Stripe on every page load. The setup_intent.succeeded
-- webhook populates these from the PaymentMethod that was just attached.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_default_pm_type      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_default_pm_brand     TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_default_pm_last4     TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_default_pm_bank_name TEXT;
