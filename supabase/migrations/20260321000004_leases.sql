-- 004_leases.sql
CREATE TYPE lease_status AS ENUM ('pending', 'active', 'expired', 'terminated');

CREATE TABLE leases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent_amount NUMERIC(10,2) NOT NULL,
  security_deposit NUMERIC(10,2),
  pet_deposit NUMERIC(10,2),
  utility_notes TEXT,
  status lease_status DEFAULT 'pending',
  signed_at TIMESTAMPTZ,
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_leases_unit_id ON leases(unit_id);
CREATE INDEX idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_end_date ON leases(end_date);

-- Enable RLS
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD leases on their units
CREATE POLICY "leases_manager_select" ON leases
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "leases_manager_insert" ON leases
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "leases_manager_update" ON leases
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "leases_manager_delete" ON leases
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = leases.unit_id AND p.manager_id = auth.uid()
    )
  );

-- Tenants can read their own active lease only
CREATE POLICY "leases_tenant_select" ON leases
  FOR SELECT USING (tenant_id = auth.uid());
