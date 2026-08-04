-- Stop chasing rent on leases that aren't being collected through Stoop yet.
--
-- Hawk's portfolio was imported with full historical rent schedules. Eight of
-- those tenants have never signed in — they were invited and never onboarded,
-- and they still pay their landlord the way they always have. Their imported
-- pending rent rows are therefore not debts Stoop knows anything about, but
-- every overdue-rent surface treats them as delinquencies: the Payments screen
-- shows "Rent for Tammy Ring is 33 days late — send notice", and the day
-- late_fee_enabled gets switched on, the nightly cron would post real late-fee
-- charges against people who never agreed to pay through this system.
--
-- Why an explicit column rather than inferring it:
--
-- Every derived signal tested has a false positive that silences a REAL
-- delinquent tenant, which is the expensive direction to be wrong in.
--   • "no Stripe payments yet" — Unit 301 has none; its ACH is still settling.
--   • "no saved payment method" — Elizabeth Henrikson has signed in, has no
--     payment method, and is past due. She is exactly who the notice workflow
--     exists for, and she is indistinguishable from a dormant tenant.
--   • "never signed in" — the honest signal, but it lives in auth.users, which
--     the browser cannot read, and a bulk invite script can stamp it anyway.
--
-- So the pause is recorded as state, set deliberately, visible, and reversible.
-- Null means "collect normally" — an unpaused lease behaves exactly as before,
-- so this migration changes no existing behaviour on its own.

ALTER TABLE leases ADD COLUMN IF NOT EXISTS collections_paused_at     TIMESTAMPTZ;
ALTER TABLE leases ADD COLUMN IF NOT EXISTS collections_paused_reason TEXT;

COMMENT ON COLUMN leases.collections_paused_at IS
  'When set, this lease is not being collected through Stoop: no late-payment '
  'notice prompts, no automated late fees, no overdue reminders. Cleared '
  'automatically the first time a tenant on the lease sets up a payment method.';

-- ── Backfill: active leases whose tenants have all never signed in ──────────
--
-- Scoped to leases with imported rent history and no onboarded tenant. A lease
-- with even one signed-in tenant is left alone: somebody is using Stoop there,
-- so overdue rent on it is a real question the landlord should be asked.
UPDATE leases l
   SET collections_paused_at     = now(),
       collections_paused_reason = 'Imported lease — tenants have not moved to Stoop yet'
 WHERE l.collections_paused_at IS NULL
   AND l.status = 'active'
   AND NOT EXISTS (
     SELECT 1
       FROM public.lease_tenants lt
       JOIN auth.users u ON u.id = lt.tenant_id
      WHERE lt.lease_id = l.id
        AND u.last_sign_in_at IS NOT NULL
   );

-- ── Auto-resume ────────────────────────────────────────────────────────────
--
-- A pause that only a human can lift is a pause somebody forgets. The moment a
-- tenant on the lease sets up a payment method they have moved onto Stoop
-- rails, and collections should resume without anyone remembering to flip
-- this back. Signing in alone is not enough — a tenant may look around and
-- still pay by check.
CREATE OR REPLACE FUNCTION public.resume_collections_on_payment_method()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_method_setup_at IS NOT NULL
     AND OLD.payment_method_setup_at IS NULL THEN
    UPDATE public.leases l
       SET collections_paused_at     = NULL,
           collections_paused_reason = NULL
     WHERE l.collections_paused_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.lease_tenants lt
          WHERE lt.lease_id = l.id AND lt.tenant_id = NEW.id
       );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_resume_collections ON public.profiles;
CREATE TRIGGER trg_resume_collections
  AFTER UPDATE OF payment_method_setup_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.resume_collections_on_payment_method();

-- ── Teach the money-moving path to respect the pause ────────────────────────
--
-- This is the half that matters. The banner is noise; this is a charge posted
-- to a tenant's ledger. Late fees are currently disabled on Hawk's account, so
-- nothing has been assessed — but "we were saved by a setting being off" is
-- not a safeguard, and that setting is one click from being on.
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
    AND l.collections_paused_at IS NULL   -- added: never bill a dormant lease
    AND p.due_date < (CURRENT_DATE - (mp.late_fee_grace_days || ' days')::interval)::date
    AND NOT EXISTS (
      SELECT 1 FROM public.payments lf
      WHERE lf.triggered_by_payment_id = p.id
        AND lf.type = 'late_fee'
    )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- Same guard on the reminder path. A dormant tenant should not get "rent is
-- due tomorrow" email or SMS about a schedule they never signed up for — and
-- for Hawk's imported rows, every one of those reminders would be wrong about
-- how the tenant actually pays.
CREATE OR REPLACE FUNCTION public.pending_rent_payments_for_reminder(days_before INTEGER)
RETURNS TABLE(
  payment_id   UUID,
  tenant_id    UUID,
  lease_id     UUID,
  amount       NUMERIC,
  due_date     DATE,
  tenant_email TEXT,
  tenant_name  TEXT,
  property_name TEXT,
  unit_number  TEXT,
  email_enabled BOOLEAN
) AS $$
  SELECT
    p.id,
    p.tenant_id,
    p.lease_id,
    p.amount,
    p.due_date,
    pr.email,
    pr.full_name,
    prop.name,
    u.unit_number,
    pr.notification_email_enabled
  FROM public.payments p
  JOIN public.profiles  pr   ON pr.id   = p.tenant_id
  JOIN public.leases    l    ON l.id    = p.lease_id
  JOIN public.units     u    ON u.id    = l.unit_id
  JOIN public.properties prop ON prop.id = u.property_id
  WHERE p.status   = 'pending'
    AND p.type     = 'rent'
    AND l.collections_paused_at IS NULL   -- added: no reminders on a dormant lease
    AND p.due_date = (CURRENT_DATE + (days_before || ' days')::interval)::date
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
