-- 20260712000003_portal_slugs.sql
-- {company}.findstoop.com — every manager gets their own branded portal
-- front door, claimed as a subdomain slug in Settings → Company.
--
-- The slug resolves at runtime in the web client (hostname → slug →
-- get_portal_brand RPC), served by the SAME deployment via the wildcard
-- *.findstoop.com domain. Pre-auth pages show the landlord's name/logo/
-- accent; after sign-in the existing per-landlord branding takes over.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS portal_slug TEXT UNIQUE
  -- 3–30 chars, lowercase letters/digits with single interior hyphens:
  -- valid DNS labels, no look-alike tricks.
  CHECK (portal_slug ~ '^[a-z0-9](?:-?[a-z0-9]){2,29}$');

-- Names that must never become a landlord portal: platform surfaces,
-- infrastructure, and anything a phisher would want.
CREATE OR REPLACE FUNCTION portal_slug_is_reserved(p_slug text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(p_slug) = ANY (ARRAY[
    'www', 'my', 'app', 'api', 'mail', 'email', 'smtp', 'imap', 'ftp',
    'admin', 'administrator', 'root', 'support', 'help', 'billing',
    'preview', 'staging', 'dev', 'test', 'demo', 'status', 'docs', 'blog',
    'stoop', 'findstoop', 'security', 'login', 'signin', 'signup',
    'auth', 'account', 'accounts', 'pay', 'payments', 'secure', 'verify',
    'cdn', 'assets', 'static', 'img', 'images'
  ])
$$;

-- Enforce reservations at the database so no client path can bypass them.
CREATE OR REPLACE FUNCTION profiles_check_portal_slug() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.portal_slug IS NOT NULL AND portal_slug_is_reserved(NEW.portal_slug) THEN
    RAISE EXCEPTION 'This subdomain name is reserved — please choose another.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_portal_slug ON profiles;
CREATE TRIGGER trg_profiles_portal_slug
  BEFORE INSERT OR UPDATE OF portal_slug ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_check_portal_slug();

-- Anonymous resolution: slug → the three public branding columns (same
-- exposure surface as get_unit_public_brand — nothing enumerable beyond
-- what the subdomain itself already announces).
CREATE OR REPLACE FUNCTION get_portal_brand(p_slug text)
RETURNS TABLE (company_name text, company_logo_url text, brand_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.company_name, pr.company_logo_url, pr.brand_color
  FROM profiles pr
  WHERE pr.portal_slug = lower(p_slug)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_portal_brand(text) TO anon, authenticated;
