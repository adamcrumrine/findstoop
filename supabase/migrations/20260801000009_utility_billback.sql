-- 20260801000009_utility_billback.sql
--
-- Billing a third-party utility back to tenants.
--
-- The landlord pays the water company, then recovers it from the household.
-- The amount isn't known until the bill lands, so this can't be a recurring
-- schedule like rent — it's entered once per billing period.
--
-- ACCOUNTING: a bill-back is TWO entries, not one.
--   • what the landlord pays the utility  → expense  (Schedule E line 17)
--   • what the tenants repay              → income   (Schedule E line 3)
-- They don't net out on the return even though they roughly net to zero in
-- the landlord's pocket. Recording only the tenant charge overstates income;
-- recording only the bill understates it. So one action writes both sides and
-- links them, which also makes the pair reconcilable later.
--
-- The utility_bills/utilities tables already existed but were never used
-- (no rows, no API, no UI). Rather than add a third overlapping concept this
-- adopts utility_bills as the source record and relaxes the parts that forced
-- a landlord to pre-configure a `utilities` row before entering a bill.

-- ── Make the bill row usable on its own ───────────────────────────────────
ALTER TABLE utility_bills ALTER COLUMN utility_id DROP NOT NULL;

ALTER TABLE utility_bills
  ADD COLUMN IF NOT EXISTS utility_type    utility_type,
  ADD COLUMN IF NOT EXISTS provider_name   TEXT,
  ADD COLUMN IF NOT EXISTS note            TEXT,
  ADD COLUMN IF NOT EXISTS expense_id      UUID REFERENCES property_expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billed_back_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN utility_bills.expense_id IS
  'The property_expenses row (category=utilities) recording what the landlord paid the provider. The tenant-facing side is the payments rows carrying type=utility and this bill id in their memo.';
COMMENT ON COLUMN utility_bills.billed_back_at IS
  'Set once tenant charges have been generated. Non-null blocks a second bill-back, so a double submit can never double-charge the household.';

-- Link tenant charges back to the bill that produced them. A dedicated
-- column (rather than parsing the memo) keeps voiding exact.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS utility_bill_id UUID REFERENCES utility_bills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_utility_bill ON payments(utility_bill_id)
  WHERE utility_bill_id IS NOT NULL;

-- ── Manager RLS on the bill record ────────────────────────────────────────
ALTER TABLE utility_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "utility_bills_manager_all" ON utility_bills;
CREATE POLICY "utility_bills_manager_all" ON utility_bills
  FOR ALL USING (
    lease_id IN (SELECT get_manager_lease_ids(auth.uid()))
  ) WITH CHECK (
    lease_id IN (SELECT get_manager_lease_ids(auth.uid()))
  );

-- ── Bill it back ──────────────────────────────────────────────────────────
-- Records the bill, optionally the landlord's expense, and one evenly-split
-- charge per primary tenant. Utilities split evenly regardless of the lease's
-- rent split mode: they track occupancy, not room size.
CREATE OR REPLACE FUNCTION public.bill_back_utility(
  p_lease_id       UUID,
  p_utility_type   utility_type,
  p_amount         NUMERIC,
  p_period_start   DATE,
  p_period_end     DATE,
  p_due_date       DATE,
  p_provider_name  TEXT DEFAULT NULL,
  p_note           TEXT DEFAULT NULL,
  p_record_expense BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(bill_id UUID, charges_created INTEGER, per_tenant NUMERIC) AS $$
DECLARE
  v_manager_ok  BOOLEAN;
  v_property_id UUID;
  v_bill_id     UUID;
  v_expense_id  UUID;
  v_primaries   UUID[];
  v_n           INTEGER;
  v_total_cents BIGINT;
  v_base_cents  BIGINT;
  v_remainder   BIGINT;
  v_i           INTEGER;
  v_share       NUMERIC(10,2);
  v_created     INTEGER := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'bill amount must be greater than zero';
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'billing period ends before it starts';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM leases l
      JOIN units u      ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
     WHERE l.id = p_lease_id AND p.manager_id = auth.uid()
  ) INTO v_manager_ok;
  IF NOT v_manager_ok THEN
    RAISE EXCEPTION 'not authorized to bill this lease';
  END IF;

  SELECT u.property_id INTO v_property_id
    FROM leases l JOIN units u ON u.id = l.unit_id
   WHERE l.id = p_lease_id;

  -- Primary tenants carry the charge, same set that carries rent.
  SELECT array_agg(lt.tenant_id ORDER BY lt.sort_order NULLS LAST, lt.added_at)
    INTO v_primaries
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary;

  IF v_primaries IS NULL OR array_length(v_primaries, 1) IS NULL THEN
    SELECT ARRAY[l.tenant_id] INTO v_primaries FROM leases l WHERE l.id = p_lease_id;
  END IF;
  v_n := array_length(v_primaries, 1);
  IF v_n IS NULL OR v_n = 0 THEN
    RAISE EXCEPTION 'no tenants on this lease to bill';
  END IF;

  -- Landlord's cost side, so Schedule E line 17 stays right without the bill
  -- being typed in twice.
  IF p_record_expense THEN
    INSERT INTO property_expenses (property_id, category, amount, expense_date, vendor, note)
    VALUES (
      v_property_id, 'utilities', p_amount, p_period_end,
      p_provider_name,
      COALESCE(p_note, '') || CASE WHEN p_note IS NULL THEN '' ELSE ' — ' END
        || 'billed back to tenants'
    )
    RETURNING id INTO v_expense_id;
  END IF;

  INSERT INTO utility_bills (
    utility_id, lease_id, utility_type, provider_name, amount,
    period_start, period_end, due_date, note, expense_id, created_by, billed_back_at
  ) VALUES (
    NULL, p_lease_id, p_utility_type, p_provider_name, p_amount,
    p_period_start, p_period_end, p_due_date, p_note, v_expense_id, auth.uid(), NOW()
  )
  RETURNING id INTO v_bill_id;

  -- Penny-exact even split; the first primary absorbs the remainder so the
  -- charges sum to the bill exactly.
  v_total_cents := ROUND(p_amount * 100)::BIGINT;
  v_base_cents  := v_total_cents / v_n;
  v_remainder   := v_total_cents - (v_base_cents * v_n);

  FOR v_i IN 1..v_n LOOP
    v_share := ((v_base_cents + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END)::NUMERIC) / 100.0;
    INSERT INTO payments (lease_id, tenant_id, amount, type, status, due_date, memo, utility_bill_id)
    VALUES (
      p_lease_id, v_primaries[v_i], v_share, 'utility', 'pending', p_due_date,
      -- FMDD, not D: 'D' is day-of-WEEK in Postgres, so a Jul 1–31 period
      -- rendered as "Jul 4–Jul 6" on the tenant's charge.
      INITCAP(p_utility_type::text) || ' ' || to_char(p_period_start, 'FMMon FMDD') || '–' || to_char(p_period_end, 'FMMon FMDD'),
      v_bill_id
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_bill_id, v_created, (v_base_cents::NUMERIC / 100.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Undo a mis-entered bill ───────────────────────────────────────────────
-- Safe only while every charge is still untouched. Once a tenant has paid (or
-- an ACH is in flight) the money has moved and history must not be rewritten
-- — issue a credit instead, which is why this refuses rather than deleting.
CREATE OR REPLACE FUNCTION public.void_utility_billback(p_bill_id UUID)
RETURNS TABLE(removed INTEGER) AS $$
DECLARE
  v_manager_ok BOOLEAN;
  v_settled    INTEGER;
  v_removed    INTEGER := 0;
  v_expense_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM utility_bills ub
      JOIN leases l     ON l.id = ub.lease_id
      JOIN units u      ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
     WHERE ub.id = p_bill_id AND p.manager_id = auth.uid()
  ) INTO v_manager_ok;
  IF NOT v_manager_ok THEN
    RAISE EXCEPTION 'not authorized to void this bill';
  END IF;

  SELECT COUNT(*) INTO v_settled
    FROM payments WHERE utility_bill_id = p_bill_id AND status <> 'pending';
  IF v_settled > 0 THEN
    RAISE EXCEPTION 'a tenant has already paid part of this bill — issue a credit instead of voiding';
  END IF;

  DELETE FROM payments WHERE utility_bill_id = p_bill_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  SELECT expense_id INTO v_expense_id FROM utility_bills WHERE id = p_bill_id;
  DELETE FROM utility_bills WHERE id = p_bill_id;
  IF v_expense_id IS NOT NULL THEN
    DELETE FROM property_expenses WHERE id = v_expense_id;
  END IF;

  RETURN QUERY SELECT v_removed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.bill_back_utility(UUID, utility_type, NUMERIC, DATE, DATE, DATE, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_utility_billback(UUID) TO authenticated;
