-- Conversations refactor.
--
-- Old model: messages keyed by lease_id with a hard-coded (sender, recipient)
-- pair. Worked only for 1:1 manager↔tenant, and gave one thread *per lease* —
-- so a tenant on two leases with the same manager had two distinct threads.
--
-- New model:
--   * conversations: thread root. Two kinds:
--       - 'direct' : exactly one row per (manager, tenant) pair. Uniqueness
--                    enforced by a partial unique index. Independent of leases.
--       - 'group'  : exactly one per lease that has ≥2 tenants, containing the
--                    manager + every tenant on that lease. Never crosses
--                    leases or properties.
--   * conversation_participants: who's in the thread. Carries last_read_at so
--     unread counts work in both modes.
--   * messages: now keyed by conversation_id. lease_id stays for back-compat
--     during migration but is no longer the source of truth.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  manager_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  lease_id    UUID REFERENCES leases(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 'direct' has manager + tenant, no lease. 'group' has lease, no direct pair.
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_shape;
ALTER TABLE conversations ADD CONSTRAINT conversations_shape CHECK (
  (type = 'direct' AND manager_id IS NOT NULL AND tenant_id IS NOT NULL AND lease_id IS NULL)
  OR
  (type = 'group'  AND lease_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_direct_conv
  ON conversations(manager_id, tenant_id) WHERE type = 'direct';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_group_conv_per_lease
  ON conversations(lease_id) WHERE type = 'group';

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cparts_user ON conversation_participants(user_id);

-- ── messages.conversation_id ───────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE messages ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN lease_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- For every (manager, tenant) pair that has a lease (any status), create a
-- 'direct' conversation, populate participants, then point every existing
-- message at that conversation.

WITH pairs AS (
  SELECT DISTINCT p.manager_id, l.tenant_id
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE l.tenant_id IS NOT NULL
)
INSERT INTO conversations (type, manager_id, tenant_id)
SELECT 'direct', pairs.manager_id, pairs.tenant_id
FROM pairs
ON CONFLICT (manager_id, tenant_id) WHERE type = 'direct' DO NOTHING;

INSERT INTO conversation_participants (conversation_id, user_id)
SELECT c.id, c.manager_id FROM conversations c WHERE c.type = 'direct'
ON CONFLICT DO NOTHING;
INSERT INTO conversation_participants (conversation_id, user_id)
SELECT c.id, c.tenant_id  FROM conversations c WHERE c.type = 'direct'
ON CONFLICT DO NOTHING;

-- Point every existing message at the (manager, tenant) direct conversation
-- for its lease.
UPDATE messages m
SET conversation_id = c.id
FROM leases l
JOIN units u ON u.id = l.unit_id
JOIN properties p ON p.id = u.property_id
JOIN conversations c
  ON c.type = 'direct'
 AND c.manager_id = p.manager_id
 AND c.tenant_id = l.tenant_id
WHERE m.lease_id = l.id
  AND m.conversation_id IS NULL;

-- Anything stranded (lease deleted, sender↔recipient still valid) — best-effort
-- pair the message by (sender, recipient) into a direct conversation, creating
-- it if missing. Caller may be either side, so try both orderings.
INSERT INTO conversations (type, manager_id, tenant_id)
SELECT 'direct',
  COALESCE(p1.id, p2.id),  -- manager profile
  COALESCE(p2.id, p1.id)   -- tenant profile
FROM messages m
JOIN profiles p1 ON p1.id = m.sender_id
JOIN profiles p2 ON p2.id = m.recipient_id
WHERE m.conversation_id IS NULL
  AND m.recipient_id IS NOT NULL
  AND ((p1.role IN ('manager','admin') AND p2.role = 'tenant')
       OR (p2.role IN ('manager','admin') AND p1.role = 'tenant'))
ON CONFLICT DO NOTHING;

UPDATE messages m
SET conversation_id = c.id
FROM conversations c, profiles s, profiles r
WHERE c.type = 'direct'
  AND s.id = m.sender_id
  AND r.id = m.recipient_id
  AND m.conversation_id IS NULL
  AND ((c.manager_id = s.id AND c.tenant_id = r.id)
       OR (c.manager_id = r.id AND c.tenant_id = s.id));

-- Group conversations for leases with ≥2 tenants in lease_tenants. We need
-- this to exist BEFORE the trigger below fires on inserts.
INSERT INTO conversations (type, lease_id, title)
SELECT 'group', lt.lease_id, NULL
FROM lease_tenants lt
GROUP BY lt.lease_id
HAVING COUNT(*) >= 2
ON CONFLICT (lease_id) WHERE type = 'group' DO NOTHING;

-- Group participants: every tenant on the lease + the manager.
INSERT INTO conversation_participants (conversation_id, user_id)
SELECT c.id, lt.tenant_id
FROM conversations c
JOIN lease_tenants lt ON lt.lease_id = c.lease_id
WHERE c.type = 'group'
ON CONFLICT DO NOTHING;

INSERT INTO conversation_participants (conversation_id, user_id)
SELECT c.id, p.manager_id
FROM conversations c
JOIN leases l ON l.id = c.lease_id
JOIN units u ON u.id = l.unit_id
JOIN properties p ON p.id = u.property_id
WHERE c.type = 'group'
ON CONFLICT DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Read your conversations.
DROP POLICY IF EXISTS "conversations_select_participant" ON conversations;
CREATE POLICY "conversations_select_participant" ON conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid())
  );

-- Read participant rows for your conversations.
DROP POLICY IF EXISTS "cparts_select_in_conv" ON conversation_participants;
CREATE POLICY "cparts_select_in_conv" ON conversation_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM conversation_participants self WHERE self.conversation_id = conversation_participants.conversation_id AND self.user_id = auth.uid())
  );

-- Update your own last_read_at.
DROP POLICY IF EXISTS "cparts_update_own" ON conversation_participants;
CREATE POLICY "cparts_update_own" ON conversation_participants
  FOR UPDATE USING (user_id = auth.uid());

-- New messages RLS (replaces lease-keyed policies). Keep old policies in
-- place so existing code paths keep working until refactor lands.
DROP POLICY IF EXISTS "messages_select_by_conv" ON messages;
CREATE POLICY "messages_select_by_conv" ON messages
  FOR SELECT USING (
    conversation_id IS NULL
    OR EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "messages_insert_by_conv" ON messages;
CREATE POLICY "messages_insert_by_conv" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    (conversation_id IS NULL OR EXISTS (
      SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
    ))
  );

-- ── Find-or-create RPCs ─────────────────────────────────────────────────────

-- 1:1 between the caller (manager) and the given tenant. Verifies they have
-- at least one shared lease (caller is the manager on a property the tenant
-- has a lease on). Idempotent — returns the existing row if one exists.
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_user_id UUID)
RETURNS conversations AS $$
DECLARE
  me_role TEXT;
  other_role TEXT;
  manager_uuid UUID;
  tenant_uuid UUID;
  conv conversations%ROWTYPE;
  has_link BOOLEAN;
BEGIN
  IF other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot start a conversation with yourself';
  END IF;

  SELECT role INTO me_role FROM profiles WHERE id = auth.uid();
  SELECT role INTO other_role FROM profiles WHERE id = other_user_id;
  IF me_role IS NULL OR other_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF me_role IN ('manager','admin') AND other_role = 'tenant' THEN
    manager_uuid := auth.uid();
    tenant_uuid  := other_user_id;
  ELSIF other_role IN ('manager','admin') AND me_role = 'tenant' THEN
    manager_uuid := other_user_id;
    tenant_uuid  := auth.uid();
  ELSE
    RAISE EXCEPTION 'Direct conversations are between a manager and one of their tenants';
  END IF;

  -- Must have at least one shared lease, ever.
  SELECT EXISTS (
    SELECT 1 FROM leases l
    JOIN units u ON u.id = l.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE p.manager_id = manager_uuid AND l.tenant_id = tenant_uuid
  ) INTO has_link;
  IF NOT has_link THEN
    RAISE EXCEPTION 'No shared lease — cannot start a conversation';
  END IF;

  SELECT * INTO conv FROM conversations
   WHERE type='direct' AND manager_id=manager_uuid AND tenant_id=tenant_uuid;
  IF FOUND THEN
    RETURN conv;
  END IF;

  INSERT INTO conversations (type, manager_id, tenant_id)
  VALUES ('direct', manager_uuid, tenant_uuid)
  RETURNING * INTO conv;

  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv.id, manager_uuid);
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv.id, tenant_uuid);
  RETURN conv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(UUID) TO authenticated;

-- Ensure a group conversation exists for a multi-tenant lease, and that its
-- participants exactly match the current lease_tenants set + the manager.
-- Called by the lease_tenants trigger below + on demand.
CREATE OR REPLACE FUNCTION public.ensure_group_conversation_for_lease(target_lease_id UUID)
RETURNS conversations AS $$
DECLARE
  manager_uuid UUID;
  tenant_count INTEGER;
  conv conversations%ROWTYPE;
BEGIN
  SELECT p.manager_id INTO manager_uuid
  FROM leases l
  JOIN units u ON u.id = l.unit_id
  JOIN properties p ON p.id = u.property_id
  WHERE l.id = target_lease_id;
  IF manager_uuid IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO tenant_count FROM lease_tenants WHERE lease_id = target_lease_id;

  SELECT * INTO conv FROM conversations WHERE type='group' AND lease_id = target_lease_id;

  -- Only create when we hit the 2-tenant threshold.
  IF NOT FOUND AND tenant_count >= 2 THEN
    INSERT INTO conversations (type, lease_id) VALUES ('group', target_lease_id)
    RETURNING * INTO conv;
    INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv.id, manager_uuid);
  END IF;

  -- Sync participants to current tenant set.
  IF conv.id IS NOT NULL THEN
    INSERT INTO conversation_participants (conversation_id, user_id)
    SELECT conv.id, lt.tenant_id FROM lease_tenants lt WHERE lt.lease_id = target_lease_id
    ON CONFLICT DO NOTHING;
    -- Drop tenants no longer on the lease (but never the manager).
    DELETE FROM conversation_participants cp
    WHERE cp.conversation_id = conv.id
      AND cp.user_id <> manager_uuid
      AND NOT EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id = target_lease_id AND lt.tenant_id = cp.user_id);
  END IF;

  RETURN conv;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.ensure_group_conversation_for_lease(UUID) TO authenticated;

-- Trigger: any insert/delete on lease_tenants re-syncs the group conversation.
CREATE OR REPLACE FUNCTION public.sync_group_conv_on_lease_tenants()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.ensure_group_conversation_for_lease(OLD.lease_id);
  ELSE
    PERFORM public.ensure_group_conversation_for_lease(NEW.lease_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS lease_tenants_group_sync ON lease_tenants;
CREATE TRIGGER lease_tenants_group_sync
  AFTER INSERT OR DELETE ON lease_tenants
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_conv_on_lease_tenants();

-- ── Chat image attachments ──────────────────────────────────────────────────
-- One optional image per message. Storage object lives in the 'chat-images'
-- bucket; the row carries the bucket path so the purge job can find + delete
-- the object without parsing URLs.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url   TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_path  TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_purged_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — only conversation participants can read or write into the
-- folder prefixed by the conversation_id. Object paths must follow:
--   {conversation_id}/{message_id_or_uuid}.{ext}
DROP POLICY IF EXISTS "chat_images_participant_read" ON storage.objects;
CREATE POLICY "chat_images_participant_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversation_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "chat_images_participant_write" ON storage.objects;
CREATE POLICY "chat_images_participant_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversation_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "chat_images_participant_delete" ON storage.objects;
CREATE POLICY "chat_images_participant_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chat-images'
    AND EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.user_id = auth.uid()
        AND cp.conversation_id::text = (storage.foldername(name))[1]
    )
  );

-- Purge job — runs daily via Supabase cron edge function. Deletes the storage
-- object first, then nulls out image_url/image_path on the message and stamps
-- image_purged_at so the UI can show "Image expired (older than 12 months)".
-- We keep the message itself so the conversation history isn't shredded.
CREATE OR REPLACE FUNCTION public.purge_expired_chat_images()
RETURNS INTEGER AS $$
DECLARE
  purged_count INTEGER := 0;
  m RECORD;
BEGIN
  FOR m IN
    SELECT id, image_path FROM messages
    WHERE image_path IS NOT NULL
      AND image_purged_at IS NULL
      AND created_at < (NOW() - INTERVAL '12 months')
  LOOP
    -- Try to delete the object; tolerate already-missing.
    BEGIN
      DELETE FROM storage.objects WHERE bucket_id = 'chat-images' AND name = m.image_path;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    UPDATE messages SET image_url = NULL, image_path = NULL, image_purged_at = NOW() WHERE id = m.id;
    purged_count := purged_count + 1;
  END LOOP;
  RETURN purged_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.purge_expired_chat_images() TO service_role;
