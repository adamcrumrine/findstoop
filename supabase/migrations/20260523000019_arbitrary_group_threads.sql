-- Group conversations were originally one-per-lease, auto-created when the
-- second tenant joined. The manager now creates group threads manually and
-- picks any subset of tenants on a single lease, so:
--   * multiple group threads per lease must be allowed
--   * the auto-trigger that synced participants to ALL tenants on the lease
--     is removed (it would fight the picker)

DROP TRIGGER IF EXISTS lease_tenants_group_sync ON lease_tenants;
DROP FUNCTION IF EXISTS public.sync_group_conv_on_lease_tenants() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_group_conversation_for_lease(UUID) CASCADE;
DROP INDEX IF EXISTS uniq_group_conv_per_lease;

-- Manager-driven group creation. Verifies the caller is the lease's manager
-- and every selected tenant is on the lease (either as primary tenant or via
-- lease_tenants). Always includes the manager as a participant.
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  target_lease_id UUID,
  tenant_ids UUID[]
) RETURNS conversations AS $$
DECLARE
  manager_uuid UUID;
  tid UUID;
  bad_count INTEGER;
  conv conversations%ROWTYPE;
BEGIN
  IF array_length(tenant_ids, 1) IS NULL OR array_length(tenant_ids, 1) < 2 THEN
    RAISE EXCEPTION 'A group conversation needs at least 2 tenants';
  END IF;

  SELECT p.manager_id INTO manager_uuid
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE l.id = target_lease_id;
  IF manager_uuid IS NULL THEN RAISE EXCEPTION 'Lease not found'; END IF;
  IF manager_uuid <> auth.uid() THEN
    RAISE EXCEPTION 'Only the lease manager can create a group thread';
  END IF;

  SELECT COUNT(*) INTO bad_count FROM unnest(tenant_ids) AS tid
   WHERE NOT EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id = target_lease_id AND lt.tenant_id = tid)
     AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.id = target_lease_id AND l.tenant_id = tid);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'One or more selected tenants are not on this lease';
  END IF;

  INSERT INTO conversations (type, lease_id) VALUES ('group', target_lease_id)
  RETURNING * INTO conv;
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv.id, manager_uuid);
  FOREACH tid IN ARRAY tenant_ids LOOP
    INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv.id, tid)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN conv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(UUID, UUID[]) TO authenticated;
