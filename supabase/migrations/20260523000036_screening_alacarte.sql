-- À la carte screening — replace the rigid tier model with per-component
-- add-ons. Manager configures each property: which checks they require for
-- every applicant. Applicant sees a price breakdown (pre-qual + each
-- required add-on) and pays the total in one Stripe charge.
--
-- Vendor stack (each component runs independently):
--   credit_check    → Array (~$7 wholesale, sold at +$15)
--   criminal_check  → Vergent.ai (~$10 wholesale, sold at +$25)
--   eviction_check  → LexisNexis Accurint (~$7 wholesale, sold at +$10)
--
-- The selfie_match add-on already exists and behaves the same way.

ALTER TABLE screening_orders
  ADD COLUMN IF NOT EXISTS addon_credit_check   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS addon_criminal_check BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS addon_eviction_check BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-vendor cached responses, parallel to plaid_data / array_data / checkr_data
-- already on the table. Adding the Vergent column for criminal results; the
-- existing array_data / checkr_data columns are retained but we'll route to
-- vergent_data going forward.
ALTER TABLE screening_orders
  ADD COLUMN IF NOT EXISTS vergent_report_id   TEXT,
  ADD COLUMN IF NOT EXISTS vergent_data        JSONB,
  ADD COLUMN IF NOT EXISTS lexisnexis_report_id TEXT,
  ADD COLUMN IF NOT EXISTS lexisnexis_data     JSONB;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS require_credit_check   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_criminal_check BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_eviction_check BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN properties.require_credit_check IS
  'When TRUE, every applicant to a unit on this property must pay for and authorize a credit pull (Array). +$15 to the pre-qual fee. Authorization is FCRA-regulated.';
COMMENT ON COLUMN properties.require_criminal_check IS
  'When TRUE, every applicant must pay for and authorize a criminal background check (Vergent.ai). +$25 to the pre-qual fee. FCRA-regulated.';
COMMENT ON COLUMN properties.require_eviction_check IS
  'When TRUE, every applicant must pay for and authorize an eviction history search (LexisNexis). +$10 to the pre-qual fee. FCRA-regulated.';

-- Extend the public-application RPC to surface all four manager preferences.
DROP FUNCTION IF EXISTS public.unit_application_context(uuid);
CREATE FUNCTION public.unit_application_context(unit_uuid uuid)
RETURNS TABLE(
  unit_id uuid, unit_number text, bedrooms integer, bathrooms numeric,
  rent_amount numeric, property_name text, property_address text,
  property_city text, property_state text, property_zip text,
  unit_status text,
  require_selfie_screening boolean,
  require_credit_check     boolean,
  require_criminal_check   boolean,
  require_eviction_check   boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    u.id, u.unit_number, u.bedrooms, u.bathrooms, u.rent_amount,
    p.name, p.address, p.city, p.state, p.zip,
    u.status::text,
    p.require_selfie_screening,
    p.require_credit_check,
    p.require_criminal_check,
    p.require_eviction_check
  FROM public.units u
  JOIN public.properties p ON p.id = u.property_id
  WHERE u.id = unit_uuid
$function$;
