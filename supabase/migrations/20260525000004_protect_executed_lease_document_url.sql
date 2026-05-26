-- 20260525000004_protect_executed_lease_document_url.sql
-- DB-level guard against the "executed lease PDF gets overwritten by the
-- FindStoop boilerplate" bug. The application layer already skips the
-- regeneration when an executed PDF is on file; this enforces it at the
-- database so a future code change can't accidentally regress.
--
-- Rule: if a lease has a `documents` row of type='lease' (the imported
-- signed PDF), then `leases.document_url` MUST be NULL. The executed PDF
-- in the documents table is the authoritative agreement; document_url
-- would only point to a regenerated FindStoop template, which is wrong.
--
-- One-way only:
--   • Clearing document_url to NULL is always allowed (lets the cleanup
--     path / future "switch to FindStoop draft" flow work).
--   • Setting document_url to non-NULL is BLOCKED whenever an executed
--     PDF exists.
--   • Whether the document_url is changing or not doesn't matter — if
--     it's non-null and an executed PDF exists, the row is invalid.
--
-- Safe for the existing flows:
--   • LeaseWizard creates a new lease → no documents rows yet → passes.
--   • create-lease-from-pdf inserts the executed PDF AFTER the lease →
--     lease has document_url=NULL → passes.
--   • attach-existing-lease-pdf only updates `status`, not document_url.
--   • Renewals create a new lease row (no doc history) → passes.

CREATE OR REPLACE FUNCTION public.prevent_document_url_when_executed_pdf_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Block ONLY the dangerous transition: going from "no document_url"
  -- (the steady state for an executed imported lease) to "document_url
  -- set to something" (which would orphan the executed PDF).
  --
  -- Allowed transitions:
  --   • Clearing document_url to NULL (cleanup path).
  --   • Updating document_url between two non-NULL values (edits to a
  --     FindStoop-drafted lease that ALSO happens to have a signed scan
  --     uploaded — rare, but should still let the manager save edits).
  IF NEW.document_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.document_url IS NULL)
     AND EXISTS (
       SELECT 1 FROM public.documents d
        WHERE d.lease_id = NEW.id
          AND d.type = 'lease'
     )
  THEN
    RAISE EXCEPTION
      'Cannot set leases.document_url on lease % — it has an executed signed PDF on file. The PDF in documents is the authoritative agreement; setting document_url would orphan it. Clear the documents row first if you intend to replace the executed lease with a FindStoop draft.',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lease_protect_document_url ON leases;
CREATE TRIGGER lease_protect_document_url
  BEFORE INSERT OR UPDATE OF document_url ON leases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_document_url_when_executed_pdf_exists();
