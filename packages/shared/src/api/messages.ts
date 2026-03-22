import { supabase } from '../lib/supabase'
import type { Message } from '../types/message'

export async function getUnreadMessageCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) return 0
  return count ?? 0
}

export async function getMessages(leaseId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('lease_id', leaseId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function sendMessage(
  senderId: string,
  recipientId: string,
  leaseId: string,
  body: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, lease_id: leaseId, body })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function markMessagesRead(leaseId: string, recipientId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('lease_id', leaseId)
    .eq('recipient_id', recipientId)
    .is('read_at', null)
}

export interface ConversationSummary {
  leaseId: string
  tenantId: string
  tenantName: string
  tenantEmail: string
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
}

export async function getConversationSummaries(unitIds: string[], managerId: string): Promise<ConversationSummary[]> {
  if (unitIds.length === 0) return []

  // Get active leases with tenant profiles for manager's units
  const { data: leases, error: leaseErr } = await supabase
    .from('leases')
    .select('id, tenant_id, profiles:tenant_id(id, full_name, email)')
    .in('unit_id', unitIds)
    .eq('status', 'active')
  if (leaseErr) throw new Error(leaseErr.message)
  if (!leases || leases.length === 0) return []

  const summaries: ConversationSummary[] = await Promise.all(
    leases.map(async (l: any) => {
      const profile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles

      // Last message in this thread
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('body, created_at')
        .eq('lease_id', l.id)
        .order('created_at', { ascending: false })
        .limit(1)

      // Unread count (messages sent to manager)
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('lease_id', l.id)
        .eq('recipient_id', managerId)
        .is('read_at', null)

      return {
        leaseId: l.id,
        tenantId: profile?.id ?? l.tenant_id,
        tenantName: profile?.full_name ?? 'Tenant',
        tenantEmail: profile?.email ?? '',
        lastMessage: lastMsgs?.[0]?.body ?? null,
        lastMessageAt: lastMsgs?.[0]?.created_at ?? null,
        unreadCount: count ?? 0,
      }
    })
  )

  return summaries.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0
    if (!a.lastMessageAt) return 1
    if (!b.lastMessageAt) return -1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })
}
