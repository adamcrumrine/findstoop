-- 20260714000001_reserve_university_portal_slugs.sql
-- University co-brand subdomains ({university}.findstoop.com) resolve in the
-- web client to the static university registry (apps/web/src/lib/
-- universityPortals.ts) and must NEVER be claimable as a landlord portal_slug.
-- The client already resolves a university subdomain BEFORE landlord slug
-- resolution; this reserves the same names at the database so no landlord can
-- register or shadow one via profiles.portal_slug.
--
-- We reserve the live slug (osu) AND the three planned schools (miami, ohiou,
-- kent). The planned ones are intentionally reserved ahead of launch: the cost
-- of holding a handful of names is nil, and it prevents a landlord from
-- squatting a school's subdomain in the window before its registry entry goes
-- live. Extend the array here when onboarding a new university.
--
-- Same mechanism as 20260712000003_portal_slugs.sql — CREATE OR REPLACE the
-- IMMUTABLE membership function; the existing INSERT/UPDATE trigger
-- (profiles_check_portal_slug) enforces it unchanged.

CREATE OR REPLACE FUNCTION portal_slug_is_reserved(p_slug text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(p_slug) = ANY (ARRAY[
    -- Platform surfaces, infrastructure, and phishing bait (unchanged).
    'www', 'my', 'app', 'api', 'mail', 'email', 'smtp', 'imap', 'ftp',
    'admin', 'administrator', 'root', 'support', 'help', 'billing',
    'preview', 'staging', 'dev', 'test', 'demo', 'status', 'docs', 'blog',
    'stoop', 'findstoop', 'security', 'login', 'signin', 'signup',
    'auth', 'account', 'accounts', 'pay', 'payments', 'secure', 'verify',
    'cdn', 'assets', 'static', 'img', 'images',
    -- University co-brand subdomains: live (osu) + planned (miami/ohiou/kent).
    'osu', 'miami', 'ohiou', 'kent'
  ])
$$;
