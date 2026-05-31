-- Lease-renewal reminders. Returns active leases ending in exactly `days_before`
-- days that aren't already month-to-month / auto-renewing (those don't need a
-- renewal nudge). Joined with tenant + manager + property so the cron can email
-- both parties. Dedup happens in the function layer via lifecycle_events.

CREATE OR REPLACE FUNCTION public.leases_expiring_for_renewal(days_before INTEGER)
RETURNS TABLE(
  lease_id              UUID,
  end_date              DATE,
  tenant_id             UUID,
  tenant_name           TEXT,
  tenant_email          TEXT,
  tenant_email_enabled  BOOLEAN,
  manager_id            UUID,
  manager_name          TEXT,
  manager_email         TEXT,
  manager_email_enabled BOOLEAN,
  property_name         TEXT,
  unit_number           TEXT
) AS $$
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
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
