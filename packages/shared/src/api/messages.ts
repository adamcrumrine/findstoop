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
