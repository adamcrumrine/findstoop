-- Drives the green notification dot on the tenant's bottom-nav Documents
-- icon. Updated when the tenant opens the Documents page; any document
-- whose created_at > documents_seen_at counts as "new".

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS documents_seen_at TIMESTAMPTZ;
