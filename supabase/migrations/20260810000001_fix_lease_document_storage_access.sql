-- Let tenants open the documents their landlord uploads.
--
-- The storage policy read:
--
--   (storage.foldername(name))[1] = auth.uid()::text
--   OR EXISTS (SELECT 1 FROM documents d WHERE d.storage_url = d.name)
--
-- `documents` has its own `name` column, so `d.name` bound to the INNER table
-- and shadowed storage.objects.name. The branch therefore asked "is there a
-- document whose storage path equals its own display name?" — a path never
-- equals "Move-In Packet", so it was dead in every case.
--
-- That left only the folder check, and uploadDocument writes to
-- `<lease_id>/<file>`. A lease id matches nobody's auth.uid(), so an uploaded
-- document was unreadable by EVERYONE — both tenants and the landlord who
-- uploaded it. Files attached through the older manager-side flows sit under
-- `<manager_uid>/…`, which is why the landlord could still open those and the
-- breakage looked like a tenant-only problem.
--
-- Fixing the alias alone would have been worse than the bug: `d.storage_url =
-- storage.objects.name` with no further test grants every authenticated user
-- every lease document in the system. Authorization has to be part of the
-- predicate, so the check names exactly who may read: a party to the lease
-- (primary or co-tenant), the managing landlord, or their team.
--
-- SECURITY DEFINER so the lookup is not itself filtered by the documents
-- policies — a storage read should not depend on a second table's RLS agreeing
-- from inside a policy evaluation.

CREATE OR REPLACE FUNCTION public.can_read_lease_document(object_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM documents d
     WHERE d.storage_url = object_path
       AND (
         is_lease_party(d.lease_id)
         OR d.lease_id IN (SELECT get_manager_lease_ids(auth.uid()))
         OR d.lease_id IN (SELECT get_team_lease_ids(auth.uid()))
       )
  )
$$;

REVOKE ALL ON FUNCTION public.can_read_lease_document(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_lease_document(TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS lease_documents_select ON storage.objects;
CREATE POLICY lease_documents_select ON storage.objects FOR SELECT USING (
  bucket_id = 'lease-documents'
  AND (
    -- Your own upload folder, kept so in-progress uploads stay readable.
    (storage.foldername(name))[1] = auth.uid()::text
    -- Or a document row points here and you are entitled to it.
    OR public.can_read_lease_document(name)
  )
);
