-- 006_pets.sql
CREATE TYPE pet_type AS ENUM ('dog', 'cat', 'other');

CREATE TABLE pets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lease_id UUID REFERENCES leases(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type pet_type NOT NULL,
  breed TEXT,
  weight NUMERIC(5,1),
  pet_deposit NUMERIC(10,2),
  monthly_pet_fee NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pets_lease_id ON pets(lease_id);
CREATE INDEX idx_pets_tenant_id ON pets(tenant_id);

-- Enable RLS
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;

-- Managers can read all pets on their leases
CREATE POLICY "pets_manager_select" ON pets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = pets.lease_id AND p.manager_id = auth.uid()
    )
  );

-- Tenants can CRUD their own pets
CREATE POLICY "pets_tenant_select" ON pets
  FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "pets_tenant_insert" ON pets
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "pets_tenant_update" ON pets
  FOR UPDATE USING (tenant_id = auth.uid());

CREATE POLICY "pets_tenant_delete" ON pets
  FOR DELETE USING (tenant_id = auth.uid());
