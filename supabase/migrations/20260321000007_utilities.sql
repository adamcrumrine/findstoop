-- 007_utilities.sql
CREATE TYPE utility_type AS ENUM ('water', 'gas', 'electric', 'trash', 'internet', 'other');
CREATE TYPE utility_responsibility AS ENUM ('landlord', 'tenant');

CREATE TABLE utilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  type utility_type NOT NULL,
  responsibility utility_responsibility NOT NULL,
  provider_name TEXT,
  account_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_utilities_unit_id ON utilities(unit_id);

-- Enable RLS
ALTER TABLE utilities ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD utilities on their units
CREATE POLICY "utilities_manager_select" ON utilities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = utilities.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "utilities_manager_insert" ON utilities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = utilities.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "utilities_manager_update" ON utilities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = utilities.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "utilities_manager_delete" ON utilities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = utilities.unit_id AND p.manager_id = auth.uid()
    )
  );

-- Note: utilities_tenant_select policy added in 20260321000012_cross_table_policies.sql
