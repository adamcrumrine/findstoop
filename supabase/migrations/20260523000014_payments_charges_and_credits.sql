-- Manual charges and credits on the Payments page.
--
-- (1) Adds 'fee', 'fine', and 'credit' to the payment_type enum so managers can
--     record one-off charges or apply credits without abusing 'other'.
-- (2) Adds a memo column so the *why* travels with the row (e.g., "Tenant paid
--     for mulch this month - $99.23 credit applied to next month's rent").
-- (3) Lets managers INSERT payments on their own leases (previously only
--     tenants could insert).
-- (4) RPC apply_rent_credit(target_payment_id, credit_amount, memo) — subtracts
--     credit_amount from the target payment.amount, appends an audit memo, and
--     inserts a 'credit' row for the audit trail. Runs as SECURITY DEFINER but
--     verifies the caller is the manager of the target lease.

ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'fee';
ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'fine';
ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'credit';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS memo TEXT;

-- Manager INSERT policy
DROP POLICY IF EXISTS "payments_manager_insert" ON payments;
CREATE POLICY "payments_manager_insert" ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = payments.lease_id AND p.manager_id = auth.uid()
    )
  );

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

  -- Verify caller owns the property the lease is on.
  SELECT EXISTS (
    SELECT 1 FROM leases l
    JOIN units u ON u.id = l.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE l.id = target.lease_id AND p.manager_id = auth.uid()
  ) INTO is_owner;
  IF NOT is_owner THEN
    RAISE EXCEPTION 'Not authorized to credit this payment';
  END IF;

  IF target.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot apply a credit to a completed payment';
  END IF;

  new_amt := GREATEST(target.amount - credit_amount, 0);
  new_memo := COALESCE(target.memo || E'\n', '') ||
    'Credit $' || credit_amount::text || ' applied: ' || memo_text;

  UPDATE payments SET amount = new_amt, memo = new_memo WHERE id = target.id
    RETURNING * INTO target;

  -- Audit row — captures the credit as its own payment-typed entry.
  INSERT INTO payments (lease_id, tenant_id, amount, type, status, memo, paid_at)
  VALUES (target.lease_id, target.tenant_id, credit_amount, 'credit', 'completed', memo_text, NOW())
  RETURNING * INTO credit_row;

  RETURN target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.apply_rent_credit(UUID, NUMERIC, TEXT) TO authenticated;
