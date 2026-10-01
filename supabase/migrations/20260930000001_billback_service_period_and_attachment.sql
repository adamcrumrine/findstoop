-- 20260930000001_billback_service_period_and_attachment.sql
--
-- Two things a utility bill-back was missing, both about the tenant being
-- able to see what they're paying for:
--
--   1. The service period as data, not text. It was only ever baked into the
--      charge memo ("Water Jul 1–Jul 31", no year), and the pay screen shows
--      the charge type, not the memo, so tenants mostly never saw it. Stored
--      on the charge itself so tenant and landlord views can both show
--      "Service Jul 1 – Jul 31, 2026" without joining utility_bills (which
--      tenants can't read).
--
--   2. The bill itself. The landlord can attach the provider's bill; it is
--      stored as an ordinary lease document (so it also shows in Documents,
--      and tenant read access already exists) and linked from each charge.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS service_period_start   DATE,
  ADD COLUMN IF NOT EXISTS service_period_end     DATE,
  ADD COLUMN IF NOT EXISTS attachment_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN payments.service_period_start IS
  'First day of service the charge covers (utility bill-backs). Shown to tenants alongside the charge.';
COMMENT ON COLUMN payments.attachment_document_id IS
  'Supporting document for the charge — for a bill-back, the provider''s bill. Readable by everyone on the lease via documents RLS.';

ALTER TABLE utility_bills
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Existing bill-backs: lift the period off the bill record.
UPDATE payments p
   SET service_period_start = ub.period_start,
       service_period_end   = ub.period_end
  FROM utility_bills ub
 WHERE p.utility_bill_id = ub.id
   AND p.service_period_start IS NULL;

-- ── bill_back_utility: now takes the attached bill ────────────────────────
-- Dropped and recreated rather than replaced: adding a parameter would
-- otherwise leave the old 9-argument overload callable alongside it.
DROP FUNCTION IF EXISTS public.bill_back_utility(UUID, utility_type, NUMERIC, DATE, DATE, DATE, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.bill_back_utility(
  p_lease_id       UUID,
  p_utility_type   utility_type,
  p_amount         NUMERIC,
  p_period_start   DATE,
  p_period_end     DATE,
  p_due_date       DATE,
  p_provider_name  TEXT DEFAULT NULL,
  p_note           TEXT DEFAULT NULL,
  p_record_expense BOOLEAN DEFAULT TRUE,
  p_document_id    UUID DEFAULT NULL
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
  v_memo        TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'bill amount must be greater than zero';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'enter the service period the bill covers';
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

  -- The attachment must be a document on THIS lease. Tenants can read it
  -- through documents RLS precisely because it's on their lease; a document
  -- from another lease would show them a dead link at best.
  IF p_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM documents d WHERE d.id = p_document_id AND d.lease_id = p_lease_id
  ) THEN
    RAISE EXCEPTION 'the attached bill must be uploaded to the same lease';
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
    period_start, period_end, due_date, note, expense_id, created_by, billed_back_at,
    document_id
  ) VALUES (
    NULL, p_lease_id, p_utility_type, p_provider_name, p_amount,
    p_period_start, p_period_end, p_due_date, p_note, v_expense_id, auth.uid(), NOW(),
    p_document_id
  )
  RETURNING id INTO v_bill_id;

  -- The memo keeps the full service range (with year) so receipts and
  -- anything else that only reads the memo still say what was covered.
  -- FMDD, not D: 'D' is day-of-WEEK in Postgres.
  v_memo := INITCAP(p_utility_type::text)
    || COALESCE(' (' || NULLIF(TRIM(p_provider_name), '') || ')', '')
    || ' — service ' || to_char(p_period_start, 'FMMon FMDD, YYYY')
    || ' to ' || to_char(p_period_end, 'FMMon FMDD, YYYY');

  -- Penny-exact even split; the first primary absorbs the remainder so the
  -- charges sum to the bill exactly.
  v_total_cents := ROUND(p_amount * 100)::BIGINT;
  v_base_cents  := v_total_cents / v_n;
  v_remainder   := v_total_cents - (v_base_cents * v_n);

  FOR v_i IN 1..v_n LOOP
    v_share := ((v_base_cents + CASE WHEN v_i = 1 THEN v_remainder ELSE 0 END)::NUMERIC) / 100.0;
    INSERT INTO payments (
      lease_id, tenant_id, amount, type, status, due_date, memo, utility_bill_id,
      service_period_start, service_period_end, attachment_document_id
    ) VALUES (
      p_lease_id, v_primaries[v_i], v_share, 'utility', 'pending', p_due_date, v_memo, v_bill_id,
      p_period_start, p_period_end, p_document_id
    );
    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_bill_id, v_created, (v_base_cents::NUMERIC / 100.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── void_utility_billback: take the attached bill with it ─────────────────
-- The document was uploaded for this bill alone; leaving it behind would show
-- tenants a bill for a charge that no longer exists. (The storage object is
-- left for the client to remove — storage.objects isn't deletable from SQL.)
CREATE OR REPLACE FUNCTION public.void_utility_billback(p_bill_id UUID)
RETURNS TABLE(removed INTEGER) AS $$
DECLARE
  v_manager_ok  BOOLEAN;
  v_settled     INTEGER;
  v_removed     INTEGER := 0;
  v_expense_id  UUID;
  v_document_id UUID;
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

  SELECT expense_id, document_id INTO v_expense_id, v_document_id
    FROM utility_bills WHERE id = p_bill_id;
  DELETE FROM utility_bills WHERE id = p_bill_id;
  IF v_expense_id IS NOT NULL THEN
    DELETE FROM property_expenses WHERE id = v_expense_id;
  END IF;
  IF v_document_id IS NOT NULL THEN
    DELETE FROM documents WHERE id = v_document_id;
  END IF;

  RETURN QUERY SELECT v_removed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.bill_back_utility(UUID, utility_type, NUMERIC, DATE, DATE, DATE, TEXT, TEXT, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_utility_billback(UUID) TO authenticated;
