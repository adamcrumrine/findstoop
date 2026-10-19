-- 20261019000001_skip_renewal_reminders_when_renewed.sql
--
-- leases_expiring_for_renewal fed the 90/60/30-day "lease ending" emails to
-- managers and tenants for every expiring fixed-term lease — including ones
-- whose unit already has a signed next lease. A household that renewed in
-- October still got "Thinking about staying?" the following summer.
--
-- Skip a lease once a later signed (status 'active') lease exists on the same
-- unit: renewed or re-let, there's nothing left to renew. Same rule as
-- signedSuccessor() in packages/shared/src/lib/leaseSuccession.ts.

CREATE OR REPLACE FUNCTION public.leases_expiring_for_renewal(days_before integer)
 RETURNS TABLE(lease_id uuid, end_date date, tenant_id uuid, tenant_name text, tenant_email text, tenant_email_enabled boolean, manager_id uuid, manager_name text, manager_email text, manager_email_enabled boolean, property_name text, unit_number text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    l.id, l.end_date,
    t.id, t.full_name, t.email, t.notification_email_enabled,
    m.id, m.full_name, m.email, m.notification_email_enabled,
    prop.name, u.unit_number
  FROM public.leases l
  JOIN public.units      u    ON u.id    = l.unit_id
  JOIN public.properties prop ON prop.id = u.property_id
  JOIN public.profiles   m    ON m.id    = prop.manager_id
  JOIN public.profiles   t    ON t.id    = l.tenant_id
  WHERE l.status = 'active'
    AND l.month_to_month = false
    AND l.auto_renew_month_to_month = false
    AND l.end_date = (CURRENT_DATE + (days_before || ' days')::interval)::date
    AND NOT EXISTS (
      SELECT 1 FROM public.leases nxt
       WHERE nxt.unit_id = l.unit_id
         AND nxt.id <> l.id
         AND nxt.status = 'active'
         AND nxt.start_date > l.start_date
    )
$function$;
