-- 20260525000006_split_rent_among_primaries.sql
--
-- Split rent across all primary tenants on a lease.
--
-- Before: trigger wrote one payments row per month with tenant_id =
-- leases.tenant_id (the legacy single primary). Co-primaries on
-- lease_tenants were never billed.
--
-- After: trigger reads ALL is_primary=TRUE tenants from lease_tenants and
-- writes one row per primary per month, splitting rent_amount evenly
-- (penny-exact, with any rounding remainder assigned to the first primary
-- by sort_order). For a $1,525 lease with 3 primaries, primary 1 gets
-- $508.34 and primaries 2/3 get $508.33 each — sum is exactly $1,525.00.
--
-- Also exposes regenerate_rent_schedule(p_lease_id uuid) so managers can
-- rebuild FUTURE pending rent rows after toggling primaries on an active
-- lease. Past/paid rows are never touched.

-- ── Swap the partial unique index so duplicates are per (lease, tenant,
--    due_date) instead of (lease, due_date). The old index would block
--    the second primary's row for the same month. ────────────────────────

DROP INDEX IF EXISTS public.unique_rent_per_lease_due_date;

CREATE UNIQUE INDEX IF NOT EXISTS unique_rent_per_lease_tenant_due_date
  ON payments(lease_id, tenant_id, due_date)
  WHERE type = 'rent';

-- ── Rewrite the schedule generator to fan out across primaries ──────────

CREATE OR REPLACE FUNCTION public.generate_payment_schedule_for_lease()
RETURNS TRIGGER AS $$
DECLARE
  cursor_date DATE;
  due_day_int INTEGER;
  primary_ids UUID[];
  n INTEGER;
  total_cents BIGINT;
  base_cents BIGINT;
  remainder_cents BIGINT;
  i INTEGER;
  tenant UUID;
  share_amount NUMERIC(10, 2);
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.payment_schedule_generated_at IS NULL THEN

    -- Pull the primary set in stable order. Fall back to the legacy
    -- leases.tenant_id for any lease that hasn't been migrated to the
    -- junction table yet.
    SELECT array_agg(tenant_id ORDER BY sort_order, added_at)
      INTO primary_ids
      FROM public.lease_tenants
     WHERE lease_id = NEW.id AND is_primary = TRUE;

    IF primary_ids IS NULL OR array_length(primary_ids, 1) IS NULL THEN
      primary_ids := ARRAY[NEW.tenant_id]::UUID[];
    END IF;
    n := array_length(primary_ids, 1);

    -- Penny-exact split. Working in cents avoids float drift; first
    -- primary absorbs the remainder so SUM(amounts) = rent_amount.
    total_cents     := ROUND(NEW.rent_amount * 100)::BIGINT;
    base_cents      := total_cents / n;
    remainder_cents := total_cents - (base_cents * n);

    due_day_int := COALESCE(NEW.payment_due_day, 1);

    IF EXTRACT(DAY FROM NEW.start_date)::integer <= due_day_int THEN
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + ((due_day_int - 1) || ' days')::interval)::date;
    ELSE
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + INTERVAL '1 month' + ((due_day_int - 1) || ' days')::interval)::date;
    END IF;

    WHILE cursor_date <= NEW.end_date LOOP
      FOR i IN 1..n LOOP
        tenant := primary_ids[i];
        IF i = 1 THEN
          share_amount := ((base_cents + remainder_cents)::NUMERIC / 100.0);
        ELSE
          share_amount := (base_cents::NUMERIC / 100.0);
        END IF;

        INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
        VALUES (NEW.id, tenant, share_amount, 'rent', 'pending', cursor_date)
        ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'rent' DO NOTHING;
      END LOOP;
      cursor_date := (cursor_date + INTERVAL '1 month')::date;
    END LOOP;

    NEW.payment_schedule_generated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Manager-callable RPC to rebuild future pending rent rows ────────────
--
-- Called from the manager Payments screen "Apply primary split" button
-- after toggling primaries on a lease that's already active.
--
-- Behaviour:
--   1. Verify caller owns the lease (via units.property → properties.manager_id).
--   2. Delete pending rent payments with due_date > CURRENT_DATE.
--      Paid/processing/failed rows stay — that's history.
--   3. Reset payment_schedule_generated_at so the trigger function logic
--      could re-fire if the lease were re-saved, but we re-run the
--      schedule generation here inline using the same primary-set + cents
--      math so the caller gets a synchronous result.
--   4. Return (created_count, skipped_paid_count) so the UI can toast.

CREATE OR REPLACE FUNCTION public.regenerate_rent_schedule(p_lease_id UUID)
RETURNS TABLE(created_count INTEGER, skipped_paid_count INTEGER) AS $$
DECLARE
  v_lease           public.leases%ROWTYPE;
  v_manager_ok      BOOLEAN;
  primary_ids       UUID[];
  n                 INTEGER;
  total_cents       BIGINT;
  base_cents        BIGINT;
  remainder_cents   BIGINT;
  cursor_date       DATE;
  due_day_int       INTEGER;
  i                 INTEGER;
  tenant            UUID;
  share_amount      NUMERIC(10, 2);
  v_rows            INTEGER;
  v_created         INTEGER := 0;
  v_skipped_paid    INTEGER := 0;
BEGIN
  -- Ownership check
  SELECT EXISTS (
    SELECT 1
      FROM public.leases l
      JOIN public.units u    ON u.id = l.unit_id
      JOIN public.properties p ON p.id = u.property_id
     WHERE l.id = p_lease_id
       AND p.manager_id = auth.uid()
  ) INTO v_manager_ok;
  IF NOT v_manager_ok THEN
    RAISE EXCEPTION 'not authorized to regenerate schedule for this lease';
  END IF;

  SELECT * INTO v_lease FROM public.leases WHERE id = p_lease_id;

  -- Count what we're preserving so the toast can say "kept 3 paid months"
  SELECT COUNT(*) INTO v_skipped_paid
    FROM public.payments
   WHERE lease_id = p_lease_id
     AND type = 'rent'
     AND status <> 'pending';

  -- Wipe future pending rent rows only. Past dues stay in case they need
  -- to be reconciled separately.
  DELETE FROM public.payments
   WHERE lease_id = p_lease_id
     AND type = 'rent'
     AND status = 'pending'
     AND due_date > CURRENT_DATE;

  -- Same primary-resolution + cents math as the trigger
  SELECT array_agg(tenant_id ORDER BY sort_order, added_at)
    INTO primary_ids
    FROM public.lease_tenants
   WHERE lease_id = p_lease_id AND is_primary = TRUE;

  IF primary_ids IS NULL OR array_length(primary_ids, 1) IS NULL THEN
    primary_ids := ARRAY[v_lease.tenant_id]::UUID[];
  END IF;
  n := array_length(primary_ids, 1);

  total_cents     := ROUND(v_lease.rent_amount * 100)::BIGINT;
  base_cents      := total_cents / n;
  remainder_cents := total_cents - (base_cents * n);

  due_day_int := COALESCE(v_lease.payment_due_day, 1);

  -- Start cursor at the first month with due_date > CURRENT_DATE so we
  -- don't re-create rows for already-billed months.
  IF EXTRACT(DAY FROM v_lease.start_date)::integer <= due_day_int THEN
    cursor_date := (DATE_TRUNC('month', v_lease.start_date) + ((due_day_int - 1) || ' days')::interval)::date;
  ELSE
    cursor_date := (DATE_TRUNC('month', v_lease.start_date) + INTERVAL '1 month' + ((due_day_int - 1) || ' days')::interval)::date;
  END IF;
  WHILE cursor_date <= CURRENT_DATE LOOP
    cursor_date := (cursor_date + INTERVAL '1 month')::date;
  END LOOP;

  WHILE cursor_date <= v_lease.end_date LOOP
    FOR i IN 1..n LOOP
      tenant := primary_ids[i];
      IF i = 1 THEN
        share_amount := ((base_cents + remainder_cents)::NUMERIC / 100.0);
      ELSE
        share_amount := (base_cents::NUMERIC / 100.0);
      END IF;

      INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
      VALUES (p_lease_id, tenant, share_amount, 'rent', 'pending', cursor_date)
      ON CONFLICT (lease_id, tenant_id, due_date) WHERE type = 'rent' DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows > 0 THEN v_created := v_created + 1; END IF;
    END LOOP;
    cursor_date := (cursor_date + INTERVAL '1 month')::date;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped_paid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.regenerate_rent_schedule(UUID) TO authenticated;
