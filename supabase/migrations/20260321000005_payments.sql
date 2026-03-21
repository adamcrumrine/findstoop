-- 005_payments.sql
CREATE TYPE payment_type AS ENUM ('rent', 'late_fee', 'pet_fee', 'pet_deposit', 'utility', 'other');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed');

CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lease_id UUID REFERENCES leases(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  type payment_type NOT NULL,
  status payment_status DEFAULT 'pending',
  stripe_payment_id TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_lease_id ON payments(lease_id);
CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_due_date ON payments(due_date);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Managers can read all payments on their leases
CREATE POLICY "payments_manager_select" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = payments.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "payments_manager_update" ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = payments.lease_id AND p.manager_id = auth.uid()
    )
  );

-- Tenants can read and insert payments on their own lease
CREATE POLICY "payments_tenant_select" ON payments
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "payments_tenant_insert" ON payments
  FOR INSERT WITH CHECK (tenant_id = auth.uid());
