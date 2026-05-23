-- Manager-set screening preferences live on the property.
--
-- When a manager configures a property, they choose whether to require the
-- selfie ID-match on every applicant. The applicant doesn't get a choice —
-- they see whatever price the manager set ($5 or $7) and pay it once.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS require_selfie_screening BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN properties.require_selfie_screening IS
  'When TRUE, applicants to any unit on this property must include a selfie. The pre-qual fee becomes $7 instead of $5 to cover the extra Claude vision call.';

-- Extend unit_application_context so the public /apply page can show the
-- correct price and gate the selfie upload step.
DROP FUNCTION IF EXISTS public.unit_application_context(uuid);
CREATE FUNCTION public.unit_application_context(unit_uuid uuid)
RETURNS TABLE(
  unit_id uuid, unit_number text, bedrooms integer, bathrooms numeric,
  rent_amount numeric, property_name text, property_address text,
  property_city text, property_state text, property_zip text,
  unit_status text, require_selfie_screening boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    u.id, u.unit_number, u.bedrooms, u.bathrooms, u.rent_amount,
    p.name, p.address, p.city, p.state, p.zip,
    u.status::text, p.require_selfie_screening
  FROM public.units u
  JOIN public.properties p ON p.id = u.property_id
  WHERE u.id = unit_uuid
$function$;
