-- 20261020000001_free_for_landlords.sql
--
-- Stoop is free for landlords as of 2026-10-20 (pricing decision: no
-- subscription; revenue from applicant-paid Tenability™). The app no longer
-- gates anything on a landlord's subscription, but these two checks were the
-- server-side source of the old paywall — the tenant-portal lock and the
-- finalized-lease-PDF lock. Answer "yes" unconditionally so a cached older
-- client can't lock a tenant out of paying rent either.
--
-- Kept (not dropped) because deployed clients may still call them.

CREATE OR REPLACE FUNCTION public.manager_subscription_active(manager_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT TRUE $function$;

CREATE OR REPLACE FUNCTION public.tenant_landlord_subscription_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT TRUE $function$;
