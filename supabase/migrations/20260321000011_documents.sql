-- 011_documents.sql
CREATE TYPE document_type AS ENUM ('lease', 'addendum', 'inspection', 'notice', 'other');

CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lease_id UUID REFERENCES leases(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type document_type NOT NULL,
  storage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_lease_id ON documents(lease_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Managers can CRUD documents on their leases
CREATE POLICY "documents_manager_select" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = documents.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "documents_manager_insert" ON documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = documents.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "documents_manager_update" ON documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = documents.lease_id AND p.manager_id = auth.uid()
    )
  );

CREATE POLICY "documents_manager_delete" ON documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM leases l
      JOIN units u ON u.id = l.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE l.id = documents.lease_id AND p.manager_id = auth.uid()
    )
  );

-- Tenants can read documents associated with their lease
CREATE POLICY "documents_tenant_select" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = documents.lease_id AND l.tenant_id = auth.uid()
    )
  );
