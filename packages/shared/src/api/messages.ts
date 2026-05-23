import { supabase } from '../lib/supabase'
import type { Conversation, Message } from '../types/message'

// ── Conversation read helpers ───────────────────────────────────────────────

export interface ConversationSummary {
  conversationId: string
  type: 'direct' | 'group'
  leaseId: string | null
  // Display info — for 'direct', the other party; for 'group', the lease title.
  displayName: string
  subtitle: string | null
  avatarUrl: string | null
  participantIds: string[]
  // Other-party id for direct convs (used to deep-link by tenantId on manager side).
  otherUserId: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

interface RawConversation {
  id: string
  type: 'direct' | 'group'
  manager_id: string | null
  tenant_id: string | null
  lease_id: string | null
  title: string | null
  created_at: string
  participants: Array<{
    user_id: string
    last_read_at: string | null
    profile: {
      id: string
      full_name: string | null
      email: string | null
      avatar_url: string | null
      role: string | null
      company_name: string | null
      company_logo_url: string | null
    } | null
  }>
  lease?: {
    unit?: { unit_number: string | null; properties?: { name: string | null } | null } | null
  } | null
}

// Pulls every conversation the caller participates in (RLS scoped) and rolls
// each one up to a UI-ready summary.
export async function getConversationSummaries(currentUserId: string): Promise<ConversationSummary[]> {
  const { data: convs, error } = await supabase
    .from('conversations')
    .select(`
      id, type, manager_id, tenant_id, lease_id, title, created_at,
      participants:conversation_participants(
        user_id, last_read_at,
        profile:profiles(id, full_name, email, avatar_url, role, company_name, company_logo_url)
      ),
      lease:leases(unit:units(unit_number, properties(name)))
    `)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  if (!convs) return []

  const summaries = await Promise.all((convs as unknown as RawConversation[]).map(async (c) => {
    // Resolve the participant rows (PostgREST returns the join as an array of objects).
    const parts = c.participants ?? []
    const others = parts.filter((p) => p.user_id !== currentUserId)

    let displayName = c.title ?? 'Conversation'
    let subtitle: string | null = null
    let avatarUrl: string | null = null
    let otherUserId: string | null = null

    if (c.type === 'direct') {
      const other = others[0]?.profile ?? null
      // When the other party is a manager, prefer their company brand so
      // tenants see "Acme Property Management" instead of "Jane Smith".
      const isManagerOther = other?.role === 'manager' || other?.role === 'admin'
      const companyName = (other?.company_name ?? '').trim() || null
      const companyLogo = other?.company_logo_url ?? null
      displayName = (isManagerOther && companyName) ? companyName : (other?.full_name ?? other?.email ?? 'Conversation')
      subtitle = isManagerOther && companyName && other?.full_name ? other.full_name : (other?.email ?? null)
      avatarUrl = (isManagerOther && companyLogo) ? companyLogo : (other?.avatar_url ?? null)
      otherUserId = others[0]?.user_id ?? null
    } else {
      const propertyName = c.lease?.unit?.properties?.name ?? null
      const unitNumber = c.lease?.unit?.unit_number ?? null
      displayName = propertyName ? `${propertyName} · Unit ${unitNumber ?? '—'}` : 'Lease group chat'
      const names = others.map((p) => p.profile?.full_name ?? p.profile?.email ?? 'Someone')
      subtitle = names.length > 0 ? `with ${names.join(', ')}` : 'Group thread'
    }

    const { data: lastMsg } = await supabase
      .from('messages')
      .select('body, image_url, created_at')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const mine = parts.find((p) => p.user_id === currentUserId)
    const lastReadAt = mine?.last_read_at ?? null
    let unreadCount = 0
    if (lastMsg?.created_at && (!lastReadAt || new Date(lastMsg.created_at) > new Date(lastReadAt))) {
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', c.id)
        .neq('sender_id', currentUserId)
        .gt('created_at', lastReadAt ?? '1970-01-01')
      unreadCount = count ?? 0
    }

    const lastBody = lastMsg?.body
      ? lastMsg.body
      : lastMsg?.image_url ? '[image]' : null

    return {
      conversationId: c.id,
      type: c.type,
      leaseId: c.lease_id,
      displayName,
      subtitle,
      avatarUrl,
      participantIds: parts.map((p) => p.user_id),
      otherUserId,
      lastMessage: lastBody,
      lastMessageAt: lastMsg?.created_at ?? null,
      unreadCount,
    } as ConversationSummary
  }))

  return summaries.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0
    if (!a.lastMessageAt) return 1
    if (!b.lastMessageAt) return -1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Message[]
}

export async function sendMessage(
  senderId: string,
  conversationId: string,
  body: string,
  image?: { url: string; path: string } | null,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      conversation_id: conversationId,
      body,
      image_url: image?.url ?? null,
      image_path: image?.path ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Message
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
}

// Cross-app unread-badge total: sum of unread per conversation, capped to
// a single round-trip. Uses the last_read_at on each participant row.
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const { data: parts } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', userId)
  if (!parts || parts.length === 0) return 0
  let total = 0
  await Promise.all(parts.map(async (p) => {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', p.conversation_id)
      .neq('sender_id', userId)
      .gt('created_at', (p as { last_read_at: string | null }).last_read_at ?? '1970-01-01')
    total += count ?? 0
  }))
  return total
}

export async function findOrCreateDirectConversation(otherUserId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc('find_or_create_direct_conversation', { other_user_id: otherUserId })
  if (error) throw new Error(error.message)
  return data as Conversation
}

export async function createGroupConversation(leaseId: string, tenantIds: string[]): Promise<Conversation> {
  const { data, error } = await supabase.rpc('create_group_conversation', {
    target_lease_id: leaseId,
    tenant_ids: tenantIds,
  })
  if (error) throw new Error(error.message)
  return data as Conversation
}

// ── Chat image upload ───────────────────────────────────────────────────────
// Path convention: {conversationId}/{uuid}.{ext} — matches the storage RLS.
export async function uploadChatImage(conversationId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const uuid = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${conversationId}/${uuid}.${ext}`
  const { error: upErr } = await supabase.storage.from('chat-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/png',
  })
  if (upErr) throw new Error(upErr.message)
  // Bucket is private — generate a long-lived signed URL (24h) for display.
  const { data: signed, error: sErr } = await supabase.storage.from('chat-images').createSignedUrl(path, 60 * 60 * 24)
  if (sErr || !signed) throw new Error(sErr?.message ?? 'Could not sign image URL')
  return { url: signed.signedUrl, path }
}

// Re-sign an existing image when the cached signed URL expires.
export async function signChatImage(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('chat-images').createSignedUrl(path, 60 * 60 * 24)
  if (error || !data) return null
  return data.signedUrl
}
