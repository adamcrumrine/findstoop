-- Remember whether a saved card is debit or credit.
--
-- Card networks prohibit surcharging debit anywhere in the US, so a debit rent
-- payment can't recover Stripe's 2.9% + 30c — roughly $15.53 on a $525 share,
-- straight off the platform. Stripe only reveals the funding type once a
-- PaymentMethod exists, which is too late to price the charge but exactly
-- early enough to stop the SECOND one: a saved card is used every month.
--
-- Storing it here turns a recurring monthly loss into a single one, and lets
-- the tenant be told at the moment they attach the card rather than after a
-- confusing charge-then-refund on their statement.
alter table profiles
  add column if not exists stripe_default_pm_funding text;

comment on column profiles.stripe_default_pm_funding is
  'Stripe card funding type for the saved payment method: credit | debit | prepaid | unknown. Null for bank accounts. Debit cannot legally be surcharged, so it is refused for rent.';
