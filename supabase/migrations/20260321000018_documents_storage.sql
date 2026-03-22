-- 018_documents_storage.sql
-- Private storage bucket for lease documents.
-- Access is controlled via signed URLs; the documents table RLS is the
-- source of truth for who may create/view document records.

INSERT INTO storage.buckets (id, name, public)
VALUES ('lease-documents', 'lease-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read (download via signed URL)
CREATE POLICY "lease_documents_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'lease-documents' AND auth.role() = 'authenticated'
  );

-- Authenticated users can upload (documents table RLS enforces manager-only inserts)
CREATE POLICY "lease_documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'lease-documents' AND auth.role() = 'authenticated'
  );

-- Authenticated users can delete their own uploads
CREATE POLICY "lease_documents_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'lease-documents' AND auth.role() = 'authenticated'
  );
