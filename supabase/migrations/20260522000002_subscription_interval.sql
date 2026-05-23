-- 024_subscription_interval.sql
-- Track which billing cycle a landlord chose (monthly vs annual prepay).
-- Read off the subscription item's price.recurring.interval by the webhook.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_interval TEXT
  CHECK (subscription_interval IS NULL OR subscription_interval IN ('month', 'year'));
