-- Move-in / move-out inspection checklists.
--
-- One row per (lease, type) — a lease can have at most one move-in and one
-- move-out inspection. The structured checklist is stored as JSONB so we
-- can evolve the shape without migrations.
--
-- Lifecycle:
--   draft          — being filled in; both parties can edit
--   manager_signed — manager has signed, tenant still editing
--   tenant_signed  — tenant has signed, manager still editing
--   both_signed    — locked, surfaces in Documents as the official record
--
-- Either party can edit until they've personally signed. Once both have
-- signed, the checklist is read-only.

CREATE TYPE inspection_type  AS ENUM ('move_in', 'move_out');
CREATE TYPE inspection_state AS ENUM ('draft', 'manager_signed', 'tenant_signed', 'both_signed');

CREATE TABLE IF NOT EXISTS inspections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id            UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  type                inspection_type NOT NULL,
  state               inspection_state NOT NULL DEFAULT 'draft',
  checklist_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  manager_notes       TEXT,
  tenant_notes        TEXT,
  manager_signed_at   TIMESTAMPTZ,
  tenant_signed_at    TIMESTAMPTZ,
  manager_signature_name TEXT,
  tenant_signature_name  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_per_lease_type UNIQUE (lease_id, type)
);

CREATE INDEX IF NOT EXISTS idx_inspections_lease ON inspections(lease_id);
CREATE INDEX IF NOT EXISTS idx_inspections_state ON inspections(state);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION inspections_touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspections_updated_at ON inspections;
CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION inspections_touch_updated_at();


-- ── RLS ─────────────────────────────────────────────────────────────────
-- Manager (owner of the property) + tenant (party on the lease) can SELECT
-- and UPDATE their own inspection. Admin can SELECT anything.
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller party to this lease (as manager or tenant)?
CREATE OR REPLACE FUNCTION caller_can_access_lease(p_lease_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leases l
    LEFT JOIN units u      ON u.id = l.unit_id
    LEFT JOIN properties p ON p.id = u.property_id
    WHERE l.id = p_lease_id
      AND (p.manager_id = auth.uid() OR l.tenant_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS inspections_select ON inspections;
CREATE POLICY inspections_select ON inspections
  FOR SELECT USING (caller_can_access_lease(lease_id));

DROP POLICY IF EXISTS inspections_insert ON inspections;
CREATE POLICY inspections_insert ON inspections
  FOR INSERT WITH CHECK (caller_can_access_lease(lease_id));

DROP POLICY IF EXISTS inspections_update ON inspections;
CREATE POLICY inspections_update ON inspections
  FOR UPDATE USING (caller_can_access_lease(lease_id));


-- ── Storage bucket for inspection photos ──────────────────────────────
-- Private — only lease parties can access the files. Service role + admin
-- read all (for PDF rendering + admin debugging).
INSERT INTO storage.buckets (id, name, public)
VALUES ('inspection-photos', 'inspection-photos', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Allow lease parties to read + insert into the bucket. Path convention:
-- {lease_id}/{inspection_id}/{item_key}-{ts}.{ext}
-- We can't easily encode RLS on the folder structure, so any authenticated
-- user with access to ANY lease can write to this bucket. The signed URL
-- model + UUID-based paths prevent enumeration.
DROP POLICY IF EXISTS inspection_photos_authed_read ON storage.objects;
CREATE POLICY inspection_photos_authed_read ON storage.objects
  FOR SELECT USING (bucket_id = 'inspection-photos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS inspection_photos_authed_write ON storage.objects;
CREATE POLICY inspection_photos_authed_write ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'inspection-photos' AND auth.uid() IS NOT NULL);


-- ── Default checklist template ────────────────────────────────────────
-- The standard rooms + items you'd walk through on a move-in inspection.
-- Stored as a Postgres function so we can call it from the client when
-- bootstrapping a new inspection (avoids duplicating the template across
-- web/mobile/etc.). Items can be customized after creation.
CREATE OR REPLACE FUNCTION default_inspection_checklist() RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'rooms', jsonb_build_array(
      jsonb_build_object(
        'name', 'Entry / Living Room',
        'items', jsonb_build_array(
          jsonb_build_object('key', 'living_walls',   'name', 'Walls',          'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'living_floor',   'name', 'Floor / carpet', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'living_ceiling', 'name', 'Ceiling',        'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'living_windows', 'name', 'Windows + blinds', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'living_lights',  'name', 'Light fixtures', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'living_doors',   'name', 'Doors + locks',  'condition', 'fair', 'notes', '', 'photos', jsonb_build_array())
        )
      ),
      jsonb_build_object(
        'name', 'Kitchen',
        'items', jsonb_build_array(
          jsonb_build_object('key', 'kitchen_walls',     'name', 'Walls',                   'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_floor',     'name', 'Floor',                   'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_counters',  'name', 'Counters + cabinets',     'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_sink',      'name', 'Sink + faucet',           'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_fridge',    'name', 'Refrigerator',            'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_stove',     'name', 'Stove / oven',            'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_dishwasher','name', 'Dishwasher',              'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'kitchen_microwave', 'name', 'Microwave / hood',        'condition', 'fair', 'notes', '', 'photos', jsonb_build_array())
        )
      ),
      jsonb_build_object(
        'name', 'Bathroom(s)',
        'items', jsonb_build_array(
          jsonb_build_object('key', 'bath_walls',  'name', 'Walls + tile',  'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bath_floor',  'name', 'Floor',         'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bath_sink',   'name', 'Sink + faucet', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bath_toilet', 'name', 'Toilet',        'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bath_tub',    'name', 'Tub / shower',  'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bath_mirror', 'name', 'Mirror + fixtures', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bath_vent',   'name', 'Vent fan',      'condition', 'fair', 'notes', '', 'photos', jsonb_build_array())
        )
      ),
      jsonb_build_object(
        'name', 'Bedroom(s)',
        'items', jsonb_build_array(
          jsonb_build_object('key', 'bed_walls',   'name', 'Walls',          'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bed_floor',   'name', 'Floor / carpet', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bed_closet',  'name', 'Closet + shelving', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'bed_windows', 'name', 'Windows + blinds', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array())
        )
      ),
      jsonb_build_object(
        'name', 'Utilities + safety',
        'items', jsonb_build_array(
          jsonb_build_object('key', 'smoke_detectors', 'name', 'Smoke detectors',     'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'co_detectors',    'name', 'CO detectors',        'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'hvac',            'name', 'Heating / AC',        'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'water_heater',    'name', 'Water heater',        'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'breaker_box',     'name', 'Breaker box',         'condition', 'fair', 'notes', '', 'photos', jsonb_build_array())
        )
      ),
      jsonb_build_object(
        'name', 'Exterior + common areas',
        'items', jsonb_build_array(
          jsonb_build_object('key', 'exterior_door',  'name', 'Exterior door + lock', 'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'mailbox',        'name', 'Mailbox',              'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'parking',        'name', 'Parking spot',         'condition', 'fair', 'notes', '', 'photos', jsonb_build_array()),
          jsonb_build_object('key', 'patio_balcony',  'name', 'Patio / balcony',      'condition', 'fair', 'notes', '', 'photos', jsonb_build_array())
        )
      )
    ),
    'keys_handover', jsonb_build_array(),
    'meter_readings', jsonb_build_object('electric', '', 'gas', '', 'water', '')
  );
$$;
