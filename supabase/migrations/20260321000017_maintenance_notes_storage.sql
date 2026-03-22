-- 017_maintenance_notes_storage.sql
-- Add manager_notes to maintenance_requests and create storage bucket for photos.

ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS manager_notes TEXT;

-- Storage bucket for maintenance photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-photos', 'maintenance-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Tenants can upload to their own folder
CREATE POLICY "maintenance_photos_tenant_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'maintenance-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Anyone authenticated can read
CREATE POLICY "maintenance_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'maintenance-photos' AND auth.role() = 'authenticated');
