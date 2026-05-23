-- Tighten apply_rent_credit so a manager can't "credit" money back to a
-- tenant after the funds have already moved. Credits are a forward-only
-- discount against not-yet-committed payments — not a refund mechanism.
--
-- Old check: blocked only status='completed'.
-- New check: requires status='pending'. That rejects:
--   • 'completed' — already paid
--   • 'processing' — ACH initiated, funds committed to leave the tenant's bank
--   • 'failed' — already past terminal state

CREATE OR REPLACE FUNCTION public.apply_rent_credit(
  target_payment_id UUID,
  credit_amount NUMERIC,
  memo_text TEXT
) RETURNS payments AS $$
DECLARE
  target  payments%ROWTYPE;
  is_owner BOOLEAN;
  new_amt NUMERIC;
  new_memo TEXT;
  credit_row payments%ROWTYPE;
BEGIN
  IF credit_amount IS NULL OR credit_amount <= 0 THEN
    RAISE EXCEPTION 'credit_amount must be positive';
  END IF;
  IF memo_text IS NULL OR length(trim(memo_text)) = 0 THEN
    RAISE EXCEPTION 'memo_text is required';
  END IF;

  SELECT * INTO target FROM payments WHERE id = target_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM leases l
    JOIN units u ON u.id = l.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE l.id = target.lease_id AND p.manager_id = auth.uid()
  ) INTO is_owner;
  IF NOT is_owner THEN
    RAISE EXCEPTION 'Not authorized to credit this payment';
  END IF;

  IF target.status <> 'pending' THEN
    RAISE EXCEPTION 'Credits can only be applied to pending payments — % rows have already moved funds (processing) or settled (completed/failed).', target.status;
  END IF;

  new_amt := GREATEST(target.amount - credit_amount, 0);
  new_memo := COALESCE(target.memo || E'\n', '') ||
    'Credit $' || credit_amount::text || ' applied: ' || memo_text;

  UPDATE payments SET amount = new_amt, memo = new_memo WHERE id = target.id
    RETURNING * INTO target;

  INSERT INTO payments (lease_id, tenant_id, amount, type, status, memo, paid_at)
  VALUES (target.lease_id, target.tenant_id, credit_amount, 'credit', 'completed', memo_text, NOW())
  RETURNING * INTO credit_row;

  RETURN target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
