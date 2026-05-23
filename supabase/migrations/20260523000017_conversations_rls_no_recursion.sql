-- Fix: the participant-based RLS policies on conversations + messages used an
-- EXISTS subquery against conversation_participants, and the SELECT policy on
-- conversation_participants ALSO did an EXISTS against itself for the "see
-- co-participants" case. Postgres detected infinite recursion and refused
-- every read.
--
-- Replace those EXISTS chains with a SECURITY DEFINER helper that bypasses RLS
-- inside its own body. Functionally identical, no recursion.

CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id AND user_id = uid
  )
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "cparts_select_in_conv" ON conversation_participants;
CREATE POLICY "cparts_select_in_conv" ON conversation_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_conversation_participant(conversation_participants.conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "conversations_select_participant" ON conversations;
CREATE POLICY "conversations_select_participant" ON conversations
  FOR SELECT USING (public.is_conversation_participant(conversations.id, auth.uid()));

DROP POLICY IF EXISTS "messages_select_by_conv" ON messages;
CREATE POLICY "messages_select_by_conv" ON messages
  FOR SELECT USING (
    conversation_id IS NULL
    OR public.is_conversation_participant(messages.conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "messages_insert_by_conv" ON messages;
CREATE POLICY "messages_insert_by_conv" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    (conversation_id IS NULL OR public.is_conversation_participant(messages.conversation_id, auth.uid()))
  );
