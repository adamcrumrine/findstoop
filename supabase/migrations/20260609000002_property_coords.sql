-- Coordinates on properties, enabling radius-weighted lease comps in the
-- Rental Analysis engine (distance from subject → weight). Populated lazily:
-- the rent-estimate function geocodes a few un-coded properties per invocation
-- (free Census geocoder), so coverage self-heals with usage.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_properties_zip ON properties(zip);
