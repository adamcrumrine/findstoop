-- 20261019000002_bill_units_not_leases.sql
--
-- Pricing is per unit, but count_manager_active_units counted active LEASES.
-- A signed renewal is status 'active' from the day it's signed, so a unit
-- renewed in October carried two active leases until the old term ended —
-- and the subscription quantity (count_manager_paid_units → stripe-subscribe
-- / stripe-sync-quantity) billed that unit twice for months.
--
-- Count distinct units instead. No manager has overlapping active leases
-- today (checked 2026-10-19), so this changes no current quantity.

CREATE OR REPLACE FUNCTION public.count_manager_active_units(manager_uuid uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT l.unit_id)::INTEGER
  FROM public.leases l
  JOIN public.units u      ON u.id = l.unit_id
  JOIN public.properties p ON p.id = u.property_id
  WHERE p.manager_id = manager_uuid
    AND l.status = 'active'
$function$;
