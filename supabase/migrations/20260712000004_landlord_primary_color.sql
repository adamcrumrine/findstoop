-- 20260712000004_landlord_primary_color.sql
-- Two-color white-label: a PRIMARY color for broad shading (portal header,
-- footer, bottom nav) distinct from the existing brand_color, which becomes
-- the ACCENT (buttons, links, the surfaces that were Stoop teal).
--
-- brand_primary_color is optional: when NULL the portal uses brand_color for
-- both roles (a single-color pick still fully brands, unchanged from before).
-- Same RLS as brand_color — tenants already read their manager's row via
-- profiles_tenant_select_their_manager.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS brand_primary_color TEXT
  CONSTRAINT profiles_brand_primary_color_hex CHECK (brand_primary_color ~ '^#[0-9a-fA-F]{6}$');

-- Anon brand-resolution RPCs must expose the new column too, for pre-auth
-- surfaces (the apply flow and {company}.findstoop.com portal front door).
-- Same exposure surface as before — three→four public branding columns only.
-- Adding an OUT column changes the return type, so the existing functions
-- must be dropped before recreation (CREATE OR REPLACE can't widen it).

DROP FUNCTION IF EXISTS get_unit_public_brand(uuid);
DROP FUNCTION IF EXISTS get_portal_brand(text);

CREATE OR REPLACE FUNCTION get_unit_public_brand(p_unit_id uuid)
RETURNS TABLE (company_name text, company_logo_url text, brand_color text, brand_primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.company_name, pr.company_logo_url, pr.brand_color, pr.brand_primary_color
  FROM units u
  JOIN properties p ON p.id = u.property_id
  JOIN profiles pr ON pr.id = p.manager_id
  WHERE u.id = p_unit_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_unit_public_brand(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_portal_brand(p_slug text)
RETURNS TABLE (company_name text, company_logo_url text, brand_color text, brand_primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.company_name, pr.company_logo_url, pr.brand_color, pr.brand_primary_color
  FROM profiles pr
  WHERE pr.portal_slug = lower(p_slug)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_portal_brand(text) TO anon, authenticated;
