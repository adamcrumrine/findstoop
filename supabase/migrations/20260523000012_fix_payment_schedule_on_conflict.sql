-- Fix the payment-schedule generator trigger.
--
-- The original used `ON CONFLICT ON CONSTRAINT unique_rent_per_lease_due_date`,
-- but that target is a *partial* unique index (it has a WHERE clause), and
-- Postgres only accepts `ON CONFLICT ON CONSTRAINT` for actual constraints.
-- The correct form for a partial unique index is `ON CONFLICT (cols) WHERE ...`.
--
-- This caused the trigger to raise
--   constraint "unique_rent_per_lease_due_date" for table "payments" does not exist
-- whenever a lease flipped to active (i.e., when the last party signed),
-- blocking the signature insert.

CREATE OR REPLACE FUNCTION public.generate_payment_schedule_for_lease()
RETURNS TRIGGER AS $$
DECLARE
  cursor_date DATE;
  due_day_int INTEGER;
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND NEW.payment_schedule_generated_at IS NULL THEN

    due_day_int := COALESCE(NEW.payment_due_day, 1);

    IF EXTRACT(DAY FROM NEW.start_date)::integer <= due_day_int THEN
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + ((due_day_int - 1) || ' days')::interval)::date;
    ELSE
      cursor_date := (DATE_TRUNC('month', NEW.start_date) + INTERVAL '1 month' + ((due_day_int - 1) || ' days')::interval)::date;
    END IF;

    WHILE cursor_date <= NEW.end_date LOOP
      INSERT INTO public.payments (lease_id, tenant_id, amount, type, status, due_date)
      VALUES (NEW.id, NEW.tenant_id, NEW.rent_amount, 'rent', 'pending', cursor_date)
      ON CONFLICT (lease_id, due_date) WHERE type = 'rent' DO NOTHING;
      cursor_date := (cursor_date + INTERVAL '1 month')::date;
    END LOOP;

    NEW.payment_schedule_generated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
