-- 026_late_fees.sql
-- Per-landlord late-fee rules + a self-reference on payments so a
-- late_fee row can point back to the rent payment that triggered it.
-- Off by default — landlords opt in via the Settings UI.

-- ── Late-fee config columns on profiles (landlord) ───────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_enabled    BOOLEAN       NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_amount     NUMERIC(10,2) NOT NULL DEFAULT 50.00;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_grace_days INTEGER       NOT NULL DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_type       TEXT          NOT NULL DEFAULT 'flat'
  CHECK (late_fee_type IN ('flat', 'percent'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS late_fee_percent    NUMERIC(5,2)  NOT NULL DEFAULT 5.00;

-- ── Self-reference on payments to link a late_fee to the rent it relates to ─

ALTER TABLE payments ADD COLUMN IF NOT EXISTS triggered_by_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_triggered_by ON payments(triggered_by_payment_id);

-- ── RPC: overdue rent payments eligible for a late fee today ─────────────
-- Returns rent payments that:
--   • are still pending,
--   • are past the landlord's grace window,
--   • belong to a landlord who has late_fee_enabled,
--   • don't already have a late_fee child row.

CREATE OR REPLACE FUNCTION public.overdue_payments_for_late_fee()
RETURNS TABLE(
  payment_id          UUID,
  tenant_id           UUID,
  lease_id            UUID,
  rent_amount         NUMERIC,
  due_date            DATE,
  manager_id          UUID,
  tenant_email        TEXT,
  tenant_name         TEXT,
  property_name       TEXT,
  unit_number         TEXT,
  late_fee_amount     NUMERIC,
  late_fee_grace_days INTEGER,
  late_fee_type       TEXT,
  late_fee_percent    NUMERIC,
  email_enabled       BOOLEAN
) AS $$
  SELECT
    p.id,
    p.tenant_id,
    p.lease_id,
    p.amount,
    p.due_date,
    prop.manager_id,
    tp.email,
    tp.full_name,
    prop.name,
    u.unit_number,
    mp.late_fee_amount,
    mp.late_fee_grace_days,
    mp.late_fee_type,
    mp.late_fee_percent,
    tp.notification_email_enabled
  FROM public.payments p
  JOIN public.leases     l    ON l.id    = p.lease_id
  JOIN public.units      u    ON u.id    = l.unit_id
  JOIN public.properties prop ON prop.id = u.property_id
  JOIN public.profiles   mp   ON mp.id   = prop.manager_id
  JOIN public.profiles   tp   ON tp.id   = p.tenant_id
  WHERE p.status = 'pending'
    AND p.type   = 'rent'
    AND mp.late_fee_enabled = true
    AND p.due_date < (CURRENT_DATE - (mp.late_fee_grace_days || ' days')::interval)::date
    AND NOT EXISTS (
      SELECT 1 FROM public.payments lf
      WHERE lf.triggered_by_payment_id = p.id
        AND lf.type = 'late_fee'
    )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
