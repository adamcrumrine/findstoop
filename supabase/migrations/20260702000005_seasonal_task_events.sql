-- Seasonal maintenance autopilot — per-season task state.
--
-- The schedule itself is a content table in code
-- (apps/web/src/lib/seasonalMaintenance.ts); this table only remembers what
-- the manager did with each occurrence of a task on a property: marked it
-- done, dismissed it for the season, or asked the tenant to handle it.
-- One row per (property, task, occurrence) — the latest action wins.

CREATE TABLE seasonal_task_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  -- Task id from the code content table, e.g. 'hvac-filter'.
  task_id     TEXT NOT NULL CHECK (char_length(task_id) <= 64),
  -- The occurrence the action applies to, as YYYY-MM (e.g. '2026-10').
  occurrence  TEXT NOT NULL CHECK (occurrence ~ '^\d{4}-\d{2}$'),
  status      TEXT NOT NULL CHECK (status IN ('done', 'dismissed', 'delegated')),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (property_id, task_id, occurrence)
);

CREATE INDEX idx_seasonal_task_events_property ON seasonal_task_events(property_id);

ALTER TABLE seasonal_task_events ENABLE ROW LEVEL SECURITY;

-- Manager may read/write events only on properties they own (same pattern as
-- property_expenses). The EXISTS subquery is re-checked on WITH CHECK so a
-- row can't be re-pointed at a property the manager doesn't own.
CREATE POLICY seasonal_task_events_manager_all ON seasonal_task_events
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = seasonal_task_events.property_id AND p.manager_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = seasonal_task_events.property_id AND p.manager_id = auth.uid()
  ));

CREATE POLICY seasonal_task_events_admin_all ON seasonal_task_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
