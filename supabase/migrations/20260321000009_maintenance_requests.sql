-- 009_maintenance_requests.sql
CREATE TYPE maintenance_priority AS ENUM ('low', 'medium', 'high', 'emergency');
CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

CREATE TABLE maintenance_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority maintenance_priority DEFAULT 'low',
  status maintenance_status DEFAULT 'open',
  images TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_maintenance_unit_id ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_tenant_id ON maintenance_requests(tenant_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_priority ON maintenance_requests(priority);

-- Enable RLS
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

-- Tenants can insert and read their own requests
CREATE POLICY "maintenance_tenant_select" ON maintenance_requests
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "maintenance_tenant_insert" ON maintenance_requests
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

-- Managers can read and update all requests on their properties
CREATE POLICY "maintenance_manager_select" ON maintenance_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = maintenance_requests.unit_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "maintenance_manager_update" ON maintenance_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.id = maintenance_requests.unit_id AND p.manager_id = auth.uid()
    )
  );
