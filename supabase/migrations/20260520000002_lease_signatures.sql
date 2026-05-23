-- 022_lease_signatures.sql
-- Per-signer audit trail for electronic lease signatures.
-- Captures intent, signature image, timestamp, IP, and user agent
-- to meet ESIGN Act record-retention requirements.

CREATE TABLE IF NOT EXISTS lease_signatures (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id             UUID         NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  signer_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signer_role          user_role    NOT NULL,
  signature_data       TEXT         NOT NULL,  -- base64 PNG data URI
  signed_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ip_address           TEXT,
  user_agent           TEXT,
  intent_acknowledged  BOOLEAN      NOT NULL DEFAULT false,
  CONSTRAINT unique_signer_per_lease UNIQUE (lease_id, signer_id)
);

CREATE INDEX idx_lease_signatures_lease ON lease_signatures(lease_id);
CREATE INDEX idx_lease_signatures_signer ON lease_signatures(signer_id);

-- Track when a lease was sent for signature (vs. fully signed in leases.signed_at)
ALTER TABLE leases ADD COLUMN IF NOT EXISTS sent_for_signature_at TIMESTAMPTZ;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE lease_signatures ENABLE ROW LEVEL SECURITY;

-- A signer can see and insert their own signature
CREATE POLICY "lease_signatures_signer_select" ON lease_signatures
  FOR SELECT USING (auth.uid() = signer_id);

CREATE POLICY "lease_signatures_signer_insert" ON lease_signatures
  FOR INSERT WITH CHECK (auth.uid() = signer_id);

-- Managers see signatures on leases they own (via existing helper)
CREATE POLICY "lease_signatures_manager_select" ON lease_signatures
  FOR SELECT USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

-- Tenants see signatures on their own lease
CREATE POLICY "lease_signatures_tenant_select" ON lease_signatures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = lease_signatures.lease_id AND l.tenant_id = auth.uid()
    )
  );

-- Admin sees everything (uses helper added in 021_admin_role)
CREATE POLICY "lease_signatures_admin_all" ON lease_signatures
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Auto-finalize lease when both parties have signed ──────────────────────
-- When a lease has both a manager signature and a tenant signature,
-- set leases.signed_at and flip status from 'pending' to 'active'.

CREATE OR REPLACE FUNCTION finalize_lease_on_dual_signature()
RETURNS TRIGGER AS $$
DECLARE
  has_manager_sig BOOLEAN;
  has_tenant_sig  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM lease_signatures
    WHERE lease_id = NEW.lease_id AND signer_role::text = 'manager'
  ) INTO has_manager_sig;

  SELECT EXISTS (
    SELECT 1 FROM lease_signatures
    WHERE lease_id = NEW.lease_id AND signer_role::text = 'tenant'
  ) INTO has_tenant_sig;

  IF has_manager_sig AND has_tenant_sig THEN
    UPDATE leases
       SET signed_at = COALESCE(signed_at, NOW()),
           status    = CASE WHEN status = 'pending' THEN 'active'::lease_status ELSE status END
     WHERE id = NEW.lease_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_lease_signature_finalize ON lease_signatures;
CREATE TRIGGER on_lease_signature_finalize
  AFTER INSERT ON lease_signatures
  FOR EACH ROW EXECUTE FUNCTION finalize_lease_on_dual_signature();
