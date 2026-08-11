-- Make maintenance photos private.
--
-- The bucket was public and the read policy was `auth.role() = 'authenticated'`
-- — but public buckets serve objects over an unauthenticated URL, so the policy
-- was moot: anyone holding the link could view the photo without an account,
-- forever. Uploads returned exactly such a link and it was stored in
-- maintenance_requests.images.
--
-- These are photographs of the inside of people's homes. A tenant reporting a
-- bathroom leak should not be creating a permanent public URL of their
-- bathroom. Every other media bucket here is already private; this one was the
-- outlier.
--
-- Safe to do now: the bucket is empty and no request has photos, so there are
-- no existing links to break. signMaintenancePhotos still passes absolute URLs
-- through untouched, so were any legacy rows to appear they would keep working.
--
-- Read access follows the upload path, `<tenant_id>/<file>`: the tenant who
-- took the photo, and the landlord (or their team) responsible for a lease that
-- tenant is on.

UPDATE storage.buckets SET public = false WHERE id = 'maintenance-photos';

DROP POLICY IF EXISTS maintenance_photos_select ON storage.objects;
CREATE POLICY maintenance_photos_select ON storage.objects FOR SELECT USING (
  bucket_id = 'maintenance-photos'
  AND (
    -- The tenant who uploaded it.
    (storage.foldername(name))[1] = (auth.uid())::text
    -- Or a landlord who manages a lease that tenant is on. get_manager_tenant_ids
    -- already spans both leases.tenant_id and the lease_tenants junction, so a
    -- roommate's photo is visible to the landlord too.
    OR (storage.foldername(name))[1] IN (
      SELECT (public.get_manager_tenant_ids(auth.uid()))::text
    )
    OR (storage.foldername(name))[1] IN (
      SELECT (lt.tenant_id)::text
        FROM public.lease_tenants lt
       WHERE lt.lease_id IN (SELECT public.get_team_lease_ids(auth.uid()))
    )
  )
);
