-- 20260801000006_rent_split_mode.sql
--
-- Whether roommates may set their own amounts is the landlord's call, per
-- lease. Some houses agree different amounts by room size; others want a
-- clean even split nobody can move.
--
--   'even'       (default) — rent splits evenly across primaries. Tenants
--                            cannot override; set_my_rent_share refuses.
--   'self_serve'           — each tenant sets their own monthly contribution
--                            from their portal. The landlord still only sets
--                            the unit total; the house divides it.
--
-- Default 'even' reproduces existing behaviour, so no lease changes meaning
-- on deploy.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS rent_split_mode TEXT NOT NULL DEFAULT 'even'
  CHECK (rent_split_mode IN ('even', 'self_serve'));

COMMENT ON COLUMN leases.rent_split_mode IS
  'even = rent splits evenly across primaries and tenants cannot change it. self_serve = each tenant sets their own monthly contribution (set_my_rent_share); the landlord still only sets the unit total.';

-- Enforce the mode server-side: in 'even' mode a tenant calling the RPC is
-- refused, and any stale per-tenant overrides are ignored by the resolver.
CREATE OR REPLACE FUNCTION public.set_my_rent_share(p_lease_id UUID, p_amount NUMERIC)
RETURNS TABLE(updated_count INTEGER) AS $$
DECLARE
  v_is_party BOOLEAN;
  v_mode     TEXT;
  v_lease    public.leases%ROWTYPE;
  v_updated  INTEGER := 0;
  v_due      DATE;
  chg        RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.tenant_id = auth.uid() AND lt.is_primary
  ) INTO v_is_party;
  IF NOT v_is_party THEN
    RAISE EXCEPTION 'not a primary tenant on this lease';
  END IF;

  SELECT rent_split_mode INTO v_mode FROM public.leases WHERE id = p_lease_id;
  IF v_mode IS DISTINCT FROM 'self_serve' THEN
    RAISE EXCEPTION 'this lease uses an even split — contact your landlord to change it';
  END IF;

  IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > 1000000) THEN
    RAISE EXCEPTION 'amount out of range';
  END IF;

  UPDATE public.lease_tenants
     SET rent_share = p_amount
   WHERE lease_id = p_lease_id AND tenant_id = auth.uid();

  SELECT * INTO v_lease FROM public.leases WHERE id = p_lease_id;

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

-- Resolver honours the mode: 'even' ignores any rent_share values that may
-- linger from a period when the lease was self-serve, so flipping the mode
-- back is instantly consistent without having to null the columns out.
CREATE OR REPLACE FUNCTION public.lease_tenant_charges(p_lease_id UUID, p_rent_amount NUMERIC)
RETURNS TABLE(tenant_id UUID, rent_amount NUMERIC, pet_fee NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode             TEXT;
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

  SELECT COALESCE(ROUND(l.monthly_pet_fee * 100), 0), l.rent_split_mode
    INTO v_pet_total_cents, v_mode
    FROM leases l WHERE l.id = p_lease_id;

  IF v_mode = 'self_serve' THEN
    SELECT COALESCE(SUM(ROUND(lt.rent_share * 100)), 0)
      INTO v_assigned_cents
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NOT NULL;

    SELECT COUNT(*) INTO v_unassigned_n
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NULL;
  ELSE
    v_assigned_cents := 0;
    SELECT COUNT(*) INTO v_unassigned_n
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary;
  END IF;

  SELECT COUNT(*) INTO v_primary_n
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary;

  IF v_unassigned_n > 0 THEN
    v_base_cents := GREATEST(v_total_cents - v_assigned_cents, 0) / v_unassigned_n;
    v_remainder_cents := GREATEST(v_total_cents - v_assigned_cents, 0) - (v_base_cents * v_unassigned_n);
    SELECT lt.tenant_id INTO v_first_unassigned
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary
       AND (v_mode <> 'self_serve' OR lt.rent_share IS NULL)
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
           WHEN v_mode = 'self_serve' AND lt.rent_share IS NOT NULL THEN lt.rent_share
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
