-- 20261021000002_block_disposable_signups.sql
--
-- Supabase Auth "before user created" hook: refuses accounts on throwaway
-- email domains (mailinator & co.) — the staple of garbage signups. Runs for
-- every creation path (email signup, OAuth, admin invite), server-side, so it
-- can't be skipped by calling the Auth API directly.
--
-- Enabled in the Auth config (hook_before_user_created_enabled +
-- hook_before_user_created_uri = pg-functions://postgres/public/hook_before_user_created),
-- set via the Management API alongside this migration.
--
-- The list is deliberately short and high-confidence: the services bots
-- actually use. A false positive costs a real signup, so no fuzzy matching.

CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain     TEXT PRIMARY KEY,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
-- No policies: only the hook (SECURITY DEFINER) and admins via SQL read it.

INSERT INTO public.blocked_email_domains (domain) VALUES
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('guerrillamail.org'),
  ('sharklasers.com'), ('grr.la'), ('10minutemail.com'), ('10minutemail.net'),
  ('temp-mail.org'), ('tempmail.com'), ('tempmailo.com'), ('tempr.email'),
  ('yopmail.com'), ('yopmail.net'), ('throwawaymail.com'), ('trashmail.com'),
  ('trashmail.de'), ('getnada.com'), ('nada.email'), ('dispostable.com'),
  ('maildrop.cc'), ('mailnesia.com'), ('mintemail.com'), ('mohmal.com'),
  ('emailondeck.com'), ('fakeinbox.com'), ('spamgourmet.com'), ('mytemp.email'),
  ('tmpmail.org'), ('tmpmail.net'), ('moakt.com'), ('burnermail.io'),
  ('mail.tm'), ('mailpoof.com'), ('inboxkitten.com'), ('dropmail.me'),
  ('emailfake.com'), ('fakemail.net'), ('mailcatch.com'), ('spam4.me')
ON CONFLICT (domain) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  TEXT := lower(coalesce(event->'user'->>'email', ''));
  v_domain TEXT := split_part(v_email, '@', 2);
BEGIN
  IF v_domain <> '' AND EXISTS (
    SELECT 1 FROM public.blocked_email_domains b
     WHERE v_domain = b.domain OR v_domain LIKE '%.' || b.domain
  ) THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Please sign up with a permanent email address — temporary inboxes aren''t accepted.'
    ));
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

-- Only Supabase Auth may call the hook.
REVOKE EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON public.blocked_email_domains TO supabase_auth_admin;
