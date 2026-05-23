-- 025_lifecycle.sql
-- Lifecycle email infrastructure, modeled on the Prospekteer lifecycle pattern.
-- One audit table for every email FindStoop sends programmatically. Used
-- first for rent reminders, then onboarding / re-engagement / win-back as we
-- add them.

-- ── Notification preferences on profiles ──────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_email_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_sms_enabled   BOOLEAN NOT NULL DEFAULT false;

-- ── Audit log: every lifecycle email that's been fired ────────────────────
-- A unique constraint on (trigger_key, dedup_token) gives idempotency:
-- fireTrigger() inserts and on conflict, no-ops.

CREATE TABLE IF NOT EXISTS lifecycle_events (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key          TEXT         NOT NULL,
  user_id              UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email      TEXT         NOT NULL,
  dedup_token          TEXT         NOT NULL,
  template_vars        JSONB,
  status               TEXT         NOT NULL DEFAULT 'sent',
  resend_message_id    TEXT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_trigger_dedup UNIQUE (trigger_key, dedup_token)
);

CREATE INDEX idx_lifecycle_events_user        ON lifecycle_events(user_id);
CREATE INDEX idx_lifecycle_events_trigger_key ON lifecycle_events(trigger_key);
CREATE INDEX idx_lifecycle_events_created_at  ON lifecycle_events(created_at);

ALTER TABLE lifecycle_events ENABLE ROW LEVEL SECURITY;

-- Users see their own lifecycle history.
CREATE POLICY "lifecycle_events_user_select" ON lifecycle_events
  FOR SELECT USING (user_id = auth.uid());

-- Admin sees everything.
CREATE POLICY "lifecycle_events_admin_all" ON lifecycle_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Global pause toggles per trigger ──────────────────────────────────────
-- Admin can pause any trigger key without redeploying.

CREATE TABLE IF NOT EXISTS lifecycle_trigger_config (
  trigger_key  TEXT         PRIMARY KEY,
  paused       BOOLEAN      NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE lifecycle_trigger_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lifecycle_trigger_config_admin_all" ON lifecycle_trigger_config
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Helper: upcoming pending rent payments for reminder ──────────────────
-- Returns rows the cron should consider for a given days_before window.
-- The fireTrigger() dedup_token (built from payment_id + days_before)
-- prevents double-sending in the function layer.

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
    AND p.due_date = (CURRENT_DATE + (days_before || ' days')::interval)::date
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
