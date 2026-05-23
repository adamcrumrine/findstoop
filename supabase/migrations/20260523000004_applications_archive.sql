-- 030_applications_archive.sql
-- Lets managers archive applications (hide from the default list, keep the
-- record) and hard-delete them when needed.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Partial index speeds up the "non-archived" default list view.
CREATE INDEX IF NOT EXISTS idx_applications_not_archived
  ON applications(submitted_at DESC)
  WHERE archived_at IS NULL;

-- Managers can DELETE their own applications (per-unit RLS, same shape as the
-- existing SELECT/UPDATE policies). This is the missing-row-policy that
-- previously prevented deletion via the client.
CREATE POLICY "applications_manager_delete" ON applications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = applications.unit_id AND p.manager_id = auth.uid()
    )
  );
