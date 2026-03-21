-- 008_utility_bills.sql
CREATE TYPE bill_status AS ENUM ('pending', 'paid', 'overdue');

CREATE TABLE utility_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  utility_id UUID REFERENCES utilities(id) ON DELETE CASCADE NOT NULL,
  lease_id UUID REFERENCES leases(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status bill_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_utility_bills_utility_id ON utility_bills(utility_id);
CREATE INDEX idx_utility_bills_lease_id ON utility_bills(lease_id);
CREATE INDEX idx_utility_bills_status ON utility_bills(status);
CREATE INDEX idx_utility_bills_due_date ON utility_bills(due_date);

-- Enable RLS
ALTER TABLE utility_bills ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD all utility bills on their properties
CREATE POLICY "utility_bills_manager_select" ON utility_bills
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = utility_bills.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "utility_bills_manager_insert" ON utility_bills
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = utility_bills.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "utility_bills_manager_update" ON utility_bills
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = utility_bills.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "utility_bills_manager_delete" ON utility_bills
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = utility_bills.lease_id AND p.manager_id = auth.uid()
    )
  );

-- Tenants can read their own utility bills
CREATE POLICY "utility_bills_tenant_select" ON utility_bills
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = utility_bills.lease_id AND l.tenant_id = auth.uid()
    )
  );
