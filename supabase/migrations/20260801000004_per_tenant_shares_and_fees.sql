-- 20260801000004_per_tenant_shares_and_fees.sql
--
-- Roommates on a shared lease often don't pay equal amounts — rooms differ in
-- size, and one of them may be the pet owner. Until now rent was split
-- EVENLY across primaries (20260525000006), so a 4-person $2,100 lease billed
-- everyone $525 whatever they'd actually agreed, and there was no mechanism
-- for a recurring monthly pet fee at all (the generator only ever emitted
-- 'rent' rows, which is why a migrated pet fee silently vanished).
--
-- Two per-tenant columns on lease_tenants:
--
--   rent_share       NULL  → this tenant takes an even split of whatever the
--                            explicitly-assigned shares don't cover.
--                    value → bill exactly this each month.
--   monthly_pet_fee  value → also emit a 'pet_fee' payment for this tenant
--                            each month. Kept separate from rent so pet
--                            income stays separable at tax time.
--
-- Mixed leases work: assign shares to some tenants and the remainder splits
-- evenly among the rest. All-NULL reproduces the old even-split exactly, so
-- existing leases are unaffected.

ALTER TABLE lease_tenants
  ADD COLUMN IF NOT EXISTS rent_share      NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS monthly_pet_fee NUMERIC(10, 2);

COMMENT ON COLUMN lease_tenants.rent_share IS
  'This tenant''s fixed monthly rent. NULL means they take an even split of the portion of leases.rent_amount not covered by explicit shares.';
COMMENT ON COLUMN lease_tenants.monthly_pet_fee IS
  'Recurring monthly pet rent billed to THIS tenant as a separate pet_fee payment row. NULL/0 = none.';

-- Pet fee needs the same one-row-per-(lease,tenant,month) guard rent has,
-- so re-running the generator can never double-bill.
CREATE UNIQUE INDEX IF NOT EXISTS unique_pet_fee_per_lease_tenant_due_date
  ON payments(lease_id, tenant_id, due_date)
  WHERE type = 'pet_fee';

-- ── Shared helper: resolve each primary's monthly charges ──────────────────
-- Returns one row per primary tenant with their rent share and pet fee.
-- Both the INSERT trigger and the regenerate RPC call this so the split math
-- exists in exactly one place.
CREATE OR REPLACE FUNCTION public.lease_tenant_charges(p_lease_id UUID, p_rent_amount NUMERIC)
RETURNS TABLE(tenant_id UUID, rent_amount NUMERIC, pet_fee NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assigned_cents  BIGINT := 0;
  v_total_cents     BIGINT;
  v_unassigned_n    INTEGER;
  v_base_cents      BIGINT := 0;
  v_remainder_cents BIGINT := 0;
  v_first_unassigned UUID;
BEGIN
  v_total_cents := ROUND(p_rent_amount * 100)::BIGINT;

  -- What the explicitly-assigned shares already account for.
  SELECT COALESCE(SUM(ROUND(lt.rent_share * 100)), 0)
    INTO v_assigned_cents
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NOT NULL;

  SELECT COUNT(*) INTO v_unassigned_n
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NULL;

  IF v_unassigned_n > 0 THEN
    -- Never bill a negative remainder if the assigned shares already exceed
    -- the lease rent — clamp at zero and let the UI flag the mismatch.
    v_base_cents := GREATEST(v_total_cents - v_assigned_cents, 0) / v_unassigned_n;
    v_remainder_cents := GREATEST(v_total_cents - v_assigned_cents, 0) - (v_base_cents * v_unassigned_n);

    SELECT lt.tenant_id INTO v_first_unassigned
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NULL
     ORDER BY lt.sort_order NULLS LAST, lt.added_at
     LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT lt.tenant_id,
         CASE
           WHEN lt.rent_share IS NOT NULL THEN lt.rent_share
           WHEN lt.tenant_id = v_first_unassigned THEN (v_base_cents + v_remainder_cents)::NUMERIC / 100.0
           ELSE v_base_cents::NUMERIC / 100.0
         END,
         COALESCE(lt.monthly_pet_fee, 0)
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary
   ORDER BY lt.sort_order NULLS LAST, lt.added_at;
END;
$$;

-- ── Schedule generator ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_payment_schedule_for_lease()
RETURNS TRIGGER AS $$
DECLARE
  cursor_date DATE;
  due_day_int INTEGER;
  has_primaries BOOLEAN;
  chg RECORD;
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.payment_schedule_generated_at IS NULL THEN

    SELECT EXISTS (
      SELECT 1 FROM public.lease_tenants WHERE lease_id = NEW.id AND is_primary
    ) INTO has_primaries;

    due_day_int := COALESCE(NEW.payment_due_day, 1);

    IF EXTRACT(DAY FROM NEW.start_date)::integer <= due_day_int THEN
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + ((due_day_int - 1) || ' days')::interval)::date;
    ELSE
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + INTERVAL '1 month' + ((due_day_int - 1) || ' days')::interval)::date;
    END IF;

    WHILE cursor_date <= NEW.end_date LOOP
      IF has_primaries THEN
        FOR chg IN SELECT * FROM public.lease_tenant_charges(NEW.id, NEW.rent_amount) LOOP
          INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
          VALUES (NEW.id, chg.tenant_id, chg.rent_amount, 'rent', 'pending', cursor_date)
          ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'rent' DO NOTHING;

          IF chg.pet_fee > 0 THEN
            INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
            VALUES (NEW.id, chg.tenant_id, chg.pet_fee, 'pet_fee', 'pending', cursor_date)
            ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'pet_fee' DO NOTHING;
          END IF;
        END LOOP;
      ELSE
        -- Lease never migrated to the junction table — bill the legacy pointer.
        INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
        VALUES (NEW.id, NEW.tenant_id, NEW.rent_amount, 'rent', 'pending', cursor_date)
        ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'rent' DO NOTHING;
      END IF;
      cursor_date := (cursor_date + INTERVAL '1 month')::date;
    END LOOP;

    NEW.payment_schedule_generated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Manager-callable rebuild of FUTURE pending rows ────────────────────────
-- Same contract as before (returns created/skipped counts) but now also
-- rebuilds pet_fee rows. Paid history is never touched.
CREATE OR REPLACE FUNCTION public.regenerate_rent_schedule(p_lease_id UUID)
RETURNS TABLE(created_count INTEGER, skipped_paid_count INTEGER) AS $$
DECLARE
  v_lease        public.leases%ROWTYPE;
  v_manager_ok   BOOLEAN;
  cursor_date    DATE;
  due_day_int    INTEGER;
  v_rows         INTEGER;
  v_created      INTEGER := 0;
  v_skipped_paid INTEGER := 0;
  chg            RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.leases l
      JOIN public.units u      ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
     WHERE l.id = p_lease_id AND p.manager_id = auth.uid()
  ) INTO v_manager_ok;
  IF NOT v_manager_ok THEN
    RAISE EXCEPTION 'not authorized to regenerate schedule for this lease';
  END IF;

  SELECT * INTO v_lease FROM public.leases WHERE id = p_lease_id;

  SELECT COUNT(*) INTO v_skipped_paid
    FROM public.payments
   WHERE lease_id = p_lease_id
     AND type IN ('rent', 'pet_fee')
     AND status <> 'pending';

  DELETE FROM public.payments
   WHERE lease_id = p_lease_id
     AND type IN ('rent', 'pet_fee')
     AND status = 'pending'
     AND due_date > CURRENT_DATE;

  due_day_int := COALESCE(v_lease.payment_due_day, 1);
  IF EXTRACT(DAY FROM v_lease.start_date)::integer <= due_day_int THEN
    cursor_date := (DATE_TRUNC('month', v_lease.start_date) + ((due_day_int - 1) || ' days')::interval)::date;
  ELSE
    cursor_date := (DATE_TRUNC('month', v_lease.start_date) + INTERVAL '1 month' + ((due_day_int - 1) || ' days')::interval)::date;
  END IF;
  WHILE cursor_date <= CURRENT_DATE LOOP
    cursor_date := (cursor_date + INTERVAL '1 month')::date;
  END LOOP;

  WHILE cursor_date <= v_lease.end_date LOOP
    FOR chg IN SELECT * FROM public.lease_tenant_charges(p_lease_id, v_lease.rent_amount) LOOP
      INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
      VALUES (p_lease_id, chg.tenant_id, chg.rent_amount, 'rent', 'pending', cursor_date)
      ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'rent' DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN v_created := v_created + 1; END IF;

      IF chg.pet_fee > 0 THEN
        INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
        VALUES (p_lease_id, chg.tenant_id, chg.pet_fee, 'pet_fee', 'pending', cursor_date)
        ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'pet_fee' DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN v_created := v_created + 1; END IF;
      END IF;
    END LOOP;
    cursor_date := (cursor_date + INTERVAL '1 month')::date;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped_paid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.lease_tenant_charges(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_rent_schedule(UUID) TO authenticated;
