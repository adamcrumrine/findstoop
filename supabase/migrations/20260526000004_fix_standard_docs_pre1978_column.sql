-- 20260526000004_fix_standard_docs_pre1978_column.sql
--
-- attach_standard_documents_for_lease() read the pre-1978 flag from
-- properties.built_before_1978, but that column doesn't exist. The flag
-- actually lives on leases.property_built_before_1978. Without this fix,
-- the function silently never attached the EPA pamphlet or lead
-- disclosure on pre-1978 leases.

CREATE OR REPLACE FUNCTION public.attach_standard_documents_for_lease(p_lease_id UUID)
RETURNS INTEGER AS $$
DECLARE
  manager_id     UUID;
  pre_1978       BOOLEAN;
  unit_state     TEXT;
  inserted_count INTEGER := 0;
BEGIN
  SELECT p.manager_id, UPPER(p.state), l.property_built_before_1978
    INTO manager_id, unit_state, pre_1978
    FROM public.leases l
    JOIN public.units u    ON u.id = l.unit_id
    JOIN public.properties p ON p.id = u.property_id
   WHERE l.id = p_lease_id;

  IF manager_id IS NULL THEN
    RETURN 0;
  END IF;
  IF unit_state IS DISTINCT FROM 'OH' THEN
    RETURN 0;
  END IF;

  INSERT INTO public.documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
  VALUES (
    p_lease_id, manager_id,
    'Your Ohio Tenant Rights (FindStoop summary)',
    'notice',
    'app://legal/ohio-tenant-rights?lease=' || p_lease_id,
    'oh_tenant_rights'
  )
  ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO public.documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
  VALUES (
    p_lease_id, manager_id,
    'Federal Fair Housing Act Notice',
    'notice',
    'app://legal/fair-housing-notice?lease=' || p_lease_id,
    'fair_housing_notice'
  )
  ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
  IF FOUND THEN inserted_count := inserted_count + 1; END IF;

  IF pre_1978 IS TRUE THEN
    INSERT INTO public.documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
    VALUES (
      p_lease_id, manager_id,
      'EPA Lead-Based Paint Pamphlet (Protect Your Family From Lead in Your Home)',
      'notice',
      'app://legal/lead-paint-pamphlet?lease=' || p_lease_id,
      'epa_lead_pamphlet'
    )
    ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
    IF FOUND THEN inserted_count := inserted_count + 1; END IF;

    INSERT INTO public.documents (lease_id, uploaded_by, name, type, storage_url, standard_doc_key)
    VALUES (
      p_lease_id, manager_id,
      'Lead-Based Paint Disclosure (federal — 24 CFR 35.92)',
      'notice',
      'app://legal/lead-disclosure/' || p_lease_id,
      'lead_disclosure'
    )
    ON CONFLICT (lease_id, standard_doc_key) WHERE standard_doc_key IS NOT NULL DO NOTHING;
    IF FOUND THEN inserted_count := inserted_count + 1; END IF;
  END IF;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
