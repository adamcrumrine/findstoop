export interface Message {
  id: string
  sender_id: string
  recipient_id: string | null
  lease_id: string | null
  conversation_id: string
  body: string
  image_url: string | null
  image_path: string | null
  image_purged_at: string | null
  read_at: string | null
  created_at: string
}

export type ConversationType = 'direct' | 'group'

export interface Conversation {
  id: string
  type: ConversationType
  manager_id: string | null
  tenant_id: string | null
  lease_id: string | null
  title: string | null
  created_at: string
}

export interface ConversationParticipant {
  conversation_id: string
  user_id: string
  last_read_at: string | null
}
