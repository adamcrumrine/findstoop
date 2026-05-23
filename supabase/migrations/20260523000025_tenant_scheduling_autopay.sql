-- Tenant payment scheduling + autopay.
--
-- Three additions:
--   * payments.scheduled_for       — date the tenant (or autopay) will be
--                                    charged. Defaults to due_date.
--   * payments.original_due_date   — captures the unmoved due_date so the
--                                    late-fee trigger always fires at
--                                    original_due_date + 7 days, regardless
--                                    of how the tenant shifted scheduled_for.
--   * profiles.autopay_enabled     — tenant toggle. When TRUE, the daily
--                                    cron charges scheduled_for=today.
--   * profiles.stripe_default_payment_method_id — Stripe PM id to charge
--                                    off-session.
--
-- One RPC: reschedule_payment(payment_id, new_date) — tenant-callable, clamps
-- the shift to ±7 days from the *original* due date.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS scheduled_for     DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_due_date DATE;

-- Backfill: original_due_date = due_date for existing rows.
UPDATE payments SET original_due_date = due_date WHERE original_due_date IS NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS autopay_enabled                  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id TEXT;

CREATE OR REPLACE FUNCTION public.reschedule_payment(
  target_payment_id UUID,
  new_date DATE
) RETURNS payments AS $$
DECLARE
  target  payments%ROWTYPE;
  anchor  DATE;
  diff    INTEGER;
BEGIN
  SELECT * INTO target FROM payments WHERE id = target_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  -- Tenant must own the payment to reschedule it.
  IF target.tenant_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to reschedule this payment';
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payments can be rescheduled';
  END IF;

  anchor := COALESCE(target.original_due_date, target.due_date);
  IF anchor IS NULL THEN
    RAISE EXCEPTION 'Payment has no due date to anchor the shift against';
  END IF;

  diff := ABS(new_date - anchor);
  IF diff > 7 THEN
    RAISE EXCEPTION 'New date must be within 7 days of the original due date';
  END IF;

  UPDATE payments
     SET scheduled_for = new_date,
         original_due_date = COALESCE(original_due_date, due_date)
   WHERE id = target.id
   RETURNING * INTO target;

  RETURN target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.reschedule_payment(UUID, DATE) TO authenticated;
