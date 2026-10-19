-- 20261019000004_no_rent_schedule_before_signing.sql
--
-- regenerate_rent_schedule built a full rent schedule for ANY lease, signed
-- or not. The review page calls it on "Save charges", so setting shares on
-- an unsigned renewal created a year of pending rent rows on a lease nobody
-- had agreed to — rows that would come due (and autopay) even if the
-- renewal fell through. Two 301/303 E 14th renewals hit this 2026-10-19.
--
-- A lease's schedule belongs to activation: generate_payment_schedule_for_lease
-- builds it when the lease goes active. So for a lease that isn't active,
-- regenerate now only clears future pending rent/pet-fee rows and creates
-- nothing. Then remove the stray rows already sitting on unsigned leases
-- whose schedule was never generated (activation will rebuild them).

CREATE OR REPLACE FUNCTION public.regenerate_rent_schedule(p_lease_id uuid)
 RETURNS TABLE(created_count integer, skipped_paid_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Unsigned (or ended) lease: no schedule. Activation builds it.
  IF v_lease.status IS DISTINCT FROM 'active' THEN
    RETURN QUERY SELECT 0, v_skipped_paid;
    RETURN;
  END IF;

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
$function$;

-- Stray schedules already on unsigned leases. Only untouched rows: pending,
-- future-dated, on a pending lease whose schedule was never generated (so
-- activation will regenerate them with the then-current split).
DELETE FROM public.payments p
 USING public.leases l
 WHERE p.lease_id = l.id
   AND l.status = 'pending'
   AND l.payment_schedule_generated_at IS NULL
   AND p.type IN ('rent', 'pet_fee')
   AND p.status = 'pending'
   AND p.due_date > CURRENT_DATE;
