-- 20260801000005_tenant_set_own_share.sql
--
-- Correction to 20260801000004. That version made the LANDLORD assign every
-- roommate's amount, which is the wrong shape: the lease fixes a total for
-- the unit, and how roommates divide it is their own arrangement. The
-- landlord only cares that the unit's total is covered each month.
--
-- Revised model:
--   • Lease level  — total rent (existing) + monthly_pet_fee (new). Together
--                    these are the unit's monthly due.
--   • Default      — split evenly across primaries, exactly as before.
--   • Override     — each TENANT may set their own monthly rent amount from
--                    their portal. Nobody else's share moves; the shortfall
--                    or surplus shows against the unit total.
--
-- monthly_pet_fee moves from lease_tenants to leases for the same reason:
-- it's a charge against the unit, split like rent, not something the
-- landlord assigns to an individual.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS monthly_pet_fee NUMERIC(10, 2);

COMMENT ON COLUMN leases.monthly_pet_fee IS
  'Recurring monthly pet rent for the unit. Billed as separate pet_fee payment rows (split evenly across primaries) so pet income stays separable from rent at tax time.';

COMMENT ON COLUMN lease_tenants.rent_share IS
  'This tenant''s chosen monthly rent contribution. Set by the TENANT from their portal. NULL means they take an even split of whatever the explicit shares do not cover.';

-- lease_tenants.monthly_pet_fee from the previous migration is superseded by
-- the lease-level column. Drop it rather than leave two sources of truth.
ALTER TABLE lease_tenants DROP COLUMN IF EXISTS monthly_pet_fee;

-- ── Charges resolver, now sourcing pet rent from the lease ────────────────
CREATE OR REPLACE FUNCTION public.lease_tenant_charges(p_lease_id UUID, p_rent_amount NUMERIC)
RETURNS TABLE(tenant_id UUID, rent_amount NUMERIC, pet_fee NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assigned_cents   BIGINT := 0;
  v_total_cents      BIGINT;
  v_unassigned_n     INTEGER;
  v_base_cents       BIGINT := 0;
  v_remainder_cents  BIGINT := 0;
  v_first_unassigned UUID;
  v_primary_n        INTEGER;
  v_pet_total_cents  BIGINT := 0;
  v_pet_base_cents   BIGINT := 0;
  v_pet_remainder    BIGINT := 0;
  v_first_primary    UUID;
BEGIN
  v_total_cents := ROUND(p_rent_amount * 100)::BIGINT;

  SELECT COALESCE(ROUND(l.monthly_pet_fee * 100), 0) INTO v_pet_total_cents
    FROM leases l WHERE l.id = p_lease_id;

  SELECT COALESCE(SUM(ROUND(lt.rent_share * 100)), 0)
    INTO v_assigned_cents
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NOT NULL;

  SELECT COUNT(*) INTO v_unassigned_n
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NULL;

  SELECT COUNT(*) INTO v_primary_n
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary;

  IF v_unassigned_n > 0 THEN
    v_base_cents := GREATEST(v_total_cents - v_assigned_cents, 0) / v_unassigned_n;
    v_remainder_cents := GREATEST(v_total_cents - v_assigned_cents, 0) - (v_base_cents * v_unassigned_n);
    SELECT lt.tenant_id INTO v_first_unassigned
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NULL
     ORDER BY lt.sort_order NULLS LAST, lt.added_at LIMIT 1;
  END IF;

  IF v_primary_n > 0 AND v_pet_total_cents > 0 THEN
    v_pet_base_cents := v_pet_total_cents / v_primary_n;
    v_pet_remainder  := v_pet_total_cents - (v_pet_base_cents * v_primary_n);
    SELECT lt.tenant_id INTO v_first_primary
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary
     ORDER BY lt.sort_order NULLS LAST, lt.added_at LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT lt.tenant_id,
         CASE
           WHEN lt.rent_share IS NOT NULL THEN lt.rent_share
           WHEN lt.tenant_id = v_first_unassigned THEN (v_base_cents + v_remainder_cents)::NUMERIC / 100.0
           ELSE v_base_cents::NUMERIC / 100.0
         END,
         CASE
           WHEN v_pet_total_cents = 0 THEN 0
           WHEN lt.tenant_id = v_first_primary THEN (v_pet_base_cents + v_pet_remainder)::NUMERIC / 100.0
           ELSE v_pet_base_cents::NUMERIC / 100.0
         END
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary
   ORDER BY lt.sort_order NULLS LAST, lt.added_at;
END;
$$;

-- ── Tenant-callable: set my own monthly rent contribution ─────────────────
-- Deliberately narrow: the caller can only ever write their OWN row on a
-- lease they're actually on, and only this one column. Rebuilds their future
-- unpaid rent rows so the change reaches their Pay Rent screen immediately.
-- Paid months are never touched, and nobody else's amount moves.
CREATE OR REPLACE FUNCTION public.set_my_rent_share(p_lease_id UUID, p_amount NUMERIC)
RETURNS TABLE(updated_count INTEGER) AS $$
DECLARE
  v_is_party  BOOLEAN;
  v_lease     public.leases%ROWTYPE;
  v_updated   INTEGER := 0;
  v_due       DATE;
  chg         RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.tenant_id = auth.uid() AND lt.is_primary
  ) INTO v_is_party;
  IF NOT v_is_party THEN
    RAISE EXCEPTION 'not a primary tenant on this lease';
  END IF;

  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > 1000000) THEN
    RAISE EXCEPTION 'amount out of range';
  END IF;

  UPDATE public.lease_tenants
     SET rent_share = p_amount
   WHERE lease_id = p_lease_id AND tenant_id = auth.uid();

  SELECT * INTO v_lease FROM public.leases WHERE id = p_lease_id;

  -- Re-price only this tenant's own unpaid future rent rows. Everyone else's
  -- rows are left exactly as they are, including the even-split holders --
  -- one roommate raising their share doesn't silently lower anyone else's.
  FOR chg IN SELECT * FROM public.lease_tenant_charges(p_lease_id, v_lease.rent_amount) LOOP
    IF chg.tenant_id = auth.uid() THEN
      FOR v_due IN
        SELECT due_date FROM public.payments
         WHERE lease_id = p_lease_id AND tenant_id = auth.uid()
           AND type = 'rent' AND status = 'pending' AND due_date >= CURRENT_DATE
      LOOP
        UPDATE public.payments
           SET amount = chg.rent_amount
         WHERE lease_id = p_lease_id AND tenant_id = auth.uid()
           AND type = 'rent' AND due_date = v_due AND status = 'pending';
        v_updated := v_updated + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.set_my_rent_share(UUID, NUMERIC) TO authenticated;

-- ── Unit coverage: is the month's total actually covered? ─────────────────
-- Both sides need this: the tenant screen shows "your house still owes $X",
-- and the landlord sees whether the unit is short.
CREATE OR REPLACE FUNCTION public.lease_month_coverage(p_lease_id UUID, p_due_date DATE)
RETURNS TABLE(unit_total NUMERIC, allocated NUMERIC, shortfall NUMERIC) AS $$
  SELECT
    COALESCE(l.rent_amount, 0) + COALESCE(l.monthly_pet_fee, 0),
    COALESCE((
      SELECT SUM(p.amount) FROM public.payments p
       WHERE p.lease_id = p_lease_id
         AND p.due_date = p_due_date
         AND p.type IN ('rent', 'pet_fee')
    ), 0),
    (COALESCE(l.rent_amount, 0) + COALESCE(l.monthly_pet_fee, 0)) - COALESCE((
      SELECT SUM(p.amount) FROM public.payments p
       WHERE p.lease_id = p_lease_id
         AND p.due_date = p_due_date
         AND p.type IN ('rent', 'pet_fee')
    ), 0)
  FROM public.leases l
  WHERE l.id = p_lease_id
    AND public.is_lease_party(l.id);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.lease_month_coverage(UUID, DATE) TO authenticated;
