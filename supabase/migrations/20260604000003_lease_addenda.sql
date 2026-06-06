-- 20260604000003_lease_addenda.sql
-- Lease addenda: a manager amends an executed lease by creating an addendum and
-- routing it for in-house e-signature by ALL parties — the landlord plus every
-- primary tenant. Reuses generated_documents / generated_document_signatures;
-- no new tables.
--
-- Two behaviors change vs the single-signer document model:
--  (1) Multi-party finalize — a doc whose meta.required_signer_ids is set only
--      flips to 'signed' once EVERY required signer has signed. Other doc types
--      (no required set) keep the original "first signature finalizes" behavior.
--  (2) Any party to the addendum's lease may view + sign it (not just the single
--      addressed tenant_id), so co-tenants can sign too. This is scoped to
--      type = 'addendum' so the visibility of other lease documents (late
--      notices, violations addressed to one tenant) is unchanged.

-- ── Multi-party-aware finalize ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION finalize_generated_document_on_signature()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_required uuid[];
  v_have     int;
BEGIN
  -- Audit every signature.
  INSERT INTO generated_document_events (document_id, actor_id, event, meta)
  VALUES (NEW.document_id, NEW.signer_id, 'signed',
          jsonb_build_object('signer_role', NEW.signer_role));

  -- The required signer set, if the document declares one (addenda do).
  SELECT ARRAY(
           SELECT jsonb_array_elements_text(COALESCE(meta->'required_signer_ids', '[]'::jsonb))::uuid
         )
    INTO v_required
    FROM generated_documents WHERE id = NEW.document_id;

  IF v_required IS NULL OR array_length(v_required, 1) IS NULL THEN
    -- Single-signer document: first signature finalizes (original behavior).
    UPDATE generated_documents
       SET status = 'signed', signed_at = COALESCE(signed_at, NOW())
     WHERE id = NEW.document_id AND status <> 'voided';
  ELSE
    -- Multi-party: finalize only once every required signer has signed.
    SELECT COUNT(DISTINCT signer_id) INTO v_have
      FROM generated_document_signatures
      WHERE document_id = NEW.document_id AND signer_id = ANY(v_required);
    IF v_have >= array_length(v_required, 1) THEN
      UPDATE generated_documents
         SET status = 'signed', signed_at = COALESCE(signed_at, NOW())
       WHERE id = NEW.document_id AND status <> 'voided';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- The on_generated_document_signature_finalize trigger from 20260603000001
-- already points at this function — CREATE OR REPLACE above is sufficient.

-- ── Co-tenant access to addenda (view + sign + see progress) ───────────────
-- Any party to the lease (manager or any tenant) may read the addendum doc,
-- read its signatures (to show "2 of 3 signed"), and insert their own
-- signature. Scoped to type='addendum' so nothing else widens.

DROP POLICY IF EXISTS "generated_documents_addendum_lease_party_select" ON generated_documents;
CREATE POLICY "generated_documents_addendum_lease_party_select" ON generated_documents
  FOR SELECT USING (
    type = 'addendum' AND lease_id IS NOT NULL AND caller_can_access_lease(lease_id)
  );

DROP POLICY IF EXISTS "gen_doc_sig_addendum_party_select" ON generated_document_signatures;
CREATE POLICY "gen_doc_sig_addendum_party_select" ON generated_document_signatures
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM generated_documents
      WHERE type = 'addendum' AND lease_id IS NOT NULL AND caller_can_access_lease(lease_id)
    )
  );

DROP POLICY IF EXISTS "gen_doc_sig_addendum_party_insert" ON generated_document_signatures;
CREATE POLICY "gen_doc_sig_addendum_party_insert" ON generated_document_signatures
  FOR INSERT WITH CHECK (
    auth.uid() = signer_id AND
    document_id IN (
      SELECT id FROM generated_documents
      WHERE type = 'addendum' AND lease_id IS NOT NULL AND caller_can_access_lease(lease_id)
    )
  );
