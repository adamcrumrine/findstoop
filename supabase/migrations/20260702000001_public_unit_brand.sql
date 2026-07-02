-- 20260702000001_public_unit_brand.sql
-- Landlord branding for the pre-auth application journey (/apply/:unitId).
--
-- Applicants are anonymous — they have no session, so RLS (rightly) blocks
-- them from reading the landlord's profiles row. The apply pages resolve
-- branding through a SECURITY DEFINER RPC instead, mirroring
-- get_referral_brand (20260604000002) and unit_application_context
-- (20260523000036).
--
-- Exposes ONLY the three branding columns the tenant portal already renders
-- (profiles.company_name / company_logo_url / brand_color) for the manager of
-- the property containing the unit — never the manager's id, email, or
-- anything else on profiles. Unknown unit ids return no row; ids are UUIDs
-- shared by the landlord in apply links, so this reveals nothing enumerable
-- beyond what the existing unit_application_context RPC already does.

CREATE OR REPLACE FUNCTION get_unit_public_brand(p_unit_id uuid)
RETURNS TABLE (company_name text, company_logo_url text, brand_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.company_name, pr.company_logo_url, pr.brand_color
  FROM units u
  JOIN properties p ON p.id = u.property_id
  JOIN profiles pr ON pr.id = p.manager_id
  WHERE u.id = p_unit_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_unit_public_brand(uuid) TO anon, authenticated;
