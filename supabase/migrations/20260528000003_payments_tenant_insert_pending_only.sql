-- SECURITY FIX (S2): tenants could self-record paid rent.
--
-- payments_tenant_insert was `WITH CHECK (tenant_id = auth.uid())` with no
-- constraint on status/amount, so a tenant could insert
--   { tenant_id: self, type: 'rent', status: 'completed', amount: <anything> }
-- and have rent show as collected with no money moved. Combined with the old
-- client-supplied amount in create-payment-intent, a tenant could pay $1 and
-- record full rent paid.
--
-- The charge flow is now server-authoritative: create-payment-intent derives
-- the amount from the pending payments row and the Stripe webhook (service
-- role, which bypasses RLS) is the ONLY writer that sets status='completed'.
-- So tenants never need to insert a completed row. Restrict the tenant insert
-- policy to status='pending' as defense in depth. Managers/admin/service-role
-- writers are governed by their own policies and are unaffected.

DROP POLICY IF EXISTS "payments_tenant_insert" ON payments;

CREATE POLICY "payments_tenant_insert" ON payments
  FOR INSERT
  WITH CHECK (tenant_id = auth.uid() AND status::text = 'pending');
