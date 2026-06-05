-- 20260603000001_document_automation.sql
-- Document Automation ("Letters & Notices").
--
-- Generates the recurring landlord letters (rent increase, lease renewal,
-- late-payment series, move-out, deposit disposition, entry notice, violation,
-- maintenance acknowledgment) from data the app already holds, behind a human
-- review gate and an Ohio-first state gate. Delivery is download / email /
-- in-house e-signature. The rendered HTML is the source of truth — the print
-- route re-renders it on demand (no PDF storage), matching LeasePdf.tsx.
--
-- New tables only — the existing `documents` table (file uploads) is untouched.

-- ── generated_documents ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_documents (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id         UUID         REFERENCES units(id) ON DELETE SET NULL,
  lease_id        UUID         REFERENCES leases(id) ON DELETE SET NULL,
  tenant_id       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  type            TEXT         NOT NULL,  -- 'rent_increase' | 'lease_renewal' | 'late_payment_d5' | …
  template_key    TEXT         NOT NULL,  -- e.g. 'OH/rent_increase'
  template_version TEXT        NOT NULL DEFAULT '1.0.0',
  status          TEXT         NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'pending_review', 'sent', 'signed', 'voided')),
  title           TEXT         NOT NULL,  -- human label shown in lists
  field_values    JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- collected + edited merge data
  generated_body  TEXT,        -- rendered HTML after merge
  pdf_url         TEXT,        -- reserved: stored copy (client-print MVP leaves null)
  delivery_method TEXT         CHECK (delivery_method IN ('download', 'email', 'esign')),
  requires_signature BOOLEAN   NOT NULL DEFAULT false,
  sent_at         TIMESTAMPTZ,
  signed_at       TIMESTAMPTZ,
  voided_at       TIMESTAMPTZ,
  created_by      UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  meta            JSONB        NOT NULL DEFAULT '{}'::jsonb  -- series step, escalation dates, etc.
);

CREATE INDEX idx_generated_documents_property ON generated_documents(property_id);
CREATE INDEX idx_generated_documents_lease    ON generated_documents(lease_id);
CREATE INDEX idx_generated_documents_tenant   ON generated_documents(tenant_id);
CREATE INDEX idx_generated_documents_status   ON generated_documents(status);
CREATE INDEX idx_generated_documents_created  ON generated_documents(created_at DESC);

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION touch_generated_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_generated_documents_touch ON generated_documents;
CREATE TRIGGER on_generated_documents_touch
  BEFORE UPDATE ON generated_documents
  FOR EACH ROW EXECUTE FUNCTION touch_generated_documents_updated_at();

-- ── generated_document_events (audit trail) ────────────────────────────────

CREATE TABLE IF NOT EXISTS generated_document_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID         NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  actor_id     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  event        TEXT         NOT NULL,  -- created | reviewed | edited | sent | opened | signed | voided
  meta         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_document_events_doc ON generated_document_events(document_id, created_at);

-- ── generated_document_signatures (mirrors lease_signatures) ───────────────
-- Reuses the in-house ESIGN pattern: signer image + intent + IP + user agent.

CREATE TABLE IF NOT EXISTS generated_document_signatures (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id          UUID         NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  signer_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signer_role          user_role    NOT NULL,
  signature_data       TEXT         NOT NULL,  -- base64 PNG data URI
  signed_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ip_address           TEXT,
  user_agent           TEXT,
  intent_acknowledged  BOOLEAN      NOT NULL DEFAULT false,
  CONSTRAINT unique_signer_per_generated_document UNIQUE (document_id, signer_id)
);

CREATE INDEX idx_generated_document_signatures_doc    ON generated_document_signatures(document_id);
CREATE INDEX idx_generated_document_signatures_signer ON generated_document_signatures(signer_id);

-- ── late_payment_series (drives the Payments banner without a cron job) ─────

CREATE TABLE IF NOT EXISTS late_payment_series (
  lease_id          UUID         PRIMARY KEY REFERENCES leases(id) ON DELETE CASCADE,
  day5_doc_id       UUID         REFERENCES generated_documents(id) ON DELETE SET NULL,
  day10_doc_id      UUID         REFERENCES generated_documents(id) ON DELETE SET NULL,
  day15_doc_id      UUID         REFERENCES generated_documents(id) ON DELETE SET NULL,
  next_step         TEXT         NOT NULL DEFAULT 'day5'
                      CHECK (next_step IN ('day5', 'day10', 'day15', 'done')),
  next_eligible_on  DATE,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Manager: docs on properties they own. Tenant: docs addressed to them.
-- Admin: everything (is_admin() helper from 021_admin_role).

ALTER TABLE generated_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_document_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_document_signatures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_payment_series            ENABLE ROW LEVEL SECURITY;

-- generated_documents -------------------------------------------------------

CREATE POLICY "generated_documents_manager_all" ON generated_documents
  FOR ALL USING (
    property_id IN (SELECT id FROM properties WHERE manager_id = auth.uid())
  ) WITH CHECK (
    property_id IN (SELECT id FROM properties WHERE manager_id = auth.uid())
  );

CREATE POLICY "generated_documents_tenant_select" ON generated_documents
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "generated_documents_admin_all" ON generated_documents
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- generated_document_events -------------------------------------------------

CREATE POLICY "generated_document_events_manager_all" ON generated_document_events
  FOR ALL USING (
    document_id IN (
      SELECT id FROM generated_documents
      WHERE property_id IN (SELECT id FROM properties WHERE manager_id = auth.uid())
    )
  ) WITH CHECK (
    document_id IN (
      SELECT id FROM generated_documents
      WHERE property_id IN (SELECT id FROM properties WHERE manager_id = auth.uid())
    )
  );

-- Tenants may read their doc's events and insert 'opened'/'signed' events.
CREATE POLICY "generated_document_events_tenant_select" ON generated_document_events
  FOR SELECT USING (
    document_id IN (SELECT id FROM generated_documents WHERE tenant_id = auth.uid())
  );

CREATE POLICY "generated_document_events_tenant_insert" ON generated_document_events
  FOR INSERT WITH CHECK (
    actor_id = auth.uid()
    AND document_id IN (SELECT id FROM generated_documents WHERE tenant_id = auth.uid())
  );

CREATE POLICY "generated_document_events_admin_all" ON generated_document_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- generated_document_signatures ---------------------------------------------

CREATE POLICY "generated_document_signatures_signer_select" ON generated_document_signatures
  FOR SELECT USING (auth.uid() = signer_id);

-- A signer may only sign a document they can actually see (their own as the
-- addressed tenant, or one on a property they manage).
CREATE POLICY "generated_document_signatures_signer_insert" ON generated_document_signatures
  FOR INSERT WITH CHECK (
    auth.uid() = signer_id AND (
      document_id IN (SELECT id FROM generated_documents WHERE tenant_id = auth.uid())
      OR document_id IN (
        SELECT id FROM generated_documents
        WHERE property_id IN (SELECT id FROM properties WHERE manager_id = auth.uid())
      )
    )
  );

CREATE POLICY "generated_document_signatures_manager_select" ON generated_document_signatures
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM generated_documents
      WHERE property_id IN (SELECT id FROM properties WHERE manager_id = auth.uid())
    )
  );

CREATE POLICY "generated_document_signatures_tenant_select" ON generated_document_signatures
  FOR SELECT USING (
    document_id IN (SELECT id FROM generated_documents WHERE tenant_id = auth.uid())
  );

CREATE POLICY "generated_document_signatures_admin_all" ON generated_document_signatures
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- late_payment_series -------------------------------------------------------

CREATE POLICY "late_payment_series_manager_all" ON late_payment_series
  FOR ALL USING (lease_id IN (SELECT get_manager_lease_ids(auth.uid())))
  WITH CHECK (lease_id IN (SELECT get_manager_lease_ids(auth.uid())));

CREATE POLICY "late_payment_series_admin_all" ON late_payment_series
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── Auto-finalize a document when its tenant signs ─────────────────────────
-- Documents are single-signer (tenant): one tenant signature finalizes.
-- Mirrors finalize_lease_on_dual_signature, plus an audit event.

CREATE OR REPLACE FUNCTION finalize_generated_document_on_signature()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE generated_documents
     SET status    = 'signed',
         signed_at = COALESCE(signed_at, NOW())
   WHERE id = NEW.document_id
     AND status <> 'voided';

  INSERT INTO generated_document_events (document_id, actor_id, event, meta)
  VALUES (NEW.document_id, NEW.signer_id, 'signed',
          jsonb_build_object('signer_role', NEW.signer_role));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_generated_document_signature_finalize ON generated_document_signatures;
CREATE TRIGGER on_generated_document_signature_finalize
  AFTER INSERT ON generated_document_signatures
  FOR EACH ROW EXECUTE FUNCTION finalize_generated_document_on_signature();
