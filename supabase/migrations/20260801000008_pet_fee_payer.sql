-- 20260801000008_pet_fee_payer.sql
--
-- Pet rent was always split across every roommate, which is wrong in the
-- common case: the dog belongs to one tenant and the others reasonably don't
-- want it on their bill.
--
--   pet_fee_payer_id NULL  → split evenly across primaries (previous behaviour)
--                    value → that tenant is billed the whole monthly pet fee
--
-- The column references profiles rather than lease_tenants so it survives a
-- primary being toggled off; the resolver falls back to an even split if the
-- nominated payer is no longer a primary on the lease, so a stale pointer can
-- never silently drop the charge.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS pet_fee_payer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN leases.pet_fee_payer_id IS
  'Tenant who pays the whole monthly_pet_fee. NULL splits it evenly across primaries. Falls back to an even split if this tenant is no longer a primary on the lease.';

CREATE OR REPLACE FUNCTION public.lease_tenant_charges(p_lease_id UUID, p_rent_amount NUMERIC)
RETURNS TABLE(tenant_id UUID, rent_amount NUMERIC, pet_fee NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode             TEXT;
  v_assigned_cents   BIGINT := 0;
  v_total_cents      BIGINT;
  v_unassigned_n     INTEGER;
  v_base_cents       BIGINT := 0;
  v_remainder_cents  BIGINT := 0;
  v_first_unassigned UUID;
  v_primary_n        INTEGER;
  v_pet_total_cents  BIGINT := 0;
  v_pet_base_cents   BIGINT := 0;
  v_pet_remainder    BIGINT := 0;
  v_first_primary    UUID;
  v_pet_payer        UUID;
BEGIN
  v_total_cents := ROUND(p_rent_amount * 100)::BIGINT;

  SELECT COALESCE(ROUND(l.monthly_pet_fee * 100), 0), l.rent_split_mode, l.pet_fee_payer_id
    INTO v_pet_total_cents, v_mode, v_pet_payer
    FROM leases l WHERE l.id = p_lease_id;

  -- A nominated payer who is no longer a primary falls back to an even split
  -- rather than losing the charge entirely.
  IF v_pet_payer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.tenant_id = v_pet_payer AND lt.is_primary
  ) THEN
    v_pet_payer := NULL;
  END IF;

  IF v_mode = 'self_serve' THEN
    SELECT COALESCE(SUM(ROUND(lt.rent_share * 100)), 0)
      INTO v_assigned_cents
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NOT NULL;

    SELECT COUNT(*) INTO v_unassigned_n
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary AND lt.rent_share IS NULL;
  ELSE
    v_assigned_cents := 0;
    SELECT COUNT(*) INTO v_unassigned_n
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary;
  END IF;

  SELECT COUNT(*) INTO v_primary_n
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary;

  IF v_unassigned_n > 0 THEN
    v_base_cents := GREATEST(v_total_cents - v_assigned_cents, 0) / v_unassigned_n;
    v_remainder_cents := GREATEST(v_total_cents - v_assigned_cents, 0) - (v_base_cents * v_unassigned_n);
    SELECT lt.tenant_id INTO v_first_unassigned
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary
       AND (v_mode <> 'self_serve' OR lt.rent_share IS NULL)
     ORDER BY lt.sort_order NULLS LAST, lt.added_at LIMIT 1;
  END IF;

  IF v_primary_n > 0 AND v_pet_total_cents > 0 AND v_pet_payer IS NULL THEN
    v_pet_base_cents := v_pet_total_cents / v_primary_n;
    v_pet_remainder  := v_pet_total_cents - (v_pet_base_cents * v_primary_n);
    SELECT lt.tenant_id INTO v_first_primary
      FROM lease_tenants lt
     WHERE lt.lease_id = p_lease_id AND lt.is_primary
     ORDER BY lt.sort_order NULLS LAST, lt.added_at LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT lt.tenant_id,
         CASE
           WHEN v_mode = 'self_serve' AND lt.rent_share IS NOT NULL THEN lt.rent_share
           WHEN lt.tenant_id = v_first_unassigned THEN (v_base_cents + v_remainder_cents)::NUMERIC / 100.0
           ELSE v_base_cents::NUMERIC / 100.0
         END,
         CASE
           WHEN v_pet_total_cents = 0 THEN 0
           -- One nominated owner carries the whole fee.
           WHEN v_pet_payer IS NOT NULL THEN
             CASE WHEN lt.tenant_id = v_pet_payer THEN v_pet_total_cents::NUMERIC / 100.0 ELSE 0 END
           WHEN lt.tenant_id = v_first_primary THEN (v_pet_base_cents + v_pet_remainder)::NUMERIC / 100.0
           ELSE v_pet_base_cents::NUMERIC / 100.0
         END
    FROM lease_tenants lt
   WHERE lt.lease_id = p_lease_id AND lt.is_primary
   ORDER BY lt.sort_order NULLS LAST, lt.added_at;
END;
$$;
