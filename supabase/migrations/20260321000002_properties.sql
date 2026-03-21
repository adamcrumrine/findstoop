-- 002_properties.sql
CREATE TABLE properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_properties_manager_id ON properties(manager_id);

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD their own properties only
CREATE POLICY "properties_manager_select" ON properties
  FOR SELECT USING (manager_id = auth.uid());

CREATE POLICY "properties_manager_insert" ON properties
  FOR INSERT WITH CHECK (manager_id = auth.uid());

CREATE POLICY "properties_manager_update" ON properties
  FOR UPDATE USING (manager_id = auth.uid());

CREATE POLICY "properties_manager_delete" ON properties
  FOR DELETE USING (manager_id = auth.uid());
