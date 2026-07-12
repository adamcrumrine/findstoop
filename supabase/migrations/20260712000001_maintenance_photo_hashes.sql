-- 20260712000001_maintenance_photo_hashes.sql
-- Tamper-evident MAINTENANCE photos — the same mechanism as
-- inspection_photo_hashes (20260702000004), extended to the other place
-- photographic evidence enters the system. A maintenance photo that later
-- backs a deposit deduction or a habitability dispute deserves the same
-- court-ready fingerprint: WHAT was uploaded (SHA-256 of the exact bytes)
-- and WHEN (server-stamped, immutable).
--
-- Photos uploaded before this migration have no row — shown unverified,
-- never claimed otherwise.

CREATE TABLE IF NOT EXISTS maintenance_photo_hashes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  -- Path within the 'maintenance-photos' bucket: {tenant_id}/{ts}.{ext}
  storage_path     TEXT NOT NULL UNIQUE,
  content_hash     TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  hash_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_photo_hashes_request ON maintenance_photo_hashes(request_id);

-- Server timestamp + immutability — reuse the inspection trigger functions;
-- both operate only on the columns this table shares.
DROP TRIGGER IF EXISTS trg_maint_photo_hashes_stamp ON maintenance_photo_hashes;
CREATE TRIGGER trg_maint_photo_hashes_stamp
  BEFORE INSERT ON maintenance_photo_hashes
  FOR EACH ROW EXECUTE FUNCTION inspection_photo_hashes_stamp();

DROP TRIGGER IF EXISTS trg_maint_photo_hashes_immutable ON maintenance_photo_hashes;
CREATE TRIGGER trg_maint_photo_hashes_immutable
  BEFORE UPDATE ON maintenance_photo_hashes
  FOR EACH ROW EXECUTE FUNCTION inspection_photo_hashes_immutable();

-- RLS: the tenant who filed the request, the property's manager, and admin
-- can read + insert. No UPDATE/DELETE policies — default-deny keeps the log
-- append-only for both parties (CASCADE deletes still work as referential
-- actions).
ALTER TABLE maintenance_photo_hashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maint_photo_hashes_select ON maintenance_photo_hashes;
CREATE POLICY maint_photo_hashes_select ON maintenance_photo_hashes
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM maintenance_requests mr
      JOIN units u ON u.id = mr.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE mr.id = maintenance_photo_hashes.request_id
        AND (mr.tenant_id = auth.uid() OR p.manager_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS maint_photo_hashes_insert ON maintenance_photo_hashes;
CREATE POLICY maint_photo_hashes_insert ON maintenance_photo_hashes
  FOR INSERT WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM maintenance_requests mr
      JOIN units u ON u.id = mr.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE mr.id = maintenance_photo_hashes.request_id
        AND (mr.tenant_id = auth.uid() OR p.manager_id = auth.uid())
    )
  );
