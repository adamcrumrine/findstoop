-- 033_profile_company_address.sql
-- Adds the landlord's mailing address (for the rental-payment "make checks
-- payable to" line on the lease document and the Notices clause). Free-form
-- single line so we can render it inline.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_address TEXT;
