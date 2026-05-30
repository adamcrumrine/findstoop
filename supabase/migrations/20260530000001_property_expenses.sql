-- Landlord operating expenses — feeds the Schedule E worksheet (auto-filling
-- the expense lines, not just income) and future P&L / NOI reporting.
--
-- Categories map 1:1 to Schedule E (Form 1040) Part I expense lines 5–19.

CREATE TYPE expense_category AS ENUM (
  'advertising',          -- line 5
  'auto_travel',          -- line 6
  'cleaning_maintenance', -- line 7
  'commissions',          -- line 8
  'insurance',            -- line 9
  'legal_professional',   -- line 10
  'management_fees',      -- line 11
  'mortgage_interest',    -- line 12
  'other_interest',       -- line 13
  'repairs',              -- line 14
  'supplies',             -- line 15
  'taxes',                -- line 16
  'utilities',            -- line 17
  'depreciation',         -- line 18
  'other'                 -- line 19
);

CREATE TABLE property_expenses (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  category     expense_category NOT NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL,
  vendor       TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_expenses_property ON property_expenses(property_id);
CREATE INDEX idx_property_expenses_date     ON property_expenses(expense_date);

ALTER TABLE property_expenses ENABLE ROW LEVEL SECURITY;

-- Manager may read/write expenses only on properties they own. The EXISTS
-- subquery is re-checked on WITH CHECK so a row can't be re-pointed at a
-- property the manager doesn't own.
CREATE POLICY property_expenses_manager_all ON property_expenses
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_expenses.property_id AND p.manager_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_expenses.property_id AND p.manager_id = auth.uid()
  ));

CREATE POLICY property_expenses_admin_all ON property_expenses
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
