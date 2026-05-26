-- 20260524000010_documents_standard_legal.sql
-- Auto-attached "standard" legal documents on a lease — the federal +
-- state-required notices that every tenant should receive on day one.
-- For Ohio (initial scope) that's:
--   • Ohio Tenant Rights summary          (state-required by ORC 5321.18 in spirit)
--   • Fair Housing Notice                 (federal: 42 USC 3601 et seq.)
--   • EPA Lead-Based Paint Pamphlet       (federal: 24 CFR 35.92, pre-1978 only)
--   • Lead-Based Paint Disclosure form    (federal: 24 CFR 35.92, pre-1978 only)
--
-- We mark these on the `documents` table with `standard_doc_key` so they
-- can be (a) dedup'd via UNIQUE constraint, (b) distinguished from a
-- manager's manually-attached PDFs, and (c) regenerated/replaced when the
-- legal templates evolve without disturbing manager uploads.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS standard_doc_key TEXT NULL;

COMMENT ON COLUMN documents.standard_doc_key IS
  'When set, identifies this row as an auto-attached state/federal disclosure (e.g. ''oh_tenant_rights''). NULL for manager-uploaded docs.';

-- One copy per (lease, key) — re-running the auto-attach is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS documents_lease_standard_key
  ON documents(lease_id, standard_doc_key)
  WHERE standard_doc_key IS NOT NULL;

-- ── attach_standard_documents_for_lease(lease_id) ───────────────────────
-- Inserts the applicable standard-doc rows for a lease, idempotently.
-- Scoping rules:
--   • Property state = 'OH'           → tenant_rights + fair_housing
--   • + property_built_before_1978    → epa_lead_pamphlet + lead_disclosure
-- The storage_url field carries an in-app route (app://legal/...) — the
-- tenant Documents tab knows how to render that vs. a real storage path.
CREATE OR REPLACE FUNCTION public.attach_standard_documents_for_lease(p_lease_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prop_state TEXT;
  pre_1978   BOOLEAN;
  manager_id UUID;
  inserted_count INTEGER := 0;
BEGIN
  -- Resolve property state + manager + LBP flag in one shot.
  SELECT UPPER(p.state), l.property_built_before_1978, p.manager_id
    INTO prop_state, pre_1978, manager_id
    FROM leases l
    JOIN units  u ON u.id = l.unit_id
    JOIN properties p ON p.id = u.property_id
   WHERE l.id = p_lease_id;

  IF prop_state IS NULL THEN
    RETURN 0;
  END IF;

  -- Ohio-only for now. Other states will be added as content is written.
  IF prop_state <> 'OH' THEN
    RETURN 0;
  END IF;

  -- Always-attach for Ohio leases.
  INSERT INTO documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
  VALUES (
    p_lease_id, manager_id,
    'Your Ohio Tenant Rights (FindStoop summary)',
    'other',
    'app://legal/ohio-tenant-rights?lease=' || p_lease_id,
    'oh_tenant_rights'
  )
  ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
  VALUES (
    p_lease_id, manager_id,
    'Federal Fair Housing Act Notice',
    'notice',
    'app://legal/fair-housing-notice?lease=' || p_lease_id,
    'fair_housing_notice'
  )
  ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
  IF FOUND THEN inserted_count := inserted_count + 1; END IF;

  -- Pre-1978 only.
  IF pre_1978 IS TRUE THEN
    INSERT INTO documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
    VALUES (
      p_lease_id, manager_id,
      'EPA Lead-Based Paint Pamphlet (Protect Your Family From Lead in Your Home)',
      'other',
      'app://legal/lead-paint-pamphlet?lease=' || p_lease_id,
      'epa_lead_pamphlet'
    )
    ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
    IF FOUND THEN inserted_count := inserted_count + 1; END IF;

    INSERT INTO documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
    VALUES (
      p_lease_id, manager_id,
      'Lead-Based Paint Disclosure (federal — 24 CFR 35.92)',
      'notice',
      'app://legal/lead-disclosure/' || p_lease_id,
      'lead_disclosure'
    )
    ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
    IF FOUND THEN inserted_count := inserted_count + 1; END IF;
  END IF;

  RETURN inserted_count;
END;
$$;

-- ── Trigger: auto-attach when a lease becomes active or upcoming ────────
-- Idempotent thanks to the UNIQUE index — re-flipping status to active
-- after a brief expired stint won't create duplicates.
CREATE OR REPLACE FUNCTION public.trg_auto_attach_standard_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('active', 'upcoming') THEN
    PERFORM public.attach_standard_documents_for_lease(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lease_auto_attach_standard_docs ON leases;
CREATE TRIGGER lease_auto_attach_standard_docs
  AFTER INSERT OR UPDATE OF status ON leases
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_attach_standard_documents();

-- ── Backfill: attach to all currently-active and upcoming Ohio leases ──
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT l.id
      FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
     WHERE UPPER(p.state) = 'OH'
       AND l.status IN ('active', 'upcoming')
  LOOP
    PERFORM public.attach_standard_documents_for_lease(r.id);
  END LOOP;
END;
$$;
