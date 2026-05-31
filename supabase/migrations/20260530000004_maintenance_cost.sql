-- Maintenance cost capture. When a manager resolves a request they can record
-- what it cost (and the vendor), and optionally log it as a Repairs expense on
-- the property — closing the loop from AI triage -> resolution -> Schedule E.

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS cost              NUMERIC(12,2) CHECK (cost IS NULL OR cost >= 0),
  ADD COLUMN IF NOT EXISTS vendor            TEXT,
  ADD COLUMN IF NOT EXISTS expense_id        UUID REFERENCES property_expenses(id) ON DELETE SET NULL;
