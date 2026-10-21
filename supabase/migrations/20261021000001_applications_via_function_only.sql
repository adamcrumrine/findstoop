-- 20261021000001_applications_via_function_only.sql
--
-- applications_public_insert let ANYONE holding the anon key insert unlimited
-- rental applications (with_check true) — a script could flood a landlord's
-- inbox with junk at no cost. Applications now arrive only through the
-- submit-application edge function (honeypot, per-IP limits, Turnstile human
-- check, unit validation), which inserts with the service role.
--
-- Apply this AFTER the web app that calls submit-application is live, or the
-- Apply page in the field will start failing until it reloads.

DROP POLICY IF EXISTS applications_public_insert ON public.applications;
