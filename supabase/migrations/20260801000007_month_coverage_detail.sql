-- 20260801000007_month_coverage_detail.sql
--
-- Roommates are jointly and severally liable for the whole unit, so each of
-- them needs to see where the month actually stands — not just their own
-- line. The first cut of lease_month_coverage only returned "allocated",
-- which conflated money already paid with money merely scheduled.
--
-- Split it into the four states that matter to someone deciding whether
-- their house is covered this month:
--
--   paid        settled — the money has cleared
--   processing  ACH in flight; will clear in a few business days
--   pending     scheduled but not yet attempted
--   unassigned  the unit total minus everything above. Positive means the
--               house has not accounted for the full rent yet.
--
-- Readable by any party to the lease (is_lease_party covers co-tenants since
-- 20260801000001) and by the landlord.

DROP FUNCTION IF EXISTS public.lease_month_coverage(UUID, DATE);

CREATE OR REPLACE FUNCTION public.lease_month_coverage(p_lease_id UUID, p_due_date DATE)
RETURNS TABLE(
  unit_total  NUMERIC,
  paid        NUMERIC,
  processing  NUMERIC,
  pending     NUMERIC,
  unassigned  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH lease AS (
    SELECT l.id, COALESCE(l.rent_amount, 0) + COALESCE(l.monthly_pet_fee, 0) AS total
      FROM public.leases l
     WHERE l.id = p_lease_id
       AND (public.is_lease_party(l.id) OR EXISTS (
             SELECT 1 FROM public.units u
               JOIN public.properties pr ON pr.id = u.property_id
              WHERE u.id = l.unit_id AND pr.manager_id = auth.uid()
           ))
  ),
  sums AS (
    SELECT
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0)  AS paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'processing'), 0) AS processing,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pending'), 0)    AS pending
      FROM public.payments p
     WHERE p.lease_id = p_lease_id
       AND p.due_date = p_due_date
       AND p.type IN ('rent', 'pet_fee')
  )
  SELECT
    lease.total,
    sums.paid,
    sums.processing,
    sums.pending,
    lease.total - (sums.paid + sums.processing + sums.pending)
  FROM lease CROSS JOIN sums;
$$;

GRANT EXECUTE ON FUNCTION public.lease_month_coverage(UUID, DATE) TO authenticated;
