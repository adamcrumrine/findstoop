-- SECURITY FIX (S5): private storage buckets were readable/writable by ANY
-- authenticated user.
--
--   • lease-documents  (signed lease PDFs): select/insert/delete only checked
--     auth.role()='authenticated' — any logged-in tenant could download or
--     delete any other landlord's signed leases.
--   • insurance-documents: select/insert only checked auth.uid() IS NOT NULL.
--   • inspection-photos: select/insert only checked auth.uid() IS NOT NULL.
--
-- Approach: rather than re-derive access from the (inconsistent) path
-- conventions, DELEGATE to the RLS that's already correct —
--   • lease-documents → the `documents` table RLS (a user may read an object
--     iff they can see a documents row pointing at it). Plus the manager's own
--     folder for the temp upload/extract paths ({manager_id}/...).
--   • insurance-documents / inspection-photos → the `leases` table RLS, keyed
--     on the {lease_id} path prefix (a user may touch the file iff they can see
--     that lease row — which already scopes to its manager + tenants + admin).
-- This inherits the proven policies instead of inventing a parallel one, so it
-- can't drift out of sync or lock out co-tenants the leases RLS already allows.
--
-- NOTE: maintenance-photos is a PUBLIC bucket, so tightening its SELECT policy
-- is moot (objects are reachable by public URL). Making it private would break
-- existing <img> URLs and is left as a separate, app-coordinated change.

-- ── lease-documents ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lease_documents_select" ON storage.objects;
CREATE POLICY "lease_documents_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'lease-documents' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM documents d WHERE d.storage_url = name)
    )
  );

DROP POLICY IF EXISTS "lease_documents_insert" ON storage.objects;
CREATE POLICY "lease_documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'lease-documents' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (SELECT get_manager_lease_ids(auth.uid())::text)
    )
  );

DROP POLICY IF EXISTS "lease_documents_delete" ON storage.objects;
CREATE POLICY "lease_documents_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'lease-documents' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (SELECT get_manager_lease_ids(auth.uid())::text)
    )
  );

-- ── insurance-documents ──────────────────────────────────────────────────
-- Path: {lease_id}/insurance-{ts}.{ext}
DROP POLICY IF EXISTS insurance_docs_read ON storage.objects;
CREATE POLICY insurance_docs_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'insurance-documents'
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id::text = (storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS insurance_docs_write ON storage.objects;
CREATE POLICY insurance_docs_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'insurance-documents'
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id::text = (storage.foldername(name))[1])
  );

-- ── inspection-photos ──────────────────────────────────────────────────
-- Path: {lease_id}/{inspection_id}/{item_key}-{ts}.{ext}
DROP POLICY IF EXISTS inspection_photos_authed_read ON storage.objects;
CREATE POLICY inspection_photos_authed_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'inspection-photos'
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id::text = (storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS inspection_photos_authed_write ON storage.objects;
CREATE POLICY inspection_photos_authed_write ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'inspection-photos'
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id::text = (storage.foldername(name))[1])
  );
