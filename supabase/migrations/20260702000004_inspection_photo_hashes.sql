-- 20260702000004_inspection_photo_hashes.sql
-- Tamper-evident inspection photos ("court-ready documentation").
--
-- Inspection photos live in the private 'inspection-photos' storage bucket and
-- are referenced by path from inspections.checklist_data (JSONB) — there is no
-- per-photo table. This adds one: when a photo is uploaded, the client computes
-- the SHA-256 of the file bytes and inserts a row here. The row proves two
-- things later, in front of a judge if it comes to that:
--
--   1. WHAT was uploaded — content_hash is the SHA-256 fingerprint of the
--      exact bytes. Re-hash the stored file at any time; if it still matches,
--      the photo has not been edited, retouched, or swapped since upload.
--   2. WHEN it was recorded — hash_recorded_at is stamped server-side by a
--      trigger (any client-supplied value is overwritten), so a landlord (or
--      tenant) cannot backdate evidence.
--
-- Integrity mechanism (why you can trust rows once written):
--   • BEFORE INSERT trigger forces hash_recorded_at := NOW() — no backdating.
--   • BEFORE UPDATE trigger raises an exception — rows are immutable even for
--     roles that bypass RLS (service_role, dashboard SQL).
--   • RLS grants SELECT + INSERT to lease parties only, and defines NO UPDATE
--     or DELETE policies, so neither party can rewrite or quietly remove a
--     hash record. (DELETE stays trigger-free so the ON DELETE CASCADE from
--     leases/inspections — which runs as a referential action — still works.)
--
-- Photos uploaded before this migration simply have no row: the UI shows no
-- verification badge and the PDFs mark them "unverified" — we never claim an
-- attestation we don't have. No backfill: hashing an old file today would only
-- prove what it looks like today, not when it was captured.

CREATE TABLE IF NOT EXISTS inspection_photo_hashes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id         UUID NOT NULL REFERENCES leases(id)      ON DELETE CASCADE,
  inspection_id    UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  -- Storage path within the 'inspection-photos' bucket:
  -- {lease_id}/{inspection_id}/{item_key}-{ts}.{ext}
  -- The prefix CHECK binds the path to the row's lease, so a party on one
  -- lease can't pre-claim (and thereby block, via UNIQUE) a path under
  -- another lease's prefix.
  storage_path     TEXT NOT NULL UNIQUE
                   CHECK (storage_path LIKE (lease_id::text || '/%')),
  -- Lowercase hex SHA-256 of the uploaded file bytes.
  content_hash     TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  -- Server-stamped; the BEFORE INSERT trigger overwrites any client value.
  hash_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_hashes_lease      ON inspection_photo_hashes(lease_id);
CREATE INDEX IF NOT EXISTS idx_photo_hashes_inspection ON inspection_photo_hashes(inspection_id);

-- ── Server-side timestamp — the client cannot pick the time ─────────────
CREATE OR REPLACE FUNCTION inspection_photo_hashes_stamp() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.hash_recorded_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photo_hashes_stamp ON inspection_photo_hashes;
CREATE TRIGGER trg_photo_hashes_stamp
  BEFORE INSERT ON inspection_photo_hashes
  FOR EACH ROW EXECUTE FUNCTION inspection_photo_hashes_stamp();

-- ── Immutability — once written, a hash record never changes ────────────
CREATE OR REPLACE FUNCTION inspection_photo_hashes_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inspection_photo_hashes rows are immutable — photo hash records cannot be modified after they are written';
END;
$$;

DROP TRIGGER IF EXISTS trg_photo_hashes_immutable ON inspection_photo_hashes;
CREATE TRIGGER trg_photo_hashes_immutable
  BEFORE UPDATE ON inspection_photo_hashes
  FOR EACH ROW EXECUTE FUNCTION inspection_photo_hashes_immutable();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Same access shape as inspections: the property's manager, the tenant on
-- the lease, and admin can read; the same parties can insert (whoever
-- uploads the photo records its hash). No UPDATE/DELETE policies — RLS
-- default-deny keeps both parties from rewriting or removing records.
ALTER TABLE inspection_photo_hashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_hashes_select ON inspection_photo_hashes;
CREATE POLICY photo_hashes_select ON inspection_photo_hashes
  FOR SELECT USING (caller_can_access_lease(lease_id));

DROP POLICY IF EXISTS photo_hashes_insert ON inspection_photo_hashes;
CREATE POLICY photo_hashes_insert ON inspection_photo_hashes
  FOR INSERT WITH CHECK (caller_can_access_lease(lease_id));
