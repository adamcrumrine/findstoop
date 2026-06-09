-- Rental Analysis Report: tiering + complimentary (free) reporting.
--
--   • tier   on rent_reports — 'basic' (free; public-data estimate only) or
--            'pro' ($19.99; adds RentCast comparable rentals + PDF).
--   • comped on rent_reports — TRUE when the report was issued free (comp account).
--   • reports_complimentary on profiles — per-account free reporting that bypasses
--     the payment portal, mirroring the existing subscription_complimentary flag.

ALTER TABLE rent_reports
  ADD COLUMN IF NOT EXISTS tier   TEXT    NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS comped BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reports_complimentary BOOLEAN NOT NULL DEFAULT FALSE;

-- Grant free reporting to hawk.pig.llc. We treat 'hawk.pig.llc' as the account's
-- login-email domain (.llc is a valid gTLD) and also match it as the name on the
-- profile, so this hits whether they signed up with an @hawk.pig.llc address or
-- entered the company as their name. The edge function ALSO allow-lists the
-- @hawk.pig.llc email domain at runtime, so new signups on that domain are
-- comped automatically. Safe to re-run. If their login email is on a different
-- domain, set the flag directly:
--   UPDATE profiles SET reports_complimentary = TRUE WHERE email = '<their-email>';
UPDATE profiles
   SET reports_complimentary = TRUE
 WHERE lower(email) LIKE '%@hawk.pig.llc'
    OR lower(full_name) = 'hawk.pig.llc';
