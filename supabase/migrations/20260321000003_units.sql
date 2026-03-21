-- 003_units.sql
CREATE TYPE unit_status AS ENUM ('occupied', 'vacant', 'maintenance');

CREATE TABLE units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  unit_number TEXT NOT NULL,
  bedrooms INTEGER,
  bathrooms NUMERIC(3,1),
  square_feet INTEGER,
  rent_amount NUMERIC(10,2) NOT NULL,
  status unit_status DEFAULT 'vacant',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_units_property_id ON units(property_id);
CREATE INDEX idx_units_status ON units(status);

-- Enable RLS
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD units belonging to their properties
CREATE POLICY "units_manager_select" ON units
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = units.property_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "units_manager_insert" ON units
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = units.property_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "units_manager_update" ON units
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = units.property_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "units_manager_delete" ON units
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = units.property_id AND p.manager_id = auth.uid()
    )
  );

-- Note: units_tenant_select policy added in 20260321000012_cross_table_policies.sql
