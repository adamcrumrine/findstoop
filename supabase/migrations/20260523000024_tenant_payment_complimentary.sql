-- Mirror of subscription_complimentary, but for tenants. When TRUE, the
-- PayRent flow silently marks the rent payment as completed without ever
-- hitting Stripe — used for the owner's dogfood tenant account so the UI
-- can be tested end-to-end without real charges. The UI is unchanged: the
-- "Pay Now" button still fires, the modal still opens (only for non-comp
-- tenants), and the success state still renders.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_complimentary BOOLEAN NOT NULL DEFAULT FALSE;
